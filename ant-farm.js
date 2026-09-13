// ant-farm.js — Ant Farm Simulator
'use strict';

const SAVE_KEY       = 'antFarmSave';
const MAX_WHITE_ANTS = 500;
const MAX_RED_ANTS   = 500;
const MAX_FOOD       = 300;
const MAX_PHEROMONES = 1500;
const TICK_MS        = 16;
const GRID_CELL      = 32;
const POISON_CAP     = 0.2; // at most 20% of a colony can be poisoned at once

const SENSE_FOOD  = 180;
const SENSE_PREY  = 160;
const SENSE_TRAIL = 45;
const EAT_RANGE   = 8;
const BITE_RANGE  = 8;
const MATE_RANGE  = 30;

// The nest: ants drop food off in a ring around the spawn point, never on it.
const NEST_CORE   = 12;   // keep the spawn point itself clear (scales a little with size)
const NEST_RADIUS = 40;   // default drop-off radius; each point can be resized
const NEST_MIN_R  = 24;
const NEST_MAX_R  = 120;
const CARRY_RETRY = 1800; // ticks before a stuck carrier picks a new drop spot

// Dead insects: too big for one ant, a feast for the colony.
const INSECT_HAULERS  = 3;    // ants needed before a carcass moves
const INSECT_SERVINGS = 5;    // how many ants can eat from one
const INSECT_RADIUS   = 9;
const HAUL_PATIENCE   = 900;  // ticks a short-handed team waits before giving up
const HAUL_COOLDOWN   = 900;  // ticks a giver-upper ignores carcasses afterwards

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let ants               = [];
let foods              = [];
let pheromones         = [];
let environment        = [];
let environmentHistory = [];
let queens             = { white: null, red: null };
let spawnPoints        = { yellow: [], red: [] };   // per colony; empty = canvas centre
let showSpawnPoints    = false;  // during play; the maintenance view always shows them
let maintenance        = false;  // spawn point maintenance view
let selectedPoint      = null;
let dragPoint          = null;
let pausedBeforeMaint  = false;
let nextAntId          = 1;

let animationPaused    = false;
let whiteHappiness     = 50;
let recentWhiteDeaths  = 0;   // decays over time; feeds the happiness score
let matingSpeed        = 8200;
let allowRedBreeding   = true;
let redAggressionLevel = 50;
let normalAntLifespan  = 120000;
let redAntLifespan     = 120000;
let normalAntSpeed     = 1.1;    // px per tick; sliders hold hundredths
let redAntSpeed        = 1.05;
let foodDecayRate      = 25;     // 1..100, slider; see decayStageMs()

let totalBornWhite = 0, totalDeadWhite = 0;
let totalBornRed   = 0, totalDeadRed   = 0;

let canvas, ctx;
let lastX = null, lastY = null;
let penWidth = 4;

let envGrid   = new Map();
let envDirty  = true;
let statsTimer = 0;

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
    breedingTimer: Math.random() * matingSpeed,
    spawnTimer: 0,
    poisoned: false,
    poisonSpreadLeft: 3,
    slowed: 0,
    trail: 0,
    carrying: null,     // { type, age } while hauling food back to the nest
    dropOffset: null,   // where in the nest ring this ant will drop it
    carryTicks: 0,
    hauling: null,      // the carcass this ant is on a team for
    haulCooldown: 0     // ticks left ignoring carcasses after a team gave up
  };
}

function collidesWall(x, y) {
  let hit = false;
  forEachEnvNear(x, y, 40, o => {
    if (hit || o.type !== 'wall') return;
    const r = (o.r || 4) + 3;
    if (dist2(o.x, o.y, x, y) < r * r) hit = true;
  });
  return hit;
}

function spawnNear(parent, isRed) {
  // Newborns appear beside the parent, but never inside a wall: otherwise a
  // chain of births could creep through to the other side.
  const a = Math.random() * Math.PI * 2;
  const d = 4 + Math.random() * 8;
  let x = (parent.x + Math.cos(a) * d + canvas.width)  % canvas.width;
  let y = (parent.y + Math.sin(a) * d + canvas.height) % canvas.height;
  if (collidesWall(x, y)) { x = parent.x; y = parent.y; }
  return createAnt(isRed, false, x, y);
}

function makeFood(x, y, type, extra = {}) {
  const f = { x, y, type, delivered: false, foundBy: null, age: 0 };
  if (type === 'insect') Object.assign(f, { haulers: [], servings: INSECT_SERVINGS, dropOffset: null, stuck: 0, waited: 0, heading: 0 });
  return Object.assign(f, extra);
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
  return f.type === 'insect' ? INSECT_RADIUS : f.type === 'fruit' ? 6 : 4;
}

// Manually added ants appear at one of their colony's spawn points (nudged
// out of any wall).
function createAntAtSpawn(isRed) {
  return spawnNear(randomSpawnPoint(isRed), isRed);
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

function dropTarget(ant) {
  return nestTarget(nearestSpawnPoint(ant.isRed, ant.x, ant.y), ant.dropOffset, 4);
}

function layPheromone(x, y) {
  if (pheromones.length >= MAX_PHEROMONES) pheromones.shift();
  pheromones.push({ x, y, strength: 1 });
}

function killAnt(index) {
  const a = ants[index];
  ants.splice(index, 1);
  // Whatever it was hauling lands where it fell, unclaimed.
  if (a.carrying) addFood(a.x, a.y, a.carrying.type, { age: a.carrying.age });
  if (a.hauling) leaveTeam(a);
  if (a.isRed) totalDeadRed++;
  else { totalDeadWhite++; recentWhiteDeaths++; }
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  canvas = $('antCanvas');
  ctx    = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  readSettingsFromControls();
  loadFarm();
  setupUI();
  updateStats();
  requestAnimationFrame(animate);
});

function resizeCanvas() {
  const container = canvas.parentElement;
  const cs = getComputedStyle(container);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop)  + parseFloat(cs.paddingBottom);
  const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 80;
  const borderX = canvas.offsetWidth  - canvas.clientWidth;   // canvas border, so the
  const borderY = canvas.offsetHeight - canvas.clientHeight;  // bitmap is never scaled
  const width  = clamp(Math.floor(container.clientWidth - padX - borderX), 160, 1000);
  const height = clamp(Math.floor(window.innerHeight - headerH - padY - borderY), 240, 900);
  if (canvas.width === width && canvas.height === height) return;
  canvas.width  = width;
  canvas.height = height;
  // keep everything on the board
  for (const a of ants) { a.x = clamp(a.x, 0, width); a.y = clamp(a.y, 0, height); }
  for (const q of [queens.white, queens.red]) if (q) { q.x = clamp(q.x, 0, width); q.y = clamp(q.y, 0, height); }
  for (const list of [spawnPoints.yellow, spawnPoints.red]) {
    for (const s of list) { s.x = clamp(s.x, 0, width); s.y = clamp(s.y, 0, height); }
  }
}

function readSettingsFromControls() {
  matingSpeed        = 10000 - (+$('mating-slider').value) * 90;
  normalAntLifespan  = (+$('lifespan-slider-normal').value) * 1000;
  redAntLifespan     = (+$('lifespan-slider-red').value) * 1000;
  normalAntSpeed     = (+$('speed-slider-normal').value) / 100;
  redAntSpeed        = (+$('speed-slider-red').value) / 100;
  allowRedBreeding   = $('allow-red-breeding').checked;
  redAggressionLevel = +$('red-aggression-slider').value;
  penWidth           = +$('thickness-slider').value;
  foodDecayRate      = +$('decay-slider').value;
  showSpawnPoints    = $('show-spawn-points').checked;
  updateReadouts();
}

function updateReadouts() {
  const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  set('decay-readout',        `~${Math.round(decayStageMs() / 1000)}s per stage`);
  set('speed-readout-normal', normalAntSpeed.toFixed(2));
  set('speed-readout-red',    redAntSpeed.toFixed(2));
}

function writeSettingsToControls() {
  $('mating-slider').value          = Math.round((10000 - matingSpeed) / 90);
  $('lifespan-slider-normal').value = Math.round(normalAntLifespan / 1000);
  $('lifespan-slider-red').value    = Math.round(redAntLifespan / 1000);
  $('speed-slider-normal').value    = Math.round(normalAntSpeed * 100);
  $('speed-slider-red').value       = Math.round(redAntSpeed * 100);
  $('allow-red-breeding').checked   = allowRedBreeding;
  $('red-aggression-slider').value  = redAggressionLevel;
  $('thickness-slider').value       = penWidth;
  $('decay-slider').value           = foodDecayRate;
  $('show-spawn-points').checked    = showSpawnPoints;
  updateReadouts();
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
function setupUI() {
  const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);

  on('thickness-slider', 'input', e => { penWidth = +e.target.value; });

  // Food effects are a spoiler: hidden until the player asks
  on('food-info', 'click', e => {
    const open = $('food-legend').classList.toggle('revealed');
    e.currentTarget.setAttribute('aria-expanded', String(open));
    e.currentTarget.title = open ? 'Hide what each food does' : 'Reveal what each food does (spoiler)';
  });

  on('add-ant', 'click', () => {
    if (countWhiteAnts() < MAX_WHITE_ANTS) {
      ants.push(createAntAtSpawn(false));
      totalBornWhite++;
      updateStats(); saveFarm();
    }
  });
  on('add-red-ant', 'click', () => {
    if (countRedAnts() < MAX_RED_ANTS) {
      ants.push(createAntAtSpawn(true));
      totalBornRed++;
      updateStats(); saveFarm();
    }
  });
  on('kill-all-ants', 'click', () => {
    totalDeadWhite += countWhiteAnts();
    totalDeadRed   += countRedAnts();
    ants = [];
    queens.white = queens.red = null;
    pruneHaulers();
    updateStats(); saveFarm();
  });
  on('kill-red-ants', 'click', () => {
    totalDeadRed += countRedAnts();
    ants = ants.filter(a => !a.isRed);
    queens.red = null;
    pruneHaulers();
    updateStats(); saveFarm();
  });
  // Spawn point maintenance view
  on('spawn-maintenance', 'click', enterMaintenance);
  on('spawn-done',        'click', exitMaintenance);
  on('spawn-add-yellow',  'click', () => addPointFromPanel(false));
  on('spawn-add-red',     'click', () => addPointFromPanel(true));
  on('spawn-delete',      'click', deleteSelectedPoint);
  on('spawn-delete-all',  'click', () => { spawnPoints = { yellow: [], red: [] }; selectPoint(null); saveFarm(); });
  on('spawn-size-slider', 'input',  e => { if (selectedPoint) selectedPoint.r = +e.target.value; });
  on('spawn-size-slider', 'change', () => saveFarm());
  on('show-spawn-points', 'change', e => { showSpawnPoints = e.target.checked; saveFarm(); });
  document.addEventListener('keydown', e => {
    if (!maintenance) return;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (e.key === 'Escape') exitMaintenance();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPoint && !typing) { e.preventDefault(); deleteSelectedPoint(); }
  });

  on('destroy-world', 'click', () => {
    ants = []; foods = []; pheromones = []; environment = []; environmentHistory = [];
    queens.white = queens.red = null;
    spawnPoints = { yellow: [], red: [] };
    whiteHappiness = 50; recentWhiteDeaths = 0;
    totalBornWhite = totalDeadWhite = totalBornRed = totalDeadRed = 0;
    markEnvDirty();
    updateStats(); saveFarm();
  });

  on('toggle-controls', 'click', e => {
    const hidden = document.querySelector('main').classList.toggle('controls-hidden');
    e.currentTarget.setAttribute('aria-expanded', String(!hidden));
    const label = hidden ? 'Show controls' : 'Hide controls';
    e.currentTarget.title = label;
    e.currentTarget.setAttribute('aria-label', label);
    resizeCanvas();
  });

  on('pause-resume', 'click', e => {
    animationPaused = !animationPaused;
    e.target.textContent = animationPaused ? 'Resume' : 'Pause';
  });

  on('allow-red-breeding', 'change', e => { allowRedBreeding = e.target.checked; saveFarm(); });
  on('mating-slider', 'input', e => { matingSpeed = 10000 - (+e.target.value) * 90; saveFarm(); });
  on('lifespan-slider-normal', 'input', e => { normalAntLifespan = (+e.target.value) * 1000; saveFarm(); });
  on('lifespan-slider-red', 'input', e => { redAntLifespan = (+e.target.value) * 1000; saveFarm(); });
  on('speed-slider-normal', 'input', e => { normalAntSpeed = (+e.target.value) / 100; updateReadouts(); saveFarm(); });
  on('speed-slider-red',    'input', e => { redAntSpeed    = (+e.target.value) / 100; updateReadouts(); saveFarm(); });
  on('red-aggression-slider', 'input', e => { redAggressionLevel = +e.target.value; saveFarm(); });
  on('decay-slider', 'input', e => { foodDecayRate = +e.target.value; updateReadouts(); saveFarm(); });

  on('undoStructure', 'click', () => {
    if (environmentHistory.length) {
      environment = environmentHistory.pop();
      markEnvDirty(); saveFarm();
    }
  });
  on('delete-structures', 'click', () => {
    environment = []; environmentHistory = [];
    markEnvDirty(); saveFarm();
  });

  // Single click with no tool selected drops one piece of food
  canvas.addEventListener('click', e => {
    if (maintenance || $('environment-tool').value !== 'none') return;
    const { x, y } = getCanvasCoords(e);
    if (addFood(x, y, $('food-type').value)) saveFarm();
  });

  // Drag to draw
  const startDraw = e => { if (maintenance) return maintPointerDown(e); lastX = lastY = null; handleDraw(e); };
  const endDraw   = () => { if (maintenance) return maintPointerUp(); lastX = lastY = null; };

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    startDraw(e);
    canvas.addEventListener('mousemove', handleDraw);
  });
  ['mouseup', 'mouseleave'].forEach(evt => canvas.addEventListener(evt, () => {
    endDraw();
    canvas.removeEventListener('mousemove', handleDraw);
  }));
  canvas.addEventListener('touchstart', e => {
    startDraw(e);
    canvas.addEventListener('touchmove', handleDraw, { passive: false });
  }, { passive: false });
  ['touchend', 'touchcancel'].forEach(evt => canvas.addEventListener(evt, () => {
    endDraw();
    canvas.removeEventListener('touchmove', handleDraw);
  }));
}

function handleDraw(e) {
  if (maintenance) return maintPointerMove(e);
  const tool = $('environment-tool').value;
  if (tool === 'none') return;      // let the click handler place single food
  e.preventDefault();

  const { x, y } = getCanvasCoords(e);
  const foodType = $('food-type').value;

  if (lastX === null) {
    if (tool !== 'food') snapshotEnvironment();
    lastX = x; lastY = y;
  }

  interpolate(lastX, lastY, x, y, (ix, iy) => {
    if (tool === 'wall' || tool === 'water') {
      environment.push({ x: ix, y: iy, type: tool, r: penWidth });
    } else if (tool === 'food') {
      addFood(ix, iy, foodType);
    } else if (tool === 'bulldozer') {
      const r2 = (penWidth + 4) * (penWidth + 4);
      environment = environment.filter(o => dist2(o.x, o.y, ix, iy) > r2);
      foods       = foods.filter(f => dist2(f.x, f.y, ix, iy) > r2);
    }
  });
  if (tool !== 'food') markEnvDirty();

  lastX = x; lastY = y;
  saveFarm();
}

// ---------------------------------------------------------------------------
// Spawn point maintenance view
// ---------------------------------------------------------------------------
function enterMaintenance() {
  if (maintenance) return;
  maintenance = true;
  pausedBeforeMaint = animationPaused;
  setPaused(true);
  document.querySelector('main').classList.add('spawn-mode');
  $('spawn-panel').hidden = false;
  selectPoint(null);
}

function exitMaintenance() {
  if (!maintenance) return;
  maintenance = false;
  dragPoint = null;
  canvas.classList.remove('grabbing');
  setPaused(pausedBeforeMaint);
  document.querySelector('main').classList.remove('spawn-mode');
  $('spawn-panel').hidden = true;
  selectPoint(null);
  saveFarm();
}

function setPaused(p) {
  animationPaused = p;
  const b = $('pause-resume');
  if (b) b.textContent = p ? 'Resume' : 'Pause';
}

function selectPoint(s) {
  selectedPoint = s;
  const label = $('spawn-selected-label'), slider = $('spawn-size-slider'), del = $('spawn-delete');
  if (!label) return;
  if (s) {
    const list = spawnPoints[pointIsRed(s) ? 'red' : 'yellow'];
    label.textContent = `${pointIsRed(s) ? 'Red ant' : 'Ant'} point ${list.indexOf(s) + 1} of ${list.length}`;
    slider.disabled = false; slider.value = s.r;
    del.disabled = false;
  } else {
    label.textContent = 'Nothing selected. Click a point on the map.';
    slider.disabled = true;
    del.disabled = true;
  }
}

function addPointFromPanel(isRed) {
  // New points land near the middle, nudged so a run of adds doesn't stack.
  const jitter = () => (Math.random() - 0.5) * 80;
  const s = addSpawnPoint(isRed, canvas.width / 2 + jitter(), canvas.height / 2 + jitter());
  selectPoint(s);
  saveFarm();
}

function deleteSelectedPoint() {
  if (!selectedPoint) return;
  removeSpawnPoint(selectedPoint);
  selectPoint(null);
  saveFarm();
}

function pointAt(x, y) {
  let best = null, bd = Infinity;
  for (const k of ['yellow', 'red']) {
    for (const s of spawnPoints[k]) {
      const d = dist2(s.x, s.y, x, y);
      if (d < s.r * s.r && d < bd) { bd = d; best = s; }
    }
  }
  return best;
}

function maintPointerDown(e) {
  const { x, y } = getCanvasCoords(e);
  const s = pointAt(x, y);
  selectPoint(s);
  dragPoint = s;
  if (s) { e.preventDefault(); canvas.classList.add('grabbing'); }
}

function maintPointerMove(e) {
  if (!dragPoint) return;
  e.preventDefault();
  const { x, y } = getCanvasCoords(e);
  dragPoint.x = clamp(x, 0, canvas.width);
  dragPoint.y = clamp(y, 0, canvas.height);
}

function maintPointerUp() {
  if (dragPoint) { dragPoint = null; saveFarm(); }
  canvas.classList.remove('grabbing');
}

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
    updateFoods();
    updateAnts();
    updateQueens();
    recentWhiteDeaths *= 0.995;
  }
  adjustWhiteHappiness();
  updateWhiteHappinessBar();

  if (queens.white) drawAnt(queens.white);
  if (queens.red)   drawAnt(queens.red);
  for (const a of ants) drawAnt(a);
  if (maintenance) drawMaintenanceBanner();

  if ((statsTimer += TICK_MS) >= 250) { statsTimer = 0; updateStats(); }
  requestAnimationFrame(animate);
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------
function adjustWhiteHappiness() {
  let goodFood = 0, poisonFood = 0;
  for (const f of foods) { if (f.type === 'poison') poisonFood++; else if (f.type !== 'spoiled') goodFood++; }
  const whites = countWhiteAnts();
  const score  = 50
    + Math.min(25, goodFood / 4)
    + Math.min(15, whites / 10)
    - Math.min(15, poisonFood / 2)
    - Math.min(40, recentWhiteDeaths * 3);
  whiteHappiness = clamp(score, 0, 100);
}

// Loose food is worth picking up; delivered food is worth eating, unless this
// ant is one of those that brought it in.
function nearestFood(ant) {
  let best = null, bd = SENSE_FOOD * SENSE_FOOD;
  for (const f of foods) {
    if (f.delivered && foundByAnt(f, ant)) continue;
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

function poisonedRatio() {
  if (!ants.length) return 0;
  return ants.reduce((n, a) => n + (a.poisoned ? 1 : 0), 0) / ants.length;
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
  foods.splice(i, 1);
  ant.carrying   = { type: food.type, age: food.age || 0 };
  ant.dropOffset = pickDropOffset(4, ant.isRed, ant.x, ant.y);
  ant.carryTicks = 0;
  ant.trail = 90;                  // lay a trail from the find back to the nest
  layPheromone(ant.x, ant.y);
}

function dropOff(ant) {
  const t = dropTarget(ant);
  // If the nest is full the haul waits on the ant until there's room.
  if (!addFood(t.x, t.y, ant.carrying.type, { delivered: true, foundBy: ant.id, age: ant.carrying.age })) return;
  ant.carrying = null;
  ant.dropOffset = null;
  ant.carryTicks = 0;
}

function eat(ant, food, index) {
  const i = foods.indexOf(food);
  if (i !== -1) foods.splice(i, 1);

  switch (food.type) {
    case 'insect': {
      // One serving each: the eater joins the finders list so it can't come
      // back for seconds, and the carcass stays until it's picked clean.
      food.foundBy = Array.isArray(food.foundBy) ? food.foundBy : [];
      food.foundBy.push(ant.id);
      if (--food.servings > 0) foods.push(food);
      ant.lifespan = Math.min(ant.lifespan + ant.baseLifespan * 0.4, ant.baseLifespan * 2);
      ant.poisoned = false;
      ant.poisonSpreadLeft = 3;
      ant.slowed = 0;
      return true;
    }
    case 'sugar':
    case 'fruit':
    case 'protein': {
      const bonus = ant.baseLifespan * (food.type === 'protein' ? 0.25 : food.type === 'fruit' ? 0.2 : 0.15);
      ant.lifespan = Math.min(ant.lifespan + bonus, ant.baseLifespan * 2);
      ant.poisoned = false;
      ant.poisonSpreadLeft = 3;
      ant.slowed = 0;
      return true;
    }
    case 'spoiled':
      ant.slowed = 300;
      ant.lifespan -= ant.baseLifespan * 0.05;
      return true;
    case 'poison': {
      // The eater dies; the poison spreads to a few neighbours.
      let spread = 0;
      for (const o of ants) {
        if (o === ant || o.poisoned || spread >= 3) continue;
        if (dist2(o.x, o.y, ant.x, ant.y) < MATE_RANGE * MATE_RANGE && poisonedRatio() < POISON_CAP) {
          o.poisoned = true;
          o.lifespan *= 0.8;
          spread++;
        }
      }
      killAnt(index);
      return false;               // ant no longer exists
    }
  }
  return true;
}

function updateAnts() {
  const aggression = redAggressionLevel / 100;

  for (let i = ants.length - 1; i >= 0; i--) {
    const a = ants[i];

    if (a.haulCooldown > 0) a.haulCooldown--;
    if (a.carrying) decay(a.carrying);   // fruit keeps ripening on the way home

    // On a haul team: parked by updateFoods, still ages and can still breed
    // (a waiting pair may raise the extra hands it needs).
    if (a.hauling) {
      if (!foods.includes(a.hauling)) { a.hauling = null; }   // bulldozed away
      else {
        a.lifespan -= TICK_MS * (a.poisoned ? 1.5 : 1);
        if (a.lifespan <= 0) { killAnt(i); continue; }
        a.breedingTimer += TICK_MS;
        if (a.breedingTimer >= matingSpeed) { a.breedingTimer = 0; if (!a.poisoned) tryBreeding(a); }
        continue;
      }
    }

    // Wander
    a.angle += (Math.random() - 0.5) * 0.3;

    // Decide what to chase
    let target = null, prey = null;
    if (a.isRed && aggression > 0) {
      prey = nearestWhiteAnt(a);
      if (prey) steerToward(a, prey.x, prey.y, 0.05 + aggression * 0.25);
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
      } else {
        const p = strongestTrail(a);
        if (p) steerToward(a, p.x, p.y, 0.08);
      }
    }

    // Movement with wall bounce and water avoidance
    let speed = antSpeed(a.isRed, a.isQueen) * (a.slowed > 0 ? 0.6 : 1) * (a.poisoned ? 0.7 : 1);
    if (a.slowed > 0) a.slowed--;

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

    if (hitWall) {
      a.angle += Math.PI + (Math.random() - 0.5) * 0.8;
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

    // Red ants bite white ants
    if (prey && dist2(prey.x, prey.y, a.x, a.y) < BITE_RANGE * BITE_RANGE && Math.random() < aggression) {
      const pi = ants.indexOf(prey);
      if (pi !== -1) {
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
        if (target.delivered)           { if (!eat(a, target, i)) continue; }
        else if (target.type === 'insect') joinTeam(a, target);
        else                            pickUp(a, target);
      }
    }

    // Poison spreads by contact
    if (a.poisoned && a.poisonSpreadLeft > 0 && Math.random() < 0.05 && poisonedRatio() < POISON_CAP) {
      for (const o of ants) {
        if (o === a || o.poisoned || o.isRed !== a.isRed) continue;
        if (dist2(o.x, o.y, a.x, a.y) < 25 * 25) {
          o.poisoned = true; o.lifespan *= 0.8; a.poisonSpreadLeft--;
          break;
        }
      }
    }

    // Ageing
    a.lifespan -= TICK_MS * (a.poisoned ? 1.5 : 1);
    if (a.lifespan <= 0) { killAnt(i); continue; }

    // Breeding
    a.breedingTimer += TICK_MS;
    if (a.breedingTimer >= matingSpeed) {
      a.breedingTimer = 0;
      if (!a.poisoned) tryBreeding(a);
    }
  }
}

function tryBreeding(a) {
  if (a.isRed) {
    if (!allowRedBreeding || countRedAnts() >= MAX_RED_ANTS) return;
  } else if (countWhiteAnts() >= MAX_WHITE_ANTS) return;

  const r2 = MATE_RANGE * MATE_RANGE;
  for (const o of ants) {
    if (o === a || o.isRed !== a.isRed || o.poisoned) continue;
    if (dist2(o.x, o.y, a.x, a.y) < r2) {
      if (Math.random() < 0.35) {
        ants.push(spawnNear(a, a.isRed));
        if (a.isRed) totalBornRed++; else totalBornWhite++;
      }
      return;
    }
  }
}

function updateQueens() {
  const whites = countWhiteAnts(), reds = countRedAnts();

  // Queens arrive when the colony is thriving (white) or suffering (red)
  if (whiteHappiness >= 75 && !queens.white && whites > 0) queens.white = createAnt(false, true);
  if (whiteHappiness <  25 && !queens.red   && ants.length > 0) queens.red = createAnt(true, true);
  // ...and leave again once the mood has clearly swung the other way
  if (queens.white && whiteHappiness < 40) queens.white = null;
  if (queens.red   && whiteHappiness > 60) queens.red   = null;

  for (const q of [queens.white, queens.red]) {
    if (!q) continue;
    q.spawnTimer += TICK_MS;
    if (q.spawnTimer < 3000) continue;
    q.spawnTimer = 0;
    if (q.isRed ? reds < MAX_RED_ANTS : whites < MAX_WHITE_ANTS) {
      ants.push(spawnNear(q, q.isRed));
      if (q.isRed) totalBornRed++; else totalBornWhite++;
    }
  }
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function drawEnvironment() {
  for (const o of environment) {
    const r = o.r || 4;
    ctx.beginPath();
    if (o.type === 'wall') {
      ctx.fillStyle = '#888';
      ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
    } else {
      ctx.fillStyle = 'rgba(0,180,255,0.6)';
      ctx.arc(o.x, o.y, r + 2, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

function getFoodColor(type) {
  switch (type) {
    case 'protein': return '#ef9a9a';
    case 'spoiled': return '#3d5afe';
    case 'poison':  return '#b040ff';
    case 'fruit':   return '#ff8c00';
    case 'insect':  return '#8d6e63';
    default:        return '#f5f5f5';
  }
}

// In the maintenance view only real points are drawn (the centre fallback
// can't be dragged) and the selected one is highlighted.
function drawSpawnPoints(editing = false) {
  ctx.save();
  for (const isRed of [false, true]) {
    const rgb = isRed ? '255,59,59' : '255,240,179';
    const list = editing ? spawnPoints[colonyKey(isRed)] : colonySpawnPoints(isRed);
    for (const s of list) {
      const sel = editing && s === selectedPoint;
      ctx.lineWidth = sel ? 2 : 1;
      ctx.setLineDash(sel ? [] : [4, 4]);
      ctx.strokeStyle = `rgba(${rgb},${sel ? 0.9 : editing ? 0.6 : 0.35})`;
      ctx.fillStyle = `rgba(${rgb},${sel ? 0.12 : editing ? 0.06 : 0})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.fillStyle = `rgba(${rgb},0.12)`;
      ctx.strokeStyle = `rgba(${rgb},0.8)`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, nestCore(s), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMaintenanceBanner() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, canvas.height - 22, canvas.width, 22);
  ctx.fillStyle = '#ccc';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const n = spawnPoints.yellow.length + spawnPoints.red.length;
  ctx.fillText(n ? 'Spawn point maintenance: drag to move, click to select, then resize or delete.' : 'Spawn point maintenance: no points yet, add one from the panel.', 10, canvas.height - 11);
  ctx.restore();
}

function drawFoods() {
  for (const f of foods) {
    const r = foodRadius(f);
    ctx.beginPath();
    ctx.fillStyle = getFoodColor(f.type);
    if (f.type === 'insect') {
      ctx.ellipse(f.x, f.y, r, r * 0.55, f.heading || 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d7ccc8';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (!f.delivered && f.haulers.length && f.haulers.length < INSECT_HAULERS) {   // still short-handed
        ctx.fillStyle = '#eee';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${f.haulers.length}/${INSECT_HAULERS}`, f.x, f.y - r - 4);
      }
    } else {
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (f.delivered) {           // ready to eat
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,240,179,0.6)';
      ctx.lineWidth = 1;
      ctx.arc(f.x, f.y, r + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawPheromones() {
  let w = 0;
  for (const p of pheromones) {
    if (!animationPaused) p.strength -= 0.004;
    if (p.strength <= 0) continue;
    pheromones[w++] = p;
    ctx.beginPath();
    ctx.fillStyle = `rgba(255,230,0,${p.strength * 0.6})`;
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  pheromones.length = w;
}

function drawAnt(a) {
  const r = a.isQueen ? 12 : 4;
  ctx.beginPath();
  if (a.poisoned) ctx.fillStyle = a.isRed ? '#c2185b' : '#b388ff';
  else            ctx.fillStyle = a.isRed ? '#ff3b3b' : '#fff0b3';
  ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
  ctx.fill();

  if (a.carrying) {              // the haul rides just ahead of the ant
    ctx.beginPath();
    ctx.fillStyle = getFoodColor(a.carrying.type);
    ctx.arc(a.x + Math.cos(a.angle) * 5, a.y + Math.sin(a.angle) * 5, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  if (a.isQueen) {
    ctx.beginPath();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.arc(a.x, a.y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (a.slowed > 0) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(61,90,254,0.9)';
    ctx.lineWidth = 1.5;
    ctx.arc(a.x, a.y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function updateWhiteHappinessBar() {
  const bar = $('happiness-bar');
  if (!bar) return;
  bar.style.width = `${whiteHappiness}%`;
  let c = 'lime';
  if (whiteHappiness < 25) c = 'red';
  else if (whiteHappiness < 50) c = 'orange';
  else if (whiteHappiness >= 75) c = queens.white ? '#c77dff' : 'lime';
  bar.style.background = c;
}

function updateStats() {
  const el = $('stats');
  if (!el) return;
  const w = countWhiteAnts(), r = countRedAnts();
  const atNest = foods.reduce((n, f) => n + (f.delivered ? 1 : 0), 0);
  el.innerHTML =
    `Total Alive: ${ants.length}<br>` +
    `Yellow Ants: Alive ${w} | Born ${totalBornWhite} | Dead ${totalDeadWhite}<br>` +
    `Red Ants: Alive ${r} | Born ${totalBornRed} | Dead ${totalDeadRed}<br>` +
    `Food: ${foods.length} (${atNest} at nest) | Happiness: ${Math.round(whiteHappiness)}`;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------
function saveFarm() {
  // hauling is an object reference; the carcass keeps the team's ids instead
  const serialiseAnt = a => ({ ...a, hauling: null, lifespan: a.lifespan === Infinity ? null : a.lifespan });
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      ants: ants.map(serialiseAnt),
      queens: { white: queens.white && serialiseAnt(queens.white), red: queens.red && serialiseAnt(queens.red) },
      foods, environment, spawnPoints, showSpawnPoints,
      totalBornWhite, totalDeadWhite, totalBornRed, totalDeadRed,
      matingSpeed, normalAntLifespan, redAntLifespan,
      allowRedBreeding, redAggressionLevel, penWidth, foodDecayRate,
      normalAntSpeed, redAntSpeed
    }));
  } catch (err) {
    console.warn('Could not save ant farm', err);
  }
}

function loadFarm() {
  let d;
  try {
    const s = localStorage.getItem(SAVE_KEY);
    if (!s) return;
    d = JSON.parse(s);
  } catch (err) {
    console.warn('Could not load ant farm', err);
    return;
  }
  if (!d || typeof d !== 'object') return;

  const reviveAnt = a => ({
    ...createAnt(!!a.isRed, !!a.isQueen, a.x, a.y),
    ...a,
    lifespan: a.isQueen || a.lifespan === null ? Infinity : a.lifespan,
    baseLifespan: a.baseLifespan || (a.isRed ? redAntLifespan : normalAntLifespan),
    breedingTimer: 0, spawnTimer: 0, trail: 0
  });

  matingSpeed        = d.matingSpeed        || matingSpeed;
  normalAntLifespan  = d.normalAntLifespan  || normalAntLifespan;
  redAntLifespan     = d.redAntLifespan     || redAntLifespan;
  allowRedBreeding   = d.allowRedBreeding !== undefined ? !!d.allowRedBreeding : allowRedBreeding;
  redAggressionLevel = d.redAggressionLevel !== undefined ? +d.redAggressionLevel : redAggressionLevel;
  penWidth           = d.penWidth || penWidth;
  foodDecayRate      = d.foodDecayRate || foodDecayRate;
  normalAntSpeed     = Number.isFinite(d.normalAntSpeed) ? clamp(d.normalAntSpeed, 0.5, 2) : normalAntSpeed;
  redAntSpeed        = Number.isFinite(d.redAntSpeed)    ? clamp(d.redAntSpeed,    0.5, 2) : redAntSpeed;

  ants         = Array.isArray(d.ants) ? d.ants.map(reviveAnt) : [];
  queens.white = d.queens && d.queens.white ? reviveAnt(d.queens.white) : null;
  queens.red   = d.queens && d.queens.red   ? reviveAnt(d.queens.red)   : null;
  nextAntId = Math.max(nextAntId, ...[...ants, queens.white, queens.red].map(a => (a && a.id) || 0)) + 1;
  foods        = Array.isArray(d.foods)
    ? d.foods.map(f => makeFood(f.x, f.y, f.type, {
        delivered: !!f.delivered, foundBy: f.foundBy ?? null, age: f.age || 0,
        ...(f.type === 'insect' ? {
          haulers: Array.isArray(f.haulers) ? f.haulers : [], servings: f.servings || INSECT_SERVINGS,
          dropOffset: f.dropOffset || null, heading: f.heading || 0, team: !!f.team
        } : {})
      }))
    : [];
  pruneHaulers();
  for (const f of foods) if (f.haulers) for (const id of f.haulers) {
    const a = ants.find(x => x.id === id);
    if (a) a.hauling = f;
  }
  environment  = Array.isArray(d.environment) ? d.environment : [];
  const validPoints = list => (Array.isArray(list) ? list : [])
    .filter(s => s && Number.isFinite(s.x) && Number.isFinite(s.y))
    .map(s => ({ x: clamp(s.x, 0, canvas.width), y: clamp(s.y, 0, canvas.height), r: clamp(+s.r || NEST_RADIUS, NEST_MIN_R, NEST_MAX_R) }));
  spawnPoints = { yellow: [], red: [] };
  if (d.spawnPoints) {
    spawnPoints.yellow = validPoints(d.spawnPoints.yellow);
    spawnPoints.red    = validPoints(d.spawnPoints.red);
  } else if (d.spawnPoint) {          // older save: one point shared by both colonies
    spawnPoints.yellow = validPoints([d.spawnPoint]);
    spawnPoints.red    = validPoints([d.spawnPoint]);
  }
  showSpawnPoints = !!d.showSpawnPoints;
  markEnvDirty();

  totalBornWhite = d.totalBornWhite || 0;
  totalDeadWhite = d.totalDeadWhite || 0;
  totalBornRed   = d.totalBornRed   || 0;
  totalDeadRed   = d.totalDeadRed   || 0;

  writeSettingsToControls();
}
