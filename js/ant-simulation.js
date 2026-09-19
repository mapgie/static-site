// ant-farm — main loop & per-tick simulation
'use strict';

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
function animate() {
  if (envDirty) rebuildEnvGrid();
  ctx.setTransform(1, 0, 0, 1, 0, 0);          // clear in screen space
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  applyViewTransform();                        // then draw the world through the pan/zoom
  drawRooms();
  drawEnvironment();
  drawEggs();
  if (showSpawnPoints || maintenance) drawSpawnPoints(maintenance);
  drawFoods();
  drawPheromones();

  if (!animationPaused) {
    if (autoFood) autoDropFood();
    if (worldBuilding) { planNest(false); planNest(true); updateThreats(); }  // both colonies build; main defends
    maybeSadistPoison();   // Sadist-only hazard, independent of the living-world food toggle
    updateFoods();
    updateAnts();
    updatePheromones();
    updateEggs();
    updateQueens();
    whiteCalmMs += TICK_MS;
  }
  aggregateHappiness();
  updateHappinessBars();

  if (queens.white) drawAnt(queens.white);
  if (queens.red)   drawAnt(queens.red);
  for (const a of ants) drawAnt(a);

  ctx.setTransform(1, 0, 0, 1, 0, 0);          // chrome sits over the map, unscaled
  if (maintenance) drawMaintenanceBanner();

  if ((statsTimer += TICK_MS) >= 250) { statsTimer = 0; updateStats(); }
  requestAnimationFrame(animate);
}

// ---------------------------------------------------------------------------
// Auto food (the default "living world"): drops rain at random, weighted by
// rarity — sugar often, protein seldom, a dead insect a rare treat.
// ---------------------------------------------------------------------------
function pickAutoFood() {
  const entries = Object.entries(AUTO_FOOD_WEIGHTS);
  let r = Math.random() * entries.reduce((s, [, w]) => s + w, 0);
  for (const [type, w] of entries) if ((r -= w) < 0) return type;
  return 'sugar';
}

function autoDropFood() {
  // Don't rain food while paused or when the world is empty; reset the timer so
  // adding the first ant doesn't trigger an instant dump.
  if (animationPaused || ants.length === 0) { autoFoodTimer = 0; return; }
  autoFoodTimer += TICK_MS;
  if (autoFoodTimer < autoFoodNext) return;
  autoFoodTimer = 0;
  // Feed the colony in proportion to its size: a big colony gets more frequent and
  // bigger drops so it doesn't simply starve, while a small one keeps the occasional
  // sparse drip. (The loose-food cap in addFood still bounds the clutter.)
  const pop = ants.length;
  const rate = clamp(pop / 10, 1, 12);                       // up to 12× more often
  autoFoodNext = (AUTO_FOOD_MS / rate) * (0.6 + Math.random() * 0.8);
  if (!canvas) return;
  const batch = clamp(Math.round(pop / 12), 1, 12);          // and up to a dozen pieces at once
  const spots = [...spawnPoints.yellow, ...spawnPoints.red];
  for (let n = 0; n < batch; n++) {
    if (foods.length >= MAX_FOOD) break;
    // Most drops land within a colony's foraging range so the ants can actually reach
    // them; some still fall out in the open. Food scattered clear across the board
    // never gets collected, and the colony starves beside a full map.
    const near = spots.length && Math.random() < 0.75 ? spots[(Math.random() * spots.length) | 0] : null;
    for (let tries = 0; tries < 8; tries++) {
      let x, y;
      if (near) {
        const ang = Math.random() * Math.PI * 2, rad = near.r + 30 + Math.random() * FORAGE_REACH;
        x = clamp(near.x + Math.cos(ang) * rad, 0, canvas.width);
        y = clamp(near.y + Math.sin(ang) * rad, 0, canvas.height);
      } else {
        x = Math.random() * canvas.width; y = Math.random() * canvas.height;
      }
      if (foodSpawnAllowed(x, y)) { addFood(x, y, pickAutoFood(), { size: 5 }); break; }
    }
  }
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
// A one-off happy moment for an ant, scaled by its temperament and (for the
// antagonist) the smaller-boost factor.
function bumpHappiness(ant, amount) {
  const scaled = amount * ant.temperament * (ant.isRed ? TUNE.RED_FACTOR : 1);
  ant.happiness = clamp(ant.happiness + scaled, 0, 100);
}

// A setback. Losses land on both colonies equally (no antagonist scaling).
function dropHappiness(ant, amount) {
  ant.happiness = clamp(ant.happiness - amount * ant.temperament, 0, 100);
}

// A death dents the mood of colony-mates who were near enough to witness it.
function moraleHit(x, y, isRed, amount) {
  const r2 = TUNE.WITNESS_RADIUS * TUNE.WITNESS_RADIUS;
  for (const o of ants) {
    if (o.isRed === isRed && dist2(o.x, o.y, x, y) < r2) dropHappiness(o, amount);
  }
}

// A colony-wide setback (e.g. its queen departing).
function colonyMorale(isRed, amount) {
  for (const o of ants) if (o.isRed === isRed) dropHappiness(o, amount);
}

// How much of its mood a colony can actually express, by size. A lone ant tops
// out near 0.5; it rises to 1.0 at the ideal capacity; past capacity,
// overpopulation eases it back down toward a floor.
function populationFactor(count) {
  const cap = Math.max(2, TUNE.POP_CAPACITY);
  if (count <= 1) return 0.5;
  if (count <= cap) return 0.5 + 0.5 * (count - 1) / (cap - 1);
  return clamp(1 - 0.6 * (count - cap) / cap, 0.35, 1);
}

// Each colony's bar is its average mood scaled by how well-sized the colony is,
// so two content ants read as ~50% and a colony at capacity can reach 100%.
function aggregateHappiness() {
  let ws = 0, wn = 0, rs = 0, rn = 0;
  for (const a of ants) {
    if (a.isRed) { rs += a.happiness; rn++; }
    else         { ws += a.happiness; wn++; }
  }
  whiteHappiness = wn ? (ws / wn) * populationFactor(wn) : 50;
  redHappiness   = rn ? (rs / rn) * populationFactor(rn) : 50;
}

// Loose food is worth picking up; delivered food is worth eating, unless this
// ant is one of those that brought it in.
function nearestFood(ant, range = SENSE_FOOD) {
  let best = null, bd = range * range;
  const hungry = ant.fullness < ant.hungerPoint;
  for (const f of foods) {
    if (f.delivered) {
      if (f.team === ant.isRed) {
        if (foundByAnt(f, ant)) continue;   // its own store, but not a piece it hauled in
        if (!hungry) continue;              // leave one's own store alone until hungry
      } else {
        // An enemy store: only reachable from inside the pantry, but a raider will
        // take it whether hungry (eat) or not (steal and haul it home).
        if (dist2(f.x, f.y, ant.x, ant.y) > RAID_RANGE * RAID_RANGE) continue;
      }
    }
    if (f.type === 'insect' && !f.delivered) {
      if (ant.haulCooldown > 0) continue;                       // just gave up on one
      if (f.haulers.length && f.team !== ant.isRed) continue;   // one colour per team
    }
    const d = dist2(f.x, f.y, ant.x, ant.y);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

// Nearest loose (undelivered) food an ant could eat on the spot — sugar/fruit/protein
// within range, no carcasses (those need a team) and never poison/spoiled.
function nearestFreshFood(ant, range = SENSE_FOOD) {
  let best = null, bd = range * range;
  for (const f of foods) {
    if (f.delivered) continue;
    if (f.type !== 'sugar' && f.type !== 'fruit' && f.type !== 'protein') continue;
    const d = dist2(f.x, f.y, ant.x, ant.y);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function nearestWhiteAnt(ant) {
  let best = null, bd = SENSE_PREY * SENSE_PREY;
  for (const o of ants) {
    if (o.isRed) continue;
    const d = dist2(o.x, o.y, ant.x, ant.y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

// Pick prey for a hunting rival, spreading the pack: prefer the nearest white that
// isn't already being chased by MAX_PURSUERS rivals, so they don't all swarm one
// ant. `pursuers` tallies picks across this tick; falls back to the plain nearest
// once every nearby target is spoken for.
function pickPrey(ant, pursuers) {
  let best = null, bd = SENSE_PREY * SENSE_PREY;
  for (const o of ants) {
    if (o.isRed || (pursuers.get(o.id) || 0) >= MAX_PURSUERS) continue;
    const d = dist2(o.x, o.y, ant.x, ant.y);
    if (d < bd) { bd = d; best = o; }
  }
  // If every nearby target already has its share of hunters, this rival does NOT
  // pile on — it returns empty and falls through to foraging, so a lone ant isn't
  // swarmed by the whole pack.
  if (best) pursuers.set(best.id, (pursuers.get(best.id) || 0) + 1);
  return best;
}

// The strongest pheromone of a given kind within range of an ant. Foraging reads
// 'trail'; the danger response reads 'danger'. Kind-less legacy marks read as
// 'trail' so an old save still steers ants along its scent.
function strongestPheromone(ant, kind, range) {
  let best = null, bs = 0.05;
  const r2 = range * range;
  for (const p of pheromones) {
    if ((p.kind || 'trail') !== kind) continue;
    if (p.strength > bs && dist2(p.x, p.y, ant.x, ant.y) < r2) { bs = p.strength; best = p; }
  }
  return best;
}

function strongestTrail(ant) { return strongestPheromone(ant, 'trail', SENSE_TRAIL); }

// The strongest food trail near an ant that leads OUTWARD (farther from home than the
// ant is now) — so a searching forager walks the lane toward the find, not back to
// the nest. This directional following is what turns a scent into a marching column.
function outwardTrail(ant) {
  const home = nestAnchor(ant.isRed);
  const dHome = dist2(home.x, home.y, ant.x, ant.y);
  const r2 = SENSE_TRAIL * SENSE_TRAIL;
  let best = null, bs = 0.15;
  for (const p of pheromones) {
    if ((p.kind || 'trail') !== 'trail' || p.strength <= bs) continue;
    if (dist2(p.x, p.y, ant.x, ant.y) >= r2) continue;
    if (dist2(home.x, home.y, p.x, p.y) <= dHome) continue;   // must be farther out than the ant
    bs = p.strength; best = p;
  }
  return best;
}

// How a main-colony ant answers a danger scent. Rivals are the aggressors and
// never react. Everyone flees by default; a strong, steady colony instead rallies
// home ('swarm') when the danger is laid at its own nest or queen. (Standing and
// fighting, and walling off a breach, come with combat and construction later —
// for now swarm just pulls defenders back to the nest.)
function dangerReaction(ant, danger) {
  if (ant.isRed || ant.isQueen) return 'flee';
  let whites = 0;
  for (const o of ants) if (!o.isRed) whites++;
  const strong = whites >= TUNE.QUEEN_MIN_ANTS && ant.happiness >= SWARM_MIN_MOOD;
  if (!strong) return 'flee';
  const r2 = NEST_DEFEND_R * NEST_DEFEND_R;
  let nestAtRisk = queens.white && dist2(queens.white.x, queens.white.y, danger.x, danger.y) < r2;
  if (!nestAtRisk) {
    for (const s of colonySpawnPoints(false)) {
      if (dist2(s.x, s.y, danger.x, danger.y) < r2) { nestAtRisk = true; break; }
    }
  }
  return nestAtRisk ? 'swarm' : 'flee';
}

// The wall block an idle builder should work next. Emergency barricades come
// first (urgent, and they bypass the builder cap); otherwise the nearest undug
// site of the colony's lowest-order unbuilt room — ring before tunnel — so the
// entry goes up before the pantry, the pantry before the nursery, and so on.
function nearestUndug(a, sites) {
  let best = null, bd = BUILD_SENSE * BUILD_SENSE;
  for (const s of sites) {
    if (s.done) continue;
    const d = dist2(s.x, s.y, a.x, a.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}
function buildTaskFor(a) {
  if (!worldBuilding || a.isQueen) return null;
  const team = a.isRed;
  // The nest is planned from the start but stays a hidden blueprint until the
  // colony is big enough — no digging (and nothing drawn) below the build threshold.
  if ((team ? countRedAnts() : countWhiteAnts()) < MIN_BUILD_ANTS) return null;
  // 1) Seal a breached doorway, wherever it is — this can't wait.
  for (const room of rooms) {
    if (room.team !== team || !room.barricadeSites) continue;
    const s = nearestUndug(a, room.barricadeSites);
    if (s) return { room, site: s, urgent: true };
  }
  // 2) Raise the structure. Each builder works the NEAREST unbuilt room (corridor
  //    first, so a room is only walled once it's connected) — this spreads builders
  //    across every unfinished room instead of piling the whole colony onto one, so
  //    a multi-room nest actually gets built in parallel.
  let best = null, bestSite = null, bd = Infinity;
  for (const room of rooms) {
    if (room.team !== team || room.built) continue;
    const s = nearestUndug(a, room.tunnelSites || []) || nearestUndug(a, room.sites);
    if (!s) continue;
    const d = dist2(room.x, room.y, a.x, a.y);
    if (d < bd) { bd = d; best = room; bestSite = s; }
  }
  return best ? { room: best, site: bestSite, urgent: false } : null;
}

// Ages fruit → spoiled → (Sadist only) poison. Returns true when the piece should
// be removed from the world entirely: in the ordinary living world spoiled food
// finally rots away to nothing rather than piling up forever.
function decay(f) {
  if (f.type !== 'fruit' && f.type !== 'spoiled') return false;
  f.age = (f.age || 0) + TICK_MS;
  if (f.age < decayStageMs()) return false;
  f.age = 0;
  if (f.type === 'fruit') { f.type = 'spoiled'; return false; }
  // Spoiled: rots on into poison under Sadist mode; otherwise it crumbles away.
  if (sadistMode) { f.type = 'poison'; return false; }
  return true;
}

// Sadist mode only: once the main colony is thriving (a sustained queen at high
// spirits), the sadist rarely seeds a poison drop to spoil the good times.
function maybeSadistPoison() {
  if (!sadistMode || !queens.white || whiteHappiness < TUNE.QUEEN_HIGH) { poisonReadyMs = 0; return; }
  poisonReadyMs += TICK_MS;
  if (poisonReadyMs < POISON_SUSTAIN_MS) return;
  poisonReadyMs = 0;                              // wait out another full spell before the next
  if (Math.random() > POISON_SPAWN_CHANCE) return;
  if (foods.length >= MAX_FOOD || !canvas) return;
  for (let t = 0; t < 8; t++) {
    const x = Math.random() * canvas.width, y = Math.random() * canvas.height;
    if (foodSpawnAllowed(x, y)) { addFood(x, y, 'poison', { size: 5 }); break; }
  }
}

function joinTeam(ant, f) {
  if (!f.haulers.length) f.team = ant.isRed;
  f.haulers.push(ant.id);
  ant.hauling = f;
  ant.carrying = null;
  layPheromone(ant.x, ant.y);    // call for help
}

function leaveTeam(ant) {
  const f = ant.hauling;
  if (f && f.haulers) {
    const i = f.haulers.indexOf(ant.id);
    if (i !== -1) f.haulers.splice(i, 1);
  }
  ant.hauling = null;
}

// Drop hauler ids that no longer belong to a living ant (after a cull or load).
function pruneHaulers() {
  const alive = new Set(ants.map(a => a.id));
  for (const f of foods) if (f.haulers) f.haulers = f.haulers.filter(id => alive.has(id));
}

// Pheromones evaporate every tick (game logic, not just rendering): a trail nobody
// refreshes fades away, so lanes track where the food actually is.
function updatePheromones() {
  let w = 0;
  for (const p of pheromones) {
    p.strength -= (p.kind === 'danger') ? DANGER_EVAP : TRAIL_EVAP;
    if (p.strength > 0) pheromones[w++] = p;
  }
  pheromones.length = w;
}

function updateFoods() {
  // Age everything; drop loose pieces that have finally rotted away (carried and
  // being-hauled pieces are left alone so nothing vanishes out of an ant's grip).
  foods = foods.filter(f => !(decay(f) && !f.haulers?.length));

  let byId = null;
  for (const f of foods) {
    if (f.type !== 'insect' || f.delivered || !f.haulers.length) continue;
    if (!byId) byId = new Map(ants.map(a => [a.id, a]));
    const team = f.haulers.map(id => byId.get(id)).filter(Boolean);

    if (team.length >= INSECT_HAULERS) {
      f.waited = 0;
      const store = builtRoom(f.team, 'pantry');
      const aim = haulHomeAim(f.team, f.x, f.y);
      // Reached the nest (through the entry, or into any built room): counted home.
      // The carcass is then STORED in the pantry — never left in the nursery/throne.
      const home = insideMyBuiltRoom(f.team, f.x, f.y) ||
                   dist2(aim.x, aim.y, f.x, f.y) < (INSECT_RADIUS + EAT_RANGE) * (INSECT_RADIUS + EAT_RANGE);
      if (home) {
        // Delivered: drop the carcass at the pantry (or spawn, before one exists) —
        // the whole team counts as finders, none of them may eat it.
        const spot = store || nearestSpawnPoint(f.team, f.x, f.y);
        f.x = spot.x; f.y = spot.y;
        f.delivered = true;
        f.foundBy = f.haulers.slice();
        for (const a of team) a.hauling = null;
        f.haulers = []; f.dropOffset = null; f.stuck = 0;
        continue;
      }
      f.heading = Math.atan2(aim.y - f.y, aim.x - f.x);
      const speed = Math.min(1, 0.3 + 0.1 * team.length);
      const nx = f.x + Math.cos(f.heading) * speed, ny = f.y + Math.sin(f.heading) * speed;
      if (collidesWall(nx, ny)) {
        // Jammed against a wall: after a spell the team gives up and leaves the
        // carcass where it is, to be found again, rather than grinding forever.
        if (++f.stuck > HAUL_STUCK_DROP) {
          for (const a of team) { a.hauling = null; a.haulCooldown = HAUL_COOLDOWN; }
          f.haulers = []; f.stuck = 0; f.waited = 0;
          continue;
        }
      } else {
        f.x = clamp(nx, 0, canvas.width); f.y = clamp(ny, 0, canvas.height); f.stuck = 0;
      }
    } else if (++f.waited > HAUL_PATIENCE) {
      // Not enough hands: the team disperses and looks elsewhere for a while.
      for (const a of team) { a.hauling = null; a.haulCooldown = HAUL_COOLDOWN; }
      f.haulers = []; f.waited = 0;
      continue;
    }

    // Park the team around the carcass, facing the way it's going.
    team.forEach((a, k) => {
      const ang = f.heading + (k / team.length) * Math.PI * 2;
      a.x = f.x + Math.cos(ang) * (INSECT_RADIUS + 4);
      a.y = f.y + Math.sin(ang) * (INSECT_RADIUS + 4);
      a.angle = f.heading;
    });
  }
}

function pickUp(ant, food) {
  const i = foods.indexOf(food);
  if (i === -1) return;
  // A pile takes several trips: lift one unit and leave the rest for the next
  // ant. Only the last unit clears the spot.
  if (food.units > 1) food.units--;
  else foods.splice(i, 1);
  ant.carrying   = { type: food.type, age: food.age || 0, size: food.size || 4 };
  ant.dropOffset = pickDropOffset(4, ant.isRed, ant.x, ant.y);
  ant.carryTicks = 0;
  ant.trailTick  = 0;              // start laying the trail home from here
  // Anchor a strong scent right on the find, so a leftover pile keeps recruiting
  // carriers to it (the ant then lays the route home as it walks — see updateAnts).
  layTrail(food.x, food.y); layTrail(food.x, food.y);
}

// A raider lifts a piece of the enemy's stockpile and hauls it home to its own
// pantry, shrinking the store it stole from.
function stealFood(ant, food) {
  ant.carrying   = { type: food.type, age: food.age || 0, size: food.size || 4 };
  ant.dropOffset = pickDropOffset(4, ant.isRed, ant.x, ant.y);
  ant.carryTicks = 0;
  ant.trailTick  = 0;
  if (Number.isFinite(food.servings) && food.servings > 1) food.servings--;
  else { const i = foods.indexOf(food); if (i !== -1) foods.splice(i, 1); }
}

function dropOff(ant) {
  const t = dropTarget(ant);
  const c = ant.carrying;
  // A delivered drop feeds a set number of nestmates: sugar and fruit one each,
  // protein two, a poison drop a whole crowd. units:0 — it's a meal now, not a haul.
  const extra = { delivered: true, foundBy: ant.id, age: c.age, team: ant.isRed,
                  size: c.size, servings: deliveredServings(c.type), units: 0 };
  // If the nest is full the haul waits on the ant until there's room. Delivering
  // isn't a happiness reward in itself — the payoff is the colony eating the store.
  if (!addFood(t.x, t.y, c.type, extra)) return;
  ant.carrying = null;
  ant.dropOffset = null;
  ant.carryTicks = 0;
}

// What a single serving does to the ant that eats it. Note poison is never
// cured here: once an ant is poisoned, no meal clears it.
function applyMeal(ant, food) {
  const lift = pct => { ant.lifespan = Math.min(ant.lifespan + ant.baseLifespan * pct, ant.baseLifespan * 2); };
  switch (food.type) {
    case 'insect':                       // a carcass is ~80% sugar, 20% protein
      applyMeal(ant, { type: Math.random() < 0.2 ? 'protein' : 'sugar' });
      return;                            // each mouthful lands as one or the other
    case 'sugar':                        // least filling, a quick pick-me-up
      lift(0.15);
      ant.fullness = clamp(ant.fullness + TUNE.FULLNESS_MEAL * 0.6, 0, 100);
      bumpHappiness(ant, TUNE.H_EAT);
      break;
    case 'fruit':                        // more filling; clears a spoiled-food slow
      lift(0.2);
      ant.fullness = clamp(ant.fullness + TUNE.FULLNESS_MEAL, 0, 100);
      bumpHappiness(ant, TUNE.H_EAT + TUNE.H_GOOD_FOOD);
      ant.slowed = 0;
      break;
    case 'protein':                      // most filling; a burst of speed and mating drive
      lift(0.25);
      ant.fullness = clamp(ant.fullness + TUNE.FULLNESS_FEAST, 0, 100);
      bumpHappiness(ant, TUNE.H_EAT + TUNE.H_GOOD_FOOD);
      ant.slowed = 0;
      ant.speedBoost = PROTEIN_BOOST_TICKS;
      ant.mateBoost  = PROTEIN_BOOST_TICKS;
      break;
    case 'spoiled':                      // a slow and a small toll
      ant.slowed = 300;
      ant.lifespan -= ant.baseLifespan * 0.05;
      break;
    case 'poison':                       // an incurable poisoning
      if (!ant.poisoned) { ant.poisoned = true; ant.lifespan *= 0.8; dropHappiness(ant, TUNE.H_POISON_HIT); }
      break;
  }
}

// A hungry ant eats a loose piece where it finds it (rather than hauling it home):
// one unit's worth of nutrition, and the pile shrinks by a unit.
function eatFresh(ant, food) {
  applyMeal(ant, food);
  const i = foods.indexOf(food);
  if (i === -1) return;
  if (food.units > 1) food.units--; else foods.splice(i, 1);
}

function eat(ant, food) {
  const i = foods.indexOf(food);
  if (i !== -1) foods.splice(i, 1);

  applyMeal(ant, food);

  // A delivered drop can feed more than one ant (protein two, poison a crowd).
  // Log the eater so it can't come back for seconds, and keep the drop around
  // until its servings run out.
  const eaters = Array.isArray(food.foundBy) ? food.foundBy : (food.foundBy != null ? [food.foundBy] : []);
  eaters.push(ant.id);
  food.foundBy = eaters;
  if (Number.isFinite(food.servings) && --food.servings > 0) foods.push(food);
  return true;
}

function updateAnts() {
  const aggression = redAggressionLevel / 100;
  activeBuildersW = activeBuildersR = 0;   // reset per-colony builder tallies (capped below)
  // The build cap scales with colony size so a big colony puts more hands on the
  // nest instead of leaving most of them idle, while still keeping foragers out.
  const buildCapW = Math.max(MAX_BUILDERS, Math.ceil(countWhiteAnts() * BUILDER_SHARE));
  const buildCapR = Math.max(MAX_BUILDERS, Math.ceil(countRedAnts()   * BUILDER_SHARE));
  const pursuers = new Map();   // whiteId -> how many rivals are hunting it this tick (spreads the pack)

  for (let i = ants.length - 1; i >= 0; i--) {
    const a = ants[i];

    if (a.haulCooldown > 0) a.haulCooldown--;
    if (a.carrying) decay(a.carrying);   // fruit keeps ripening on the way home

    // A newborn gets a grace period: for its first minute, happiness and fullness
    // don't decay on their own. Only external harm (poison, an attack) still bites.
    a.age += TICK_MS;
    const inGrace = a.age < NEWBORN_GRACE_MS;

    // Mood drifts every tick: it decays, rises while well-fed, and (main colony
    // only) rises the longer the colony goes without being attacked.
    // Poison decays every stat: fullness drains faster too (mood and lifespan
    // already do, below).
    let fullDrain = a.poisoned ? TUNE.FULLNESS_DECAY : 0;   // poison bites through grace
    if (!inGrace) fullDrain += TUNE.FULLNESS_DECAY;          // natural hunger, once grace is over
    a.fullness = clamp(a.fullness - fullDrain * (TICK_MS / 1000), 0, 100);

    // Grace is neutral: during it, mood only moves from eating, mating or harm —
    // the passive well-fed / survival drift is held off, so a young colony
    // doesn't auto-cheer its way to a full bar while it just sits there.
    let gain = 0;
    if (!inGrace) {
      if (a.fullness >= TUNE.SATIATED_LEVEL) gain += TUNE.H_SATIATED;    // well-fed, not merely long-lived
      if (!a.isRed && whiteCalmMs > TUNE.ATTACK_CALM_S * 1000) gain += TUNE.H_SURVIVE;
    }
    let decayRate = (inGrace ? 0 : TUNE.HAPPINESS_DECAY) + (a.poisoned ? TUNE.H_POISON_DECAY : 0);
    if (sadistMode) {                        // extra misery only piles on for the sadist
      if (a.wet) decayRate += TUNE.H_WET;
      if (a.slowed > 0) decayRate += TUNE.H_SLOW;
    }
    const drift = gain * a.temperament * (a.isRed ? TUNE.RED_FACTOR : 1) - decayRate;
    a.happiness = clamp(a.happiness + drift * (TICK_MS / 1000), 0, 100);

    // On a haul team: parked by updateFoods, still ages and can still breed
    // (a waiting pair may raise the extra hands it needs).
    if (a.hauling) {
      if (!foods.includes(a.hauling)) { a.hauling = null; }   // bulldozed away
      else {
        a.lifespan -= TICK_MS * (a.poisoned ? 1.5 : 1);
        if (a.lifespan <= 0) { killAnt(i); continue; }
        a.breedingTimer += TICK_MS * (a.mateBoost > 0 ? 2 : 1);
        if (a.mateBoost > 0) a.mateBoost--;
        if (a.breedingTimer >= matingSpeed * a.matingJitter) { a.breedingTimer = 0; if (!a.poisoned) tryBreeding(a); }
        continue;
      }
    }

    // Wander
    a.angle += (Math.random() - 0.5) * 0.3;

    // Decide what to chase. Right after a wall bump this is paused so the ant peels
    // away instead of steering straight back into the wall and grinding to a stop.
    let target = null, prey = null, chase = null, holdStill = false, building = false, feed = null;
    if (a.wallCooldown > 0) {
      a.wallCooldown--;
    } else {
      // Well-fed rivals hunt; a hungry rival breaks off to look for food, so it
      // depends on eating (and can starve) just like the main colony.
      if (a.isRed && aggression > 0 && a.fullness >= a.hungerPoint) {
        prey = pickPrey(a, pursuers);
        if (prey) { steerToward(a, prey.x, prey.y, 0.05 + aggression * 0.25); chase = prey; }
      }
      // A main-colony ant that isn't hunting or hauling answers a danger scent
      // before it thinks about food: flee it, or rally home if the nest's at risk.
      let danger = null, react = null;
      if (!prey && !a.carrying && !a.isRed && !a.isQueen) {
        danger = strongestPheromone(a, 'danger', SENSE_DANGER);
        if (danger) react = dangerReaction(a, danger);
      }
      // Well-fed idle ants pitch in on the nest; hungry ones fall through to
      // forage. At most MAX_BUILDERS dig at once (barricades ignore the cap), so
      // the colony keeps foraging while it builds.
      let build = null;
      if (!prey && !a.carrying && !react && a.fullness >= a.hungerPoint) {
        const t = buildTaskFor(a);
        const busy = a.isRed ? activeBuildersR : activeBuildersW;
        const cap  = a.isRed ? buildCapR : buildCapW;
        if (t && (t.urgent || busy < cap)) { build = t; building = true; if (a.isRed) activeBuildersR++; else activeBuildersW++; }
      }
      // Hungry: eat the nearest LOOSE food if any is within reach (handled by the
      // forage branch below); only when none is near does it trek home to eat from
      // the pantry store — so ants don't march past food to a distant larder.
      if (!prey && !a.carrying && !react && a.fullness < a.hungerPoint && !nearestFreshFood(a, SENSE_FOOD)) {
        feed = nearestColonyFood(a);
      }
      // A would-be forager still inside the sealed nest can't find food in there —
      // route it out through the entry first, then it forages in the open.
      let exitPt = null;
      if (!prey && !a.carrying && !react && !build && !feed && inNestZone(a.x, a.y)) exitPt = exitAim(a);
      if (!prey && a.carrying) {
        // Haul it home. Head for a reachable opening — the entry's outer door when
        // still outside the sealed nest, the pantry's doorway once inside — so the
        // ant uses openings instead of grinding on outer walls.
        const aim = carryHomeAim(a);
        steerToward(a, aim.x, aim.y, 0.25);
        a.carryTicks++;
      } else if (react === 'flee') {
        steerAway(a, danger.x, danger.y, 0.3);
        a.speedBoost = Math.max(a.speedBoost, 30);   // a jolt of adrenaline carries it clear
      } else if (react === 'swarm') {
        const s = nearestSpawnPoint(a.isRed, a.x, a.y);
        steerToward(a, s.x, s.y, 0.15); chase = s;   // regroup at the nest to defend it
      } else if (build) {
        // Walk the wall's line: head onto the next undug block, pause to work it,
        // and lay the soil right where the ant stands — the ant is then nudged off
        // it, so the wall forms behind the ant as it moves along, block by block.
        const s = build.site;
        steerToward(a, s.x, s.y, 0.2); chase = { x: s.x, y: s.y };
        if (dist2(s.x, s.y, a.x, a.y) < DIG_REACH * DIG_REACH) {
          holdStill = true;                      // stand on the spot while it digs...
          a.buildStuck = 0;
          a.angle += (Math.random() - 0.5) * 0.6;  // ...with a little wiggle so it reads as working
          if (++a.digTimer >= BUILD_TICKS) {
            a.digTimer = 0;
            const dug = digSoil(s.x, s.y, true);   // lays soil at its feet; the shove bumps it onward
            // Done ONLY when this site actually has its own block — so a later burrow
            // that removes a neighbour can't leave this stretch a rendered-but-open gap.
            if (dug || soilAt(s.x, s.y)) { s.done = true; refreshBuilt(build.room); }
          }
        } else {
          // Can't reach this block for a while (walled off): force-lay it so the room
          // can't deadlock or end up with a hole (the force-complete backstop also covers this).
          a.digTimer = 0;
          if ((a.buildStuck = (a.buildStuck || 0) + 1) > 130) {
            if (digSoil(s.x, s.y, true) || soilAt(s.x, s.y)) { s.done = true; refreshBuilt(build.room); }
            a.buildStuck = 0;
          }
        }
      } else if (feed) {
        // Hungry, and the pantry is stocked: go eat from the reliable store rather
        // than chase scattered crumbs. Entry door first if still outside, then
        // routed through the corridors to the food; `target` is set so the eat
        // check below consumes a serving on arrival.
        const store = builtRoom(a.isRed, 'pantry');
        let aim = feed;
        const e = builtRoom(a.isRed, 'entry');
        if (!inNestZone(a.x, a.y) && e) {
          const o = SOIL_R + 12;
          aim = { x: e.x + Math.cos(e.gapAngle) * (e.r + o), y: e.y + Math.sin(e.gapAngle) * (e.r + o) };
        } else if (store) {
          aim = aimToRoom(a, store, feed);
        }
        steerToward(a, aim.x, aim.y, 0.22);
        chase = feed; target = feed;
      } else if (exitPt) {
        // Leave the nest to forage.
        steerToward(a, exitPt.x, exitPt.y, 0.25); chase = exitPt;
      } else if (!prey && a.fullness < a.hungerPoint && (target = nearestFreshFood(a, SENSE_FOOD))) {
        // Hungry with an empty pantry: actively chase the nearest loose food in
        // sensing range and eat it on the spot (a fed forager, below, carries it home).
        steerToward(a, target.x, target.y, 0.2); chase = target;
      } else if (!prey && a.isRed) {
        // Raider: seek out food anywhere — ambient drops or the enemy store when
        // it's breached — and haul it back to the rival pantry. (Hunting whites is
        // a separate drive above; this is plunder, not a march on the nest.)
        target = nearestFood(a, Infinity);
        if (target) { steerToward(a, target.x, target.y, 0.12); chase = target; }
      } else if (!prey) {
        // A fed forager brings food home, foraging by SCENT: it only makes for food
        // it can smell up close; farther out it follows a food trail OUTWARD toward
        // the find (reinforcing the lane), and with neither it wanders until it
        // stumbles onto a scent. `target` stays the nearest food so the grab check
        // can lift anything that comes within reach.
        target = nearestFood(a);
        const smell = target && dist2(target.x, target.y, a.x, a.y) < SENSE_SMELL * SENSE_SMELL ? target : null;
        if (smell) {
          const keen = { sugar: 0.25, fruit: 0.22, protein: 0.2, insect: 0.2 }[smell.type] || 0.14;
          steerToward(a, smell.x, smell.y, keen);
          chase = smell;
        } else {
          const p = outwardTrail(a);
          if (p) { steerToward(a, p.x, p.y, 0.16); chase = p; }           // follow the lane to the find
          else if (target && dist2(target.x, target.y, a.x, a.y) < FORAGE_SIGHT * FORAGE_SIGHT) {
            steerToward(a, target.x, target.y, 0.12); chase = target;      // close on food within short sight
          }
        }
      }
    }

    // Movement with wall bounce and water avoidance. Protein leaves a burst of
    // speed; carrying protein home is heavy going (slower, but not as slow as a
    // spoiled-food slow).
    let speed = antSpeed(a.isRed, a.isQueen)
              * (a.slowed > 0 ? 0.6 : 1)
              * (a.poisoned ? 0.7 : 1)
              * (a.speedBoost > 0 ? 1.35 : 1)
              * (a.carrying && a.carrying.type === 'protein' ? 0.8 : 1);
    if (a.slowed > 0) a.slowed--;
    if (a.speedBoost > 0) a.speedBoost--;

    // Arrival: ease off as it nears whatever it's chasing, so it settles onto
    // the spot instead of overshooting and orbiting it in a tight cluster.
    if (chase) {
      const d2 = dist2(chase.x, chase.y, a.x, a.y);
      if (d2 < ARRIVE_RANGE * ARRIVE_RANGE) speed *= 0.4;
    }
    if (holdStill) speed = 0;   // a builder mid-block stays put until the wall is up

    const nx = a.x + Math.cos(a.angle) * speed;
    const ny = a.y + Math.sin(a.angle) * speed;
    a.wet = false;   // ants no longer enter water — it blocks and repels like a wall

    // The canvas edge is a hard boundary (no wrap-around teleporting across walls),
    // so blocked = a wall/soil/water OR off the edge.
    const M = EDGE_MARGIN;
    const blocked = (x, y) => x < M || y < M || x > canvas.width - M || y > canvas.height - M || blockedForAnt(x, y);

    if (speed > 0 && blocked(nx, ny)) {
      // Blocked by wall, soil, water or the edge: hug it and march ALONG it (keeping
      // to the side nearest its heading) until the way ahead opens — so it traces a
      // wall in a circle, rounds obstacles, and finds doorway gaps, instead of bouncing.
      const o = nearestObstacle(nx, ny, 40) || nearestObstacle(a.x, a.y, 40) || { x: clamp(nx, 0, canvas.width), y: clamp(ny, 0, canvas.height) };
      const normal = Math.atan2(a.y - o.y, a.x - o.x);          // away from the wall/edge
      const t1 = normal + Math.PI / 2, t2 = normal - Math.PI / 2;
      a.angle = Math.abs(angleDiff(t1, a.angle)) <= Math.abs(angleDiff(t2, a.angle)) ? t1 : t2;
      let moved = false;
      for (let k = 0; k < 6; k++) {   // at a corner, keep turning toward open ground
        const bx = a.x + Math.cos(a.angle) * speed, by = a.y + Math.sin(a.angle) * speed;
        if (!blocked(bx, by)) { a.x = bx; a.y = by; moved = true; break; }
        a.angle += angleDiff(normal, a.angle) >= 0 ? 0.5 : -0.5;
      }
      a.stuckMs = moved ? 0 : a.stuckMs + TICK_MS;
      // Truly sealed in and getting nowhere: one ant burrows a hole out.
      if (a.stuckMs >= BURROW_STUCK_MS && !a.isQueen && inAnyRoom(a.x, a.y)) {
        if (burrowHole(a.x + Math.cos(a.angle) * (SOIL_R + 5), a.y + Math.sin(a.angle) * (SOIL_R + 5)) ||
            burrowHole(a.x, a.y)) a.stuckMs = 0;
      }
    } else {
      a.x = nx; a.y = ny;
      a.stuckMs = 0;
    }

    // Anti-orbit: an ant that's trying to travel but has made no net progress for a
    // spell (circling a corner, an obstacle or a doorway) gets kicked in a fresh
    // direction so it can never loop forever. Builders, feeders, haulers and the
    // queen are exempt — they're meant to stay put.
    if (speed > 0 && !holdStill && !feed && !a.hauling && !a.isQueen) {
      a.pMs = (a.pMs || 0) + TICK_MS;
      if (a.pAnchorX === undefined) { a.pAnchorX = a.x; a.pAnchorY = a.y; }
      if (a.pMs >= 1500) {
        if (dist2(a.x, a.y, a.pAnchorX, a.pAnchorY) < 26 * 26) {
          a.angle = Math.random() * Math.PI * 2;
          a.speedBoost = Math.max(a.speedBoost, 20);
          a.wallCooldown = 8;
        }
        a.pAnchorX = a.x; a.pAnchorY = a.y; a.pMs = 0;
      }
    } else { a.pAnchorX = a.x; a.pAnchorY = a.y; a.pMs = 0; }

    // Trapped-forager relief: an ant that should be out foraging but has been stuck
    // inside the nest too long digs its own way out, radially through the nearest
    // room wall (the colony re-seals the hole later). Builders, carriers, hunters
    // and the queen are exempt — they belong inside.
    // Only a HUNGRY forager that urgently needs to get out digs its way free — a
    // well-fed ant milling indoors (e.g. during construction) doesn't, so builders
    // don't churn the walls they're raising.
    if (!a.isQueen && !a.carrying && !building && !prey && !feed && a.fullness < a.hungerPoint && inNestZone(a.x, a.y)) {
      a.confinedMs = (a.confinedMs || 0) + TICK_MS;
      if (a.confinedMs >= CONFINE_BURROW_MS) {
        const rm = rooms.find(r => dist2(r.x, r.y, a.x, a.y) < r.r * r.r);
        const out = rm ? Math.atan2(a.y - rm.y, a.x - rm.x) : a.angle;   // out of a room, or along its heading in a corridor
        if (burrowHole(a.x + Math.cos(out) * (SOIL_R + 6), a.y + Math.sin(out) * (SOIL_R + 6)) ||
            burrowHole(a.x, a.y)) a.confinedMs = 0;
      }
    } else {
      a.confinedMs = 0;
    }

    // Lay a food trail the WHOLE way home while carrying, so the scent spans the
    // route from the find to the nest and other foragers can follow it out.
    if (a.carrying && !a.isQueen) {
      if ((a.trailTick = (a.trailTick || 0) + 1) % TRAIL_STEP === 0) layTrail(a.x, a.y);
    }

    // Red ants bite white ants; biting a poisoned one poisons the biter.
    if (prey && dist2(prey.x, prey.y, a.x, a.y) < BITE_RANGE * BITE_RANGE && Math.random() < aggression) {
      const pi = ants.indexOf(prey);
      if (pi !== -1) {
        if (prey.poisoned && !a.poisoned) { a.poisoned = true; a.lifespan *= 0.8; dropHappiness(a, TUNE.H_POISON_HIT); }
        bumpHappiness(a, TUNE.H_ATTACK);   // the antagonist's reward for a kill
        whiteCalmMs = 0;              // the main colony has just been attacked
        moraleHit(prey.x, prey.y, prey.isRed, TUNE.H_ALLY_LOST);   // its colony-mates take it hard
        layPheromone(prey.x, prey.y, 3, 'danger');   // a scent of death nearby: mates flee or rally
        if (prey.isRed) killedRed++; else killedWhite++;   // a kill, not a natural death
        killAnt(pi);
        if (pi < i) i--;           // array shifted under us
      }
    }

    // Drop off, pick up, or eat
    if (a.carrying) {
      const store = builtRoom(a.isRed, 'pantry');
      if (store) {
        // Home once it's inside any built room, or right at the pantry; if it has
        // been carrying far too long (couldn't thread the nest), log it anyway so
        // it stops circling — the store still shows up in the pantry.
        const home = insideMyBuiltRoom(a.isRed, a.x, a.y) ||
                     dist2(a.x, a.y, store.x, store.y) < (store.r + EAT_RANGE) * (store.r + EAT_RANGE);
        if (home || a.carryTicks > CARRY_GIVEUP) dropOff(a);
      } else {
        const t = dropTarget(a);
        if (dist2(t.x, t.y, a.x, a.y) < EAT_RANGE * EAT_RANGE) dropOff(a);
      }
    } else if (feed && target === feed) {
      // Feeding from the communal store: the colony shares food, so a hungry ant
      // that has reached the nest (any room or corridor) eats from the store — it
      // doesn't have to pinpoint a morsel deep in the pantry and starve trying.
      if (inNestZone(a.x, a.y)) {
        const f = nearestColonyFood(a);
        if (f) eat(a, f);
      }
    } else if (target) {
      const reach = EAT_RANGE + (target.type === 'insect' ? INSECT_RADIUS : 0);
      if (dist2(target.x, target.y, a.x, a.y) < reach * reach) {
        if (target.delivered) {
          const enemy = target.team !== a.isRed;
          if (enemy && a.fullness >= a.hungerPoint) stealFood(a, target);   // plunder: haul it home
          else if (!eat(a, target)) continue;                               // hungry (or own store): eat
        }
        else if (target.type === 'insect') joinTeam(a, target);
        else if (a.fullness < a.hungerPoint) eatFresh(a, target);   // hungry: eat it here
        else                            pickUp(a, target);          // fed: haul it home to the pantry
      }
    }

    // Ageing
    a.lifespan -= TICK_MS * (a.poisoned ? 1.5 : 1);
    if (a.lifespan <= 0) { killAnt(i); continue; }

    // Breeding — each ant has its own interval (matingJitter) so pairs don't all
    // fire at once; protein makes an ant keener, filling its timer twice as fast.
    a.breedingTimer += TICK_MS * (a.mateBoost > 0 ? 2 : 1);
    if (a.mateBoost > 0) a.mateBoost--;
    if (a.breedingTimer >= matingSpeed * a.matingJitter) {
      a.breedingTimer = 0;
      if (!a.poisoned) tryBreeding(a);
    }
  }

  separateAnts();
}

// Soft ant-ant separation: nudge overlapping ants apart so they don't stack or
// walk over each other. A grid keeps it O(n). Parked haulers and ants mid-dig
// hold their spot (they're meant to sit on food / on a wall block); the push is
// skipped whenever it would drive an ant into a wall, soil or water.
function separateAnts() {
  const gap = ANT_SEP, gap2 = gap * gap, cell = gap;
  const grid = new Map();
  const key = (cx, cy) => cx + ',' + cy;
  for (const a of ants) {
    const k = key(Math.floor(a.x / cell), Math.floor(a.y / cell));
    let bucket = grid.get(k); if (!bucket) grid.set(k, bucket = []);
    bucket.push(a);
  }
  for (const a of ants) {
    if (a.hauling || a.digTimer > 0) continue;   // haulers/diggers stay put by design
    const cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
    for (let gx = cx - 1; gx <= cx + 1; gx++) {
      for (let gy = cy - 1; gy <= cy + 1; gy++) {
        const bucket = grid.get(key(gx, gy)); if (!bucket) continue;
        for (const b of bucket) {
          if (b === a) continue;
          let dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
          if (d2 >= gap2) continue;
          if (d2 === 0) { const r = Math.random() * Math.PI * 2; dx = Math.cos(r); dy = Math.sin(r); d2 = 1; }
          const d = Math.sqrt(d2), push = (gap - d) / 2;
          const nx = a.x + (dx / d) * push, ny = a.y + (dy / d) * push;
          if (!blockedForAnt(nx, ny)) {
            // Nudge apart, but keep inside the edge buffer — never wrap across the
            // canvas, which used to fling an edge ant to the far side.
            a.x = clamp(nx, EDGE_MARGIN, canvas.width  - EDGE_MARGIN);
            a.y = clamp(ny, EDGE_MARGIN, canvas.height - EDGE_MARGIN);
          }
        }
      }
    }
  }
}

function tryBreeding(a) {
  // Workers only breed while the colony has no queen; once she arrives she takes
  // over reproduction (she lays the eggs). Below the queen threshold the workers
  // keep the colony going themselves.
  if (a.isRed ? queens.red : queens.white) return;
  if (a.isRed) {
    if (!allowRedBreeding || countRedAnts() >= MAX_RED_ANTS) return;
  } else if (countWhiteAnts() >= MAX_WHITE_ANTS) return;

  // Once a colony is past a certain size, growth needs somewhere to raise the young:
  // no built nursery, no more births (World Building Mode only). The colony auto-digs
  // a nursery, so this rarely bites and needs no on-screen warning.
  if (worldBuilding && !a.isRed && countWhiteAnts() >= TUNE.NURSERY_REQUIRED_ABOVE && !hasBuiltRoom(false, 'nursery')) {
    return;
  }

  if (a.happiness < a.mateUrge) return;   // not in the mood — must clear its own mate-urge threshold

  const r2 = MATE_RANGE * MATE_RANGE;
  let mate = null, crowd = 0;
  for (const o of ants) {
    if (o === a || o.isRed !== a.isRed) continue;
    if (dist2(o.x, o.y, a.x, a.y) < r2) {
      crowd++;                              // every close colony-mate counts toward crowding
      // A willing partner: not poisoned and content enough to be in the mood itself.
      if (!mate && !o.poisoned && o.happiness >= o.mateUrge) mate = o;
    }
  }
  if (!mate) return;
  // Overcrowding makes ants a touch less inclined to breed.
  const chance = TUNE.MATE_CHANCE * Math.max(TUNE.CROWD_MATE_FLOOR, 1 - crowd * TUNE.CROWD_MATE_STEP);
  if (Math.random() < chance) {
    // With a built nursery, the mating lays an egg there to hatch later; otherwise
    // it's a birth on the spot. (Counted at hatch for eggs, here for live births.)
    if (worldBuilding && hasBuiltRoom(a.isRed, 'nursery')) {
      layEgg(a.isRed, 'mate');
    } else {
      ants.push(spawnNear(a, a.isRed));
      if (a.isRed) { totalBornRed++; matedRed++; } else { totalBornWhite++; matedWhite++; }
    }
    bumpHappiness(a, TUNE.H_MATE);
    bumpHappiness(mate, TUNE.H_MATE);
    a.breedingTimer = mate.breedingTimer = 0;   // both parents rest before mating again
  }
}

// Eggs in a nursery tick down and hatch into new ants (counted as born here).
function updateEggs() {
  for (let i = eggs.length - 1; i >= 0; i--) {
    const e = eggs[i];
    e.hatch -= TICK_MS;
    if (e.hatch > 0) continue;
    eggs.splice(i, 1);
    const cap = e.team ? MAX_RED_ANTS : MAX_WHITE_ANTS;
    const count = e.team ? countRedAnts() : countWhiteAnts();
    if (count >= cap) continue;
    ants.push(createAnt(e.team, false, e.x, e.y));
    // Any hatched egg — worker-mated or queen-laid — counts as born.
    if (e.team) { totalBornRed++; matedRed++; } else { totalBornWhite++; matedWhite++; }
  }
}

// A rival at a built room's doorway is a breach: the colony walls it shut. The red
// outline marks an ACTIVE threat only — it clears once no rival is near, while the
// barricade soil (built once) stays.
function updateThreats() {
  if (!worldBuilding) return;
  for (const room of rooms) {
    if (room.team !== false || !room.built) continue;
    const dx = room.x + Math.cos(room.gapAngle) * room.r;
    const dy = room.y + Math.sin(room.gapAngle) * room.r;
    let threat = false;
    for (const o of ants) {
      if (!o.isRed) continue;
      if (dist2(o.x, o.y, dx, dy) < BREACH_R * BREACH_R ||
          dist2(o.x, o.y, room.x, room.y) < (room.r + 4) * (room.r + 4)) { threat = true; break; }
    }
    room.breached = threat;
    if (threat && !room.barricadeSites) barricadeRoom(room);   // seal the doorway once
  }
}

function updateQueens() {
  const whites = countWhiteAnts(), reds = countRedAnts();

  // The main colony's queen arrives only once the colony is both large enough
  // and has been thriving for a sustained spell (not the instant the bar first
  // touches the threshold, and never for a mere happy pair), and leaves as the
  // mood sours.
  const whiteReady = whiteHappiness >= TUNE.QUEEN_HIGH && whites >= TUNE.QUEEN_MIN_ANTS;
  whiteQueenReadyMs = whiteReady ? whiteQueenReadyMs + TICK_MS : 0;
  if (whiteQueenReadyMs >= QUEEN_SUSTAIN_MS && !queens.white) queens.white = spawnQueen(false);
  if (queens.white && whiteHappiness < TUNE.QUEEN_LOW) { queens.white = null; if (sadistMode) colonyMorale(false, TUNE.H_QUEEN_LEFT); }

  // The rival queen normally tracks the rival colony's own mood; in Sadist mode
  // she feeds on the main colony's misery instead.
  if (sadistMode) {
    redQueenReadyMs = 0;
    if (whiteHappiness < TUNE.SADIST_SPAWN && !queens.red && ants.length > 0) queens.red = spawnQueen(true);
    if (queens.red && whiteHappiness > TUNE.SADIST_LEAVE) { queens.red = null; colonyMorale(true, TUNE.H_QUEEN_LEFT); }
  } else {
    const redReady = redHappiness >= TUNE.QUEEN_HIGH && reds >= TUNE.QUEEN_MIN_ANTS;
    redQueenReadyMs = redReady ? redQueenReadyMs + TICK_MS : 0;
    if (redQueenReadyMs >= QUEEN_SUSTAIN_MS && !queens.red) queens.red = spawnQueen(true);
    if (queens.red && redHappiness < TUNE.QUEEN_LOW) queens.red = null;
  }

  for (const q of [queens.white, queens.red]) {
    if (!q) continue;
    q.spawnTimer += TICK_MS;
    if (q.spawnTimer < 3000) continue;
    q.spawnTimer = 0;
    if (q.isRed ? reds >= MAX_RED_ANTS : whites >= MAX_WHITE_ANTS) continue;
    // The queen lays an egg — in the nursery if there is one, otherwise beside her.
    // (In the classic sandbox, with no nest, she spawns the ant directly.)
    if (worldBuilding) {
      layEgg(q.isRed, 'queen', q.x, q.y);
    } else {
      ants.push(spawnNear(q, q.isRed));   // classic sandbox: queen offspring, counted as born
      if (q.isRed) { totalBornRed++; matedRed++; } else { totalBornWhite++; matedWhite++; }
    }
  }
}

