// ant-farm — ants, food & nest entities
'use strict';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
// Read live from the sliders so a change applies to every ant at once.
function antSpeed(isRed, isQueen) { return isQueen ? 0 : (isRed ? redAntSpeed : normalAntSpeed); }

function createAnt(isRed = false, isQueen = false, x, y) {
  const base   = isRed ? redAntLifespan : normalAntLifespan;
  const jitter = 1 + (Math.random() * 0.2 - 0.1);
  return {
    id: nextAntId++,
    x: x !== undefined ? x : Math.random() * canvas.width,
    y: y !== undefined ? y : Math.random() * canvas.height,
    angle: Math.random() * Math.PI * 2,
    isRed, isQueen,
    baseLifespan: base,
    lifespan: isQueen ? Infinity : base * jitter,
    age: 0,                                        // ms lived; drives the newborn grace period
    breedingTimer: Math.random() * matingSpeed,
    matingJitter: 0.7 + Math.random() * 0.6,       // per-ant ×0.7–1.3 on the mating interval, so pairs don't sync
    mateUrge: TUNE.MATE_URGE_MIN + Math.random() * (TUNE.MATE_URGE_MAX - TUNE.MATE_URGE_MIN),  // happiness it must reach to be willing to mate ("horniness")
    spawnTimer: 0,
    // A hidden temperament and a jittered starting mood so no two ants are alike.
    happiness: clamp(TUNE.HAPPINESS_START + (Math.random() * 2 - 1) * TUNE.HAPPINESS_JITTER, 0, 100),
    temperament: 1 + (Math.random() * TUNE.TEMPERAMENT_SPREAD - TUNE.TEMPERAMENT_SPREAD / 2),
    fullness: clamp(TUNE.FULLNESS_START + (Math.random() * 2 - 1) * TUNE.FULLNESS_JITTER, 0, 100),
    hungerPoint: TUNE.HUNGER_MIN + Math.random() * (TUNE.HUNGER_MAX - TUNE.HUNGER_MIN),
    wet: false,
    poisoned: false,
    slowed: 0,
    speedBoost: 0,      // ticks left moving faster after protein
    mateBoost: 0,       // ticks left keen to mate after protein
    trail: 0,
    carrying: null,     // { type, age } while hauling food back to the nest
    dropOffset: null,   // where in the nest ring this ant will drop it
    carryTicks: 0,
    hauling: null,      // the carcass this ant is on a team for
    haulCooldown: 0,    // ticks left ignoring carcasses after a team gave up
    wallCooldown: 0     // ticks left peeling away from a wall before chasing again
  };
}

// Walls and (dug) soil both block movement.
function collidesWall(x, y) {
  let hit = false;
  forEachEnvNear(x, y, 40, o => {
    if (hit || (o.type !== 'wall' && o.type !== 'soil')) return;
    const r = (o.r || 4) + 3;
    if (dist2(o.x, o.y, x, y) < r * r) hit = true;
  });
  return hit;
}

// Where auto-food may land: not on solid terrain (wall/soil), not in water, and
// not on top of a queen. Keeps drops out of structures and off the royals.
function foodSpawnAllowed(x, y) {
  let ok = true;
  forEachEnvNear(x, y, 40, o => {
    if (!ok) return;
    const r = (o.r || 4) + 4;
    if (dist2(o.x, o.y, x, y) < r * r) ok = false;   // wall, soil or water all exclude
  });
  if (!ok) return false;
  for (const q of [queens.white, queens.red]) {
    if (q && dist2(q.x, q.y, x, y) < 16 * 16) return false;
  }
  return true;
}

// Raise one soil block at (x,y): a brown wall the colony builds with. Refuses to
// stack on terrain already there or to bury a spawn point's clear core.
function digSoil(x, y) {
  x = clamp(x, 0, canvas.width);
  y = clamp(y, 0, canvas.height);
  if (collidesWall(x, y)) return false;
  for (const isRed of [false, true]) {
    for (const s of colonySpawnPoints(isRed)) {
      if (dist2(s.x, s.y, x, y) < nestCore(s) * nestCore(s)) return false;
    }
  }
  environment.push({ x, y, type: 'soil', r: SOIL_R });
  markEnvDirty();
  return true;
}

function spawnNear(parent, isRed) {
  // Newborns appear beside the parent, but never inside a wall: otherwise a
  // chain of births could creep through to the other side. A wider scatter
  // keeps a breeding cluster from piling births onto one spot.
  const a = Math.random() * Math.PI * 2;
  const d = 10 + Math.random() * 20;
  let x = (parent.x + Math.cos(a) * d + canvas.width)  % canvas.width;
  let y = (parent.y + Math.sin(a) * d + canvas.height) % canvas.height;
  if (collidesWall(x, y)) { x = parent.x; y = parent.y; }
  return createAnt(isRed, false, x, y);
}

function makeFood(x, y, type, extra = {}) {
  const f = { x, y, type, delivered: false, foundBy: null, age: 0 };
  if (type === 'insect') Object.assign(f, { haulers: [], servings: insectServings(), dropOffset: null, stuck: 0, waited: 0, heading: 0 });
  Object.assign(f, extra);
  // units = trips left to haul this piece home; size = the brush it was drawn
  // with, so a fatter brush drops fatter food. Backfill both if not supplied.
  if (!Number.isFinite(f.units)) f.units = initialUnits(type);
  if (!Number.isFinite(f.size))  f.size  = penWidth || 4;
  return f;
}

function addFood(x, y, type, extra = {}) {
  if (foods.length >= MAX_FOOD) return false;
  foods.push(makeFood(x, y, type, extra));
  return true;
}

// Whether this ant is one of the finders of a piece of delivered food.
function foundByAnt(f, ant) {
  return Array.isArray(f.foundBy) ? f.foundBy.includes(ant.id) : f.foundBy === ant.id;
}

function foodRadius(f) {
  const base = f.type === 'insect' ? INSECT_RADIUS : f.type === 'fruit' ? 6 : 4;
  return base * clamp((f.size || 4) / 4, 0.6, 3);   // brush 4 is the baseline drop
}

// Manually added ants appear at one of their colony's spawn points (nudged
// out of any wall).
function createAntAtSpawn(isRed) {
  return spawnNear(randomSpawnPoint(isRed), isRed);
}

// A queen is born at one of her colony's spawn points, not out in the open.
function spawnQueen(isRed) {
  const s = randomSpawnPoint(isRed);
  return createAnt(isRed, true, s.x, s.y);
}

// Pick a spot in the nest ring, as an offset so it applies to whichever nest
// turns out to be nearest on the way home.
function pickDropOffset(clearance = 4, isRed = false, x = 0, y = 0) {
  const s = nearestSpawnPoint(isRed, x, y);
  let dx = 0, dy = 0;
  const lo = nestCore(s) + clearance, hi = Math.max(lo, s.r - 4);
  for (let tries = 0; tries < 6; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = lo + Math.random() * (hi - lo);
    dx = Math.cos(a) * d; dy = Math.sin(a) * d;
    if (!collidesWall(s.x + dx, s.y + dy)) break;
  }
  return { dx, dy };
}

// The nearest piece of this colony's own stockpile to its nest, if any.
function nearestColonyDelivered(s, isRed) {
  let best = null, bd = (s.r + 20) * (s.r + 20);
  for (const f of foods) {
    if (!f.delivered || f.team !== isRed) continue;
    const d = dist2(f.x, f.y, s.x, s.y);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function dropTarget(ant) {
  const s = nearestSpawnPoint(ant.isRed, ant.x, ant.y);
  const anchor = nearestColonyDelivered(s, ant.isRed);
  if (!anchor) return nestTarget(s, ant.dropOffset, 4);   // the first piece sets the pile's anchor
  // Every later piece packs against the stockpile, on the ant's approach side.
  const ang = Math.atan2(ant.y - anchor.y, ant.x - anchor.x);
  const r = 2 * foodRadius(anchor);
  return { x: anchor.x + Math.cos(ang) * r, y: anchor.y + Math.sin(ang) * r };
}

function layPheromone(x, y, strength = 1) {
  if (pheromones.length >= MAX_PHEROMONES) pheromones.shift();
  pheromones.push({ x, y, strength });
}

function killAnt(index) {
  const a = ants[index];
  ants.splice(index, 1);
  // Whatever it was hauling lands where it fell, unclaimed.
  if (a.carrying) addFood(a.x, a.y, a.carrying.type, { age: a.carrying.age, size: a.carrying.size, units: 1 });
  if (a.hauling) leaveTeam(a);
  if (a.isRed) totalDeadRed++;
  else totalDeadWhite++;
}

