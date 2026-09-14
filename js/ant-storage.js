// ant-farm — localStorage persistence
'use strict';

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
      allowRedBreeding, sadistMode, redAggressionLevel, penWidth, foodDecayRate,
      normalAntSpeed, redAntSpeed, tune: TUNE
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
    breedingTimer: 0, spawnTimer: 0, trail: 0, speedBoost: 0, mateBoost: 0
  });

  matingSpeed        = d.matingSpeed        || matingSpeed;
  normalAntLifespan  = d.normalAntLifespan  || normalAntLifespan;
  redAntLifespan     = d.redAntLifespan     || redAntLifespan;
  allowRedBreeding   = d.allowRedBreeding !== undefined ? !!d.allowRedBreeding : allowRedBreeding;
  sadistMode         = d.sadistMode !== undefined ? !!d.sadistMode : sadistMode;
  if (d.tune) TUNE = { ...TUNE_DEFAULTS, ...d.tune };
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
    ? d.foods.map(f => {
        const extra = { delivered: !!f.delivered, foundBy: f.foundBy ?? null, age: f.age || 0, team: !!f.team };
        if (Number.isFinite(f.units))    extra.units = f.units;    // trips left to haul
        if (Number.isFinite(f.size))     extra.size = f.size;      // brush it was drawn with
        if (Number.isFinite(f.servings)) extra.servings = f.servings;
        if (f.type === 'insect') Object.assign(extra, {
          haulers: Array.isArray(f.haulers) ? f.haulers : [], servings: f.servings || INSECT_SERVINGS,
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
