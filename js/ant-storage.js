// ant-farm — localStorage persistence
'use strict';

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

// The reproducible parameters: everything the sliders and the tuning panel
// drive. This is what a saved "configuration" captures (alongside spawn points).
function collectSettings() {
  return {
    matingSpeed, normalAntLifespan, redAntLifespan,
    allowRedBreeding, sadistMode, redAggressionLevel, penWidth, foodDecayRate,
    normalAntSpeed, redAntSpeed, autoFood, tune: { ...TUNE }
  };
}

// The whole world plus its settings — the full autosave / snapshot payload.
function serializeWorld() {
  // hauling is an object reference; the carcass keeps the team's ids instead
  const serialiseAnt = a => ({ ...a, hauling: null, lifespan: a.lifespan === Infinity ? null : a.lifespan });
  return {
    ants: ants.map(serialiseAnt),
    queens: { white: queens.white && serialiseAnt(queens.white), red: queens.red && serialiseAnt(queens.red) },
    foods, environment, spawnPoints, showSpawnPoints,
    totalBornWhite, totalDeadWhite, totalBornRed, totalDeadRed,
    matedWhite, spawnedWhite, matedRed, spawnedRed,
    ...collectSettings()
  };
}

function saveFarm() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(serializeWorld()));
  } catch (err) {
    console.warn('Could not save ant farm', err);
  }
}

// --- Applying a saved payload, in three independent parts -------------------

// Parameters only. Leaves ants, food, terrain and spawn points untouched.
function applySettings(d) {
  if (!d || typeof d !== 'object') return;
  matingSpeed        = d.matingSpeed        || matingSpeed;
  normalAntLifespan  = d.normalAntLifespan  || normalAntLifespan;
  redAntLifespan     = d.redAntLifespan     || redAntLifespan;
  allowRedBreeding   = d.allowRedBreeding !== undefined ? !!d.allowRedBreeding : allowRedBreeding;
  sadistMode         = d.sadistMode !== undefined ? !!d.sadistMode : sadistMode;
  if (d.tune) TUNE = { ...TUNE_DEFAULTS, ...d.tune };
  redAggressionLevel = d.redAggressionLevel !== undefined ? +d.redAggressionLevel : redAggressionLevel;
  penWidth           = d.penWidth || penWidth;
  foodDecayRate      = d.foodDecayRate || foodDecayRate;
  autoFood           = d.autoFood !== undefined ? !!d.autoFood : autoFood;
  normalAntSpeed     = Number.isFinite(d.normalAntSpeed) ? clamp(d.normalAntSpeed, 0.5, 2) : normalAntSpeed;
  redAntSpeed        = Number.isFinite(d.redAntSpeed)    ? clamp(d.redAntSpeed,    0.5, 2) : redAntSpeed;
}

// The colony spawn points (clamped onto the current board).
function applySpawnPoints(d) {
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
}

function reviveAnt(a) {
  return {
    ...createAnt(!!a.isRed, !!a.isQueen, a.x, a.y),
    ...a,
    lifespan: a.isQueen || a.lifespan === null ? Infinity : a.lifespan,
    baseLifespan: a.baseLifespan || (a.isRed ? redAntLifespan : normalAntLifespan),
    // Re-jitter the mating timer on load so a saved colony doesn't breed in one wave.
    breedingTimer: Math.random() * matingSpeed, spawnTimer: 0, trail: 0, speedBoost: 0, mateBoost: 0
  };
}

// The live world: ants, queens, food, terrain and the running totals.
function applyWorld(d) {
  ants         = Array.isArray(d.ants) ? d.ants.map(reviveAnt) : [];
  queens.white = d.queens && d.queens.white ? reviveAnt(d.queens.white) : null;
  queens.red   = d.queens && d.queens.red   ? reviveAnt(d.queens.red)   : null;
  nextAntId = Math.max(nextAntId, ...[...ants, queens.white, queens.red].map(a => (a && a.id) || 0)) + 1;
  foods        = Array.isArray(d.foods)
    ? d.foods.map(f => {
        const extra = { delivered: !!f.delivered, foundBy: f.foundBy ?? null, age: f.age || 0, team: !!f.team };
        if (Number.isFinite(f.units))    extra.units = f.units;    // trips left to haul
        if (Number.isFinite(f.size))     extra.size = f.size;      // brush it was drawn with
        if (Number.isFinite(f.servings)) extra.servings = f.servings;
        if (f.type === 'insect') Object.assign(extra, {
          haulers: Array.isArray(f.haulers) ? f.haulers : [], servings: f.servings || insectServings(),
          dropOffset: f.dropOffset || null, heading: f.heading || 0
        });
        return makeFood(f.x, f.y, f.type, extra);
      })
    : [];
  pruneHaulers();
  for (const f of foods) if (f.haulers) for (const id of f.haulers) {
    const a = ants.find(x => x.id === id);
    if (a) a.hauling = f;
  }
  environment  = Array.isArray(d.environment) ? d.environment : [];
  showSpawnPoints = !!d.showSpawnPoints;

  totalBornWhite = d.totalBornWhite || 0;
  totalDeadWhite = d.totalDeadWhite || 0;
  totalBornRed   = d.totalBornRed   || 0;
  totalDeadRed   = d.totalDeadRed   || 0;
  matedWhite   = d.matedWhite   || 0;
  spawnedWhite = d.spawnedWhite || 0;
  matedRed     = d.matedRed     || 0;
  spawnedRed   = d.spawnedRed   || 0;
}

// Restore a complete payload (settings + spawn points + world).
function applyState(d) {
  if (!d || typeof d !== 'object') return;
  applySettings(d);
  applyWorld(d);
  applySpawnPoints(d);
  markEnvDirty();
  writeSettingsToControls();
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
  applyState(d);
}
