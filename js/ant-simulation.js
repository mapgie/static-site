// ant-farm — main loop & per-tick simulation
'use strict';

// ---------------------------------------------------------------------------
// Main loop
// ---------------------------------------------------------------------------
function animate() {
  if (envDirty) rebuildEnvGrid();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawEnvironment();
  if (showSpawnPoints || maintenance) drawSpawnPoints(maintenance);
  drawFoods();
  drawPheromones();

  if (!animationPaused) {
    if (autoFood) autoDropFood();
    updateFoods();
    updateAnts();
    updateQueens();
    whiteCalmMs += TICK_MS;
  }
  aggregateHappiness();
  updateHappinessBars();

  if (queens.white) drawAnt(queens.white);
  if (queens.red)   drawAnt(queens.red);
  for (const a of ants) drawAnt(a);
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
  autoFoodNext = AUTO_FOOD_MS * (0.6 + Math.random() * 0.8);   // jittered gap so drops aren't metronomic
  if (foods.length >= MAX_FOOD || !canvas) return;
  for (let tries = 0; tries < 8; tries++) {
    const x = Math.random() * canvas.width, y = Math.random() * canvas.height;
    if (foodSpawnAllowed(x, y)) { addFood(x, y, pickAutoFood(), { size: 5 }); break; }
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
function nearestFood(ant) {
  let best = null, bd = SENSE_FOOD * SENSE_FOOD;
  const hungry = ant.fullness < ant.hungerPoint;
  for (const f of foods) {
    if (f.delivered && foundByAnt(f, ant)) continue;
    if (f.delivered && !hungry) continue;   // well-fed ants forage but leave the store for later
    if (f.type === 'insect' && !f.delivered) {
      if (ant.haulCooldown > 0) continue;                       // just gave up on one
      if (f.haulers.length && f.team !== ant.isRed) continue;   // one colour per team
    }
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

function strongestTrail(ant) {
  let best = null, bs = 0.05;
  const r2 = SENSE_TRAIL * SENSE_TRAIL;
  for (const p of pheromones) {
    if (p.strength > bs && dist2(p.x, p.y, ant.x, ant.y) < r2) { bs = p.strength; best = p; }
  }
  return best;
}

function decay(f) {
  if (f.type !== 'fruit' && f.type !== 'spoiled') return;
  f.age = (f.age || 0) + TICK_MS;
  if (f.age < decayStageMs()) return;
  f.age = 0;
  f.type = f.type === 'fruit' ? 'spoiled' : 'poison';
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

function updateFoods() {
  for (const f of foods) decay(f);

  let byId = null;
  for (const f of foods) {
    if (f.type !== 'insect' || f.delivered || !f.haulers.length) continue;
    if (!byId) byId = new Map(ants.map(a => [a.id, a]));
    const team = f.haulers.map(id => byId.get(id)).filter(Boolean);

    if (team.length >= INSECT_HAULERS) {
      f.waited = 0;
      if (!f.dropOffset) f.dropOffset = pickDropOffset(INSECT_RADIUS + 2, f.team, f.x, f.y);
      const { x: tx, y: ty } = nestTarget(nearestSpawnPoint(f.team, f.x, f.y), f.dropOffset, INSECT_RADIUS + 2);
      if (dist2(tx, ty, f.x, f.y) < EAT_RANGE * EAT_RANGE) {
        // Delivered: the whole team counts as finders, none of them may eat it.
        f.x = tx; f.y = ty;
        f.delivered = true;
        f.foundBy = f.haulers.slice();
        for (const a of team) a.hauling = null;
        f.haulers = []; f.dropOffset = null;
        continue;
      }
      f.heading = Math.atan2(ty - f.y, tx - f.x);
      const speed = Math.min(1, 0.3 + 0.1 * team.length);
      const nx = f.x + Math.cos(f.heading) * speed, ny = f.y + Math.sin(f.heading) * speed;
      if (collidesWall(nx, ny)) {
        if (++f.stuck > CARRY_RETRY / 4) { f.dropOffset = pickDropOffset(INSECT_RADIUS + 2, f.team, f.x, f.y); f.stuck = 0; }
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
  ant.trail = 90;                  // lay a trail from the find back to the nest
  // Broadcast the find: a strong, slow-fading mark on the spot itself keeps the
  // coordinate appealing while the trail lasts, so nestmates fall in line and
  // process over to carry off whatever food is left.
  layPheromone(food.x, food.y, 1.5);   // a modest mark, not a magnet that ants orbit
  layPheromone(ant.x, ant.y);
}

function dropOff(ant) {
  const t = dropTarget(ant);
  const c = ant.carrying;
  // A delivered drop feeds a set number of nestmates: sugar and fruit one each,
  // protein two, a poison drop a whole crowd. units:0 — it's a meal now, not a haul.
  const extra = { delivered: true, foundBy: ant.id, age: c.age, team: ant.isRed,
                  size: c.size, servings: deliveredServings(c.type), units: 0 };
  // If the nest is full the haul waits on the ant until there's room.
  if (!addFood(t.x, t.y, c.type, extra)) return;
  bumpHappiness(ant, TUNE.H_DELIVER);   // colony-building: food is home
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
    let target = null, prey = null, chase = null;
    if (a.wallCooldown > 0) {
      a.wallCooldown--;
    } else {
      // Well-fed rivals hunt; a hungry rival breaks off to look for food, so it
      // depends on eating (and can starve) just like the main colony.
      if (a.isRed && aggression > 0 && a.fullness >= a.hungerPoint) {
        prey = nearestWhiteAnt(a);
        if (prey) { steerToward(a, prey.x, prey.y, 0.05 + aggression * 0.25); chase = prey; }
      }
      if (!prey && a.carrying) {
        // Haul it home
        const t = dropTarget(a);
        steerToward(a, t.x, t.y, 0.25);
        if (++a.carryTicks > CARRY_RETRY) { a.dropOffset = pickDropOffset(4, a.isRed, a.x, a.y); a.carryTicks = 0; }
      } else if (!prey) {
        target = nearestFood(a);
        if (target) {
          const keen = { sugar: 0.25, fruit: 0.22, protein: 0.2, insect: 0.2 }[target.type] || 0.12;
          steerToward(a, target.x, target.y, keen);
          chase = target;
        } else {
          const p = strongestTrail(a);
          if (p) { steerToward(a, p.x, p.y, 0.10); chase = p; }   // follow the procession to the find
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

    let nx = a.x + Math.cos(a.angle) * speed;
    let ny = a.y + Math.sin(a.angle) * speed;

    let hitWall = false, nearWater = null, nearWaterD = Infinity, inWater = false;
    forEachEnvNear(nx, ny, 40, o => {
      const r = o.r || 4;
      const d = dist2(o.x, o.y, nx, ny);
      if (o.type === 'wall') {
        if (d < (r + 3) * (r + 3)) hitWall = true;
      } else {
        if (d < (r + 2) * (r + 2)) inWater = true;
        if (d < nearWaterD) { nearWaterD = d; nearWater = o; }
      }
    });
    a.wet = inWater;

    if (hitWall) {
      // Turn back, hold off chasing for a moment, and actually step into the clear
      // so the ant leaves the wall instead of pressing against it.
      a.angle += Math.PI + (Math.random() - 0.5) * 0.8;
      a.wallCooldown = 25;
      const bx = a.x + Math.cos(a.angle) * speed;
      const by = a.y + Math.sin(a.angle) * speed;
      if (!collidesWall(bx, by)) {
        a.x = (bx + canvas.width)  % canvas.width;
        a.y = (by + canvas.height) % canvas.height;
      }
    } else {
      if (nearWater && nearWaterD < 30 * 30) steerAway(a, nearWater.x, nearWater.y, 0.25);
      if (inWater) { nx = a.x + (nx - a.x) * 0.4; ny = a.y + (ny - a.y) * 0.4; }
      a.x = (nx + canvas.width)  % canvas.width;
      a.y = (ny + canvas.height) % canvas.height;
    }

    // Trail laying after a good meal
    if (a.trail > 0) {
      a.trail--;
      if (a.trail % 6 === 0) layPheromone(a.x, a.y);
    }

    // Red ants bite white ants; biting a poisoned one poisons the biter.
    if (prey && dist2(prey.x, prey.y, a.x, a.y) < BITE_RANGE * BITE_RANGE && Math.random() < aggression) {
      const pi = ants.indexOf(prey);
      if (pi !== -1) {
        if (prey.poisoned && !a.poisoned) { a.poisoned = true; a.lifespan *= 0.8; dropHappiness(a, TUNE.H_POISON_HIT); }
        bumpHappiness(a, TUNE.H_ATTACK);   // the antagonist's reward for a kill
        whiteCalmMs = 0;              // the main colony has just been attacked
        moraleHit(prey.x, prey.y, prey.isRed, TUNE.H_ALLY_LOST);   // its colony-mates take it hard
        killAnt(pi);
        if (pi < i) i--;           // array shifted under us
      }
    }

    // Drop off, pick up, or eat
    if (a.carrying) {
      const t = dropTarget(a);
      if (dist2(t.x, t.y, a.x, a.y) < EAT_RANGE * EAT_RANGE) dropOff(a);
    } else if (target) {
      const reach = EAT_RANGE + (target.type === 'insect' ? INSECT_RADIUS : 0);
      if (dist2(target.x, target.y, a.x, a.y) < reach * reach) {
        if (target.delivered)           { if (!eat(a, target)) continue; }
        else if (target.type === 'insect') joinTeam(a, target);
        else                            pickUp(a, target);
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
}

function tryBreeding(a) {
  if (a.isRed) {
    if (!allowRedBreeding || countRedAnts() >= MAX_RED_ANTS) return;
  } else if (countWhiteAnts() >= MAX_WHITE_ANTS) return;

  if (a.happiness < a.mateUrge) return;   // not in the mood — must clear its own horniness threshold

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
    ants.push(spawnNear(a, a.isRed));
    if (a.isRed) { totalBornRed++; matedRed++; } else { totalBornWhite++; matedWhite++; }
    bumpHappiness(a, TUNE.H_MATE);
    bumpHappiness(mate, TUNE.H_MATE);
    a.breedingTimer = mate.breedingTimer = 0;   // both parents rest before mating again
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
    if (q.isRed ? reds < MAX_RED_ANTS : whites < MAX_WHITE_ANTS) {
      ants.push(spawnNear(q, q.isRed));
      if (q.isRed) { totalBornRed++; spawnedRed++; } else { totalBornWhite++; spawnedWhite++; }
    }
  }
}

