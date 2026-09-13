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
const NEST_CORE   = 12;   // keep the spawn point itself clear
const NEST_RADIUS = 40;   // drop-off happens inside this radius
const CARRY_RETRY = 1800; // ticks before a stuck carrier picks a new drop spot

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let ants               = [];
let foods              = [];
let pheromones         = [];
let environment        = [];
let environmentHistory = [];
let queens             = { white: null, red: null };
let spawnPoint         = null;   // null = centre of the canvas
let nextAntId          = 1;

let animationPaused    = false;
let whiteHappiness     = 50;
let recentWhiteDeaths  = 0;   // decays over time; feeds the happiness score
let matingSpeed        = 8200;
let allowRedBreeding   = true;
let redAggressionLevel = 50;
let normalAntLifespan  = 120000;
let redAntLifespan     = 120000;

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

function getSpawnPoint() {
  return spawnPoint || { x: canvas.width / 2, y: canvas.height / 2 };
}

function setSpawnPoint(x, y) {
  spawnPoint = { x: clamp(x, 0, canvas.width), y: clamp(y, 0, canvas.height) };
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
function createAnt(isRed = false, isQueen = false, x, y) {
  const base   = isRed ? redAntLifespan : normalAntLifespan;
  const jitter = 1 + (Math.random() * 0.2 - 0.1);
  return {
    id: nextAntId++,
    x: x !== undefined ? x : Math.random() * canvas.width,
    y: y !== undefined ? y : Math.random() * canvas.height,
    angle: Math.random() * Math.PI * 2,
    isRed, isQueen,
    speed: isQueen ? 0 : (isRed ? 1.6 : 1.1),
    baseLifespan: base,
    lifespan: isQueen ? Infinity : base * jitter,
    breedingTimer: Math.random() * matingSpeed,
    spawnTimer: 0,
    poisoned: false,
    poisonSpreadLeft: 3,
    slowed: 0,
    trail: 0,
    carrying: null,     // { type } while hauling food back to the nest
    dropOffset: null,   // where in the nest ring this ant will drop it
    carryTicks: 0
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

function addFood(x, y, type, delivered = false, foundBy = null) {
  if (foods.length >= MAX_FOOD) return false;
  foods.push({ x, y, type, delivered, foundBy });
  return true;
}

// Manually added ants appear at the spawn point (nudged out of any wall).
function createAntAtSpawn(isRed) {
  return spawnNear(getSpawnPoint(), isRed);
}

// Pick a spot in the nest ring, as an offset so it follows a moved spawn point.
function pickDropOffset() {
  const s = getSpawnPoint();
  let dx = 0, dy = 0;
  for (let tries = 0; tries < 6; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = NEST_CORE + 4 + Math.random() * (NEST_RADIUS - NEST_CORE - 8);
    dx = Math.cos(a) * d; dy = Math.sin(a) * d;
    if (!collidesWall(s.x + dx, s.y + dy)) break;
  }
  return { dx, dy };
}

function dropTarget(ant) {
  const s = getSpawnPoint();
  return { x: s.x + ant.dropOffset.dx, y: s.y + ant.dropOffset.dy };
}

function layPheromone(x, y) {
  if (pheromones.length >= MAX_PHEROMONES) pheromones.shift();
  pheromones.push({ x, y, strength: 1 });
}

function killAnt(index) {
  const a = ants[index];
  ants.splice(index, 1);
  // Whatever it was hauling lands where it fell, unclaimed.
  if (a.carrying) addFood(a.x, a.y, a.carrying.type);
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
  if (spawnPoint) setSpawnPoint(spawnPoint.x, spawnPoint.y);
}

function readSettingsFromControls() {
  matingSpeed        = 10000 - (+$('mating-slider').value) * 90;
  normalAntLifespan  = (+$('lifespan-slider-normal').value) * 1000;
  redAntLifespan     = (+$('lifespan-slider-red').value) * 1000;
  allowRedBreeding   = $('allow-red-breeding').checked;
  redAggressionLevel = +$('red-aggression-slider').value;
  penWidth           = +$('thickness-slider').value;
}

function writeSettingsToControls() {
  $('mating-slider').value          = Math.round((10000 - matingSpeed) / 90);
  $('lifespan-slider-normal').value = Math.round(normalAntLifespan / 1000);
  $('lifespan-slider-red').value    = Math.round(redAntLifespan / 1000);
  $('allow-red-breeding').checked   = allowRedBreeding;
  $('red-aggression-slider').value  = redAggressionLevel;
  $('thickness-slider').value       = penWidth;
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
function setupUI() {
  const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);

  on('thickness-slider', 'input', e => { penWidth = +e.target.value; });

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
    updateStats(); saveFarm();
  });
  on('kill-red-ants', 'click', () => {
    totalDeadRed += countRedAnts();
    ants = ants.filter(a => !a.isRed);
    queens.red = null;
    updateStats(); saveFarm();
  });
  on('set-spawn', 'click', () => {
    $('environment-tool').value = 'spawn';
  });

  on('destroy-world', 'click', () => {
    ants = []; foods = []; pheromones = []; environment = []; environmentHistory = [];
    queens.white = queens.red = null;
    spawnPoint = null;
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
  on('red-aggression-slider', 'input', e => { redAggressionLevel = +e.target.value; saveFarm(); });

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
    if ($('environment-tool').value !== 'none') return;
    const { x, y } = getCanvasCoords(e);
    if (addFood(x, y, $('food-type').value)) saveFarm();
  });

  // Drag to draw
  const startDraw = e => { lastX = lastY = null; handleDraw(e); };
  const endDraw   = () => { lastX = lastY = null; };

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
  const tool = $('environment-tool').value;
  if (tool === 'none') return;      // let the click handler place single food
  e.preventDefault();

  const { x, y } = getCanvasCoords(e);
  const foodType = $('food-type').value;

  if (tool === 'spawn') {           // click or drag to place the spawn point
    setSpawnPoint(x, y);
    lastX = x; lastY = y;
    saveFarm();
    return;
  }

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
// Main loop
// ---------------------------------------------------------------------------
function animate() {
  if (envDirty) rebuildEnvGrid();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawEnvironment();
  drawSpawnPoint();
  drawFoods();
  drawPheromones();

  if (!animationPaused) {
    updateAnts();
    updateQueens();
    recentWhiteDeaths *= 0.995;
  }
  adjustWhiteHappiness();
  updateWhiteHappinessBar();

  if (queens.white) drawAnt(queens.white);
  if (queens.red)   drawAnt(queens.red);
  for (const a of ants) drawAnt(a);

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
  const reds   = countRedAnts();
  const score  = 50
    + Math.min(25, goodFood / 4)
    + Math.min(15, whites / 10)
    - Math.min(15, poisonFood / 2)
    - Math.min(40, recentWhiteDeaths * 3)
    - Math.min(15, reds / 20);
  whiteHappiness = clamp(score, 0, 100);
}

// Loose food is worth picking up; delivered food is worth eating, unless this
// ant is the one that brought it in.
function nearestFood(ant) {
  let best = null, bd = SENSE_FOOD * SENSE_FOOD;
  for (const f of foods) {
    if (f.delivered && f.foundBy === ant.id) continue;
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

function pickUp(ant, food) {
  const i = foods.indexOf(food);
  if (i === -1) return;
  foods.splice(i, 1);
  ant.carrying   = { type: food.type };
  ant.dropOffset = pickDropOffset();
  ant.carryTicks = 0;
  ant.trail = 90;                  // lay a trail from the find back to the nest
  layPheromone(ant.x, ant.y);
}

function dropOff(ant) {
  const t = dropTarget(ant);
  // If the nest is full the haul waits on the ant until there's room.
  if (!addFood(t.x, t.y, ant.carrying.type, true, ant.id)) return;
  ant.carrying = null;
  ant.dropOffset = null;
  ant.carryTicks = 0;
}

function eat(ant, food, index) {
  const i = foods.indexOf(food);
  if (i !== -1) foods.splice(i, 1);

  switch (food.type) {
    case 'sugar':
    case 'protein': {
      const bonus = ant.baseLifespan * (food.type === 'protein' ? 0.25 : 0.15);
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
      if (++a.carryTicks > CARRY_RETRY) { a.dropOffset = pickDropOffset(); a.carryTicks = 0; }
    } else if (!prey) {
      target = nearestFood(a);
      if (target) {
        const keen = target.type === 'sugar' ? 0.25 : target.type === 'protein' ? 0.2 : 0.12;
        steerToward(a, target.x, target.y, keen);
      } else {
        const p = strongestTrail(a);
        if (p) steerToward(a, p.x, p.y, 0.08);
      }
    }

    // Movement with wall bounce and water avoidance
    let speed = a.speed * (a.slowed > 0 ? 0.6 : 1) * (a.poisoned ? 0.7 : 1);
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
    } else if (target && dist2(target.x, target.y, a.x, a.y) < EAT_RANGE * EAT_RANGE) {
      if (target.delivered) {
        if (!eat(a, target, i)) continue;
      } else {
        pickUp(a, target);
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
    case 'protein': return '#3cb043';
    case 'spoiled': return '#3d5afe';
    case 'poison':  return '#b040ff';
    default:        return '#f5f5f5';
  }
}

function drawSpawnPoint() {
  const s = getSpawnPoint();
  ctx.save();
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = 'rgba(255,240,179,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(s.x, s.y, NEST_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(255,240,179,0.12)';
  ctx.strokeStyle = 'rgba(255,240,179,0.8)';
  ctx.beginPath();
  ctx.arc(s.x, s.y, NEST_CORE, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawFoods() {
  for (const f of foods) {
    ctx.beginPath();
    ctx.fillStyle = getFoodColor(f.type);
    ctx.arc(f.x, f.y, 4, 0, Math.PI * 2);
    ctx.fill();
    if (f.delivered) {           // ready to eat
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,240,179,0.6)';
      ctx.lineWidth = 1;
      ctx.arc(f.x, f.y, 6, 0, Math.PI * 2);
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
  const serialiseAnt = a => ({ ...a, lifespan: a.lifespan === Infinity ? null : a.lifespan });
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      ants: ants.map(serialiseAnt),
      queens: { white: queens.white && serialiseAnt(queens.white), red: queens.red && serialiseAnt(queens.red) },
      foods, environment, spawnPoint,
      totalBornWhite, totalDeadWhite, totalBornRed, totalDeadRed,
      matingSpeed, normalAntLifespan, redAntLifespan,
      allowRedBreeding, redAggressionLevel, penWidth
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

  ants         = Array.isArray(d.ants) ? d.ants.map(reviveAnt) : [];
  queens.white = d.queens && d.queens.white ? reviveAnt(d.queens.white) : null;
  queens.red   = d.queens && d.queens.red   ? reviveAnt(d.queens.red)   : null;
  nextAntId = Math.max(nextAntId, ...[...ants, queens.white, queens.red].map(a => (a && a.id) || 0)) + 1;
  foods        = Array.isArray(d.foods)
    ? d.foods.map(f => ({ x: f.x, y: f.y, type: f.type, delivered: !!f.delivered, foundBy: f.foundBy ?? null }))
    : [];
  environment  = Array.isArray(d.environment) ? d.environment : [];
  spawnPoint   = d.spawnPoint && Number.isFinite(d.spawnPoint.x) && Number.isFinite(d.spawnPoint.y) ? d.spawnPoint : null;
  if (spawnPoint) setSpawnPoint(spawnPoint.x, spawnPoint.y);
  markEnvDirty();

  totalBornWhite = d.totalBornWhite || 0;
  totalDeadWhite = d.totalDeadWhite || 0;
  totalBornRed   = d.totalBornRed   || 0;
  totalDeadRed   = d.totalDeadRed   || 0;

  writeSettingsToControls();
}
