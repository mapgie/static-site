// ant-farm — math, colony & canvas helpers, spatial grid
'use strict';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

// Smallest signed difference between two angles, in [-PI, PI]
function angleDiff(target, current) {
  let d = (target - current) % (Math.PI * 2);
  if (d >  Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function steerToward(ant, tx, ty, weight) {
  const want = Math.atan2(ty - ant.y, tx - ant.x);
  ant.angle += angleDiff(want, ant.angle) * weight;
}

function steerAway(ant, tx, ty, weight) {
  const want = Math.atan2(ant.y - ty, ant.x - tx);
  ant.angle += angleDiff(want, ant.angle) * weight;
}

// Fruit spoils after one decay stage and spoiled food turns to poison after
// another. Rate 25 is ~40s a stage; 100 is 10s.
function decayStageMs() { return 1000000 / clamp(foodDecayRate, 1, 100); }

function colonyKey(isRed) { return isRed ? 'red' : 'yellow'; }

function colonySpawnPoints(isRed) {
  const list = spawnPoints[colonyKey(isRed)];
  return list.length ? list : [{ x: canvas.width / 2, y: canvas.height / 2, r: NEST_RADIUS }];
}

function addSpawnPoint(isRed, x, y, r = NEST_RADIUS) {
  const s = { x: clamp(x, 0, canvas.width), y: clamp(y, 0, canvas.height), r: clamp(r, NEST_MIN_R, NEST_MAX_R) };
  spawnPoints[colonyKey(isRed)].push(s);
  return s;
}

function removeSpawnPoint(s) {
  for (const k of ['yellow', 'red']) {
    const i = spawnPoints[k].indexOf(s);
    if (i !== -1) spawnPoints[k].splice(i, 1);
  }
}

function pointIsRed(s) { return spawnPoints.red.includes(s); }

// The clear centre of a nest grows a little with the nest.
function nestCore(s) { return clamp(s.r * 0.3, 8, NEST_CORE * 2.5); }

// Apply a drop offset to a nest, kept inside its ring and off its centre
// whatever size that nest happens to be.
function nestTarget(s, off, clearance) {
  const m  = Math.hypot(off.dx, off.dy) || 1;
  const lo = nestCore(s) + clearance, hi = Math.max(lo, s.r - 4);
  const k  = clamp(m, lo, hi) / m;
  return { x: s.x + off.dx * k, y: s.y + off.dy * k };
}

function randomSpawnPoint(isRed) {
  const list = colonySpawnPoints(isRed);
  return list[(Math.random() * list.length) | 0];
}

// The colony's nearest nest to a position: where food from around there goes.
function nearestSpawnPoint(isRed, x, y) {
  let best = null, bd = Infinity;
  for (const s of colonySpawnPoints(isRed)) {
    const d = dist2(s.x, s.y, x, y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

function countWhiteAnts() { return ants.reduce((n, a) => n + (a.isRed ? 0 : 1), 0); }
function countRedAnts()   { return ants.reduce((n, a) => n + (a.isRed ? 1 : 0), 0); }

function snapshotEnvironment() {
  environmentHistory.push(environment.slice());
  if (environmentHistory.length > 20) environmentHistory.shift();
}

function markEnvDirty() { envDirty = true; }

// Convert a mouse/touch event into canvas bitmap coordinates, taking CSS
// scaling into account so drawing lands where the pointer is.
function getCanvasCoords(e) {
  const r  = canvas.getBoundingClientRect();
  const t  = e.touches && e.touches[0] ? e.touches[0] : e;
  const sx = canvas.width  / r.width;
  const sy = canvas.height / r.height;
  return { x: (t.clientX - r.left) * sx, y: (t.clientY - r.top) * sy };
}

function interpolate(x0, y0, x1, y1, fn) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fn(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t);
  }
}

// ---------------------------------------------------------------------------
// Spatial grid for walls / water so collision checks stay cheap
// ---------------------------------------------------------------------------
function rebuildEnvGrid() {
  envGrid = new Map();
  for (const o of environment) {
    const key = ((o.x / GRID_CELL) | 0) + ',' + ((o.y / GRID_CELL) | 0);
    let cell = envGrid.get(key);
    if (!cell) { cell = []; envGrid.set(key, cell); }
    cell.push(o);
  }
  envDirty = false;
}

function forEachEnvNear(x, y, radius, fn) {
  const c0x = ((x - radius) / GRID_CELL) | 0, c1x = ((x + radius) / GRID_CELL) | 0;
  const c0y = ((y - radius) / GRID_CELL) | 0, c1y = ((y + radius) / GRID_CELL) | 0;
  for (let cx = c0x; cx <= c1x; cx++) {
    for (let cy = c0y; cy <= c1y; cy++) {
      const cell = envGrid.get(cx + ',' + cy);
      if (cell) for (const o of cell) fn(o);
    }
  }
}

