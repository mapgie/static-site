'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { freshApi } = require('./harness');

test('World Building Mode is on by default', () => {
  const g = freshApi();
  assert.strictEqual(g.worldBuilding, true);
});

test('foodSpawnAllowed: open ground is fine', () => {
  const g = freshApi();
  g.rebuildEnvGrid();
  assert.strictEqual(g.foodSpawnAllowed(500, 300), true);
});

test('foodSpawnAllowed: not on soil, walls or water', () => {
  const g = freshApi();
  g.environment = [
    { x: 100, y: 100, type: 'wall',  r: 4 },
    { x: 200, y: 200, type: 'soil',  r: 5 },
    { x: 300, y: 300, type: 'water', r: 4 }
  ];
  g.rebuildEnvGrid();
  assert.strictEqual(g.foodSpawnAllowed(100, 100), false, 'wall blocks');
  assert.strictEqual(g.foodSpawnAllowed(200, 200), false, 'soil blocks');
  assert.strictEqual(g.foodSpawnAllowed(300, 300), false, 'water blocks');
  assert.strictEqual(g.foodSpawnAllowed(700, 500), true,  'clear spot allowed');
});

test('foodSpawnAllowed: not on top of a queen', () => {
  const g = freshApi();
  g.queens = { white: { x: 400, y: 400 }, red: null };
  g.rebuildEnvGrid();
  assert.strictEqual(g.foodSpawnAllowed(402, 400), false);
  assert.strictEqual(g.foodSpawnAllowed(460, 400), true);
});

test('digSoil raises a brown block that then blocks movement', () => {
  const g = freshApi();
  g.rebuildEnvGrid();
  assert.strictEqual(g.collidesWall(200, 150), false);
  assert.strictEqual(g.digSoil(200, 150), true);   // off-centre, clear of the default nest
  assert.strictEqual(g.environment.length, 1);
  assert.strictEqual(g.environment[0].type, 'soil');
  g.rebuildEnvGrid();
  assert.strictEqual(g.collidesWall(200, 150), true, 'soil blocks like a wall');
});

test('digSoil refuses to stack on existing terrain', () => {
  const g = freshApi();
  g.environment = [{ x: 500, y: 300, type: 'wall', r: 4 }];
  g.rebuildEnvGrid();
  assert.strictEqual(g.digSoil(500, 300), false);
  assert.strictEqual(g.environment.length, 1);
});

test('digSoil will not bury a spawn point core', () => {
  const g = freshApi();
  g.spawnPoints = { yellow: [{ x: 500, y: 300, r: 40 }], red: [] };
  g.rebuildEnvGrid();
  assert.strictEqual(g.digSoil(500, 300), false, 'centre of nest stays clear');
  assert.strictEqual(g.digSoil(500, 360), true, 'outside the core is fine');
});

// --- Nest construction ------------------------------------------------------

function colony(g, n) {                     // n white ants at the nest
  g.spawnPoints = { yellow: [{ x: 200, y: 300, r: 40 }], red: [{ x: 800, y: 300, r: 40 }] };
  g.ants = [];
  for (let i = 0; i < n; i++) g.ants.push(g.createAnt(false, false, 200, 300));
  return g;
}

test('planNest lays out one of each room only when the colony is big enough and building', () => {
  const g = colony(freshApi(), 3);
  g.planNest(false);
  assert.strictEqual(g.rooms.length, 0, 'a tiny colony builds nothing');

  colony(g, 6);
  g.planNest(false);
  const types = g.rooms.map(r => r.type).sort().join(',');
  assert.strictEqual(types, 'entry,nursery,pantry,throne');
  g.planNest(false);
  assert.strictEqual(g.rooms.length, 4, 'planning again adds nothing');

  const g2 = colony(freshApi(), 20);
  g2.worldBuilding = false;
  g2.planNest(false);
  assert.strictEqual(g2.rooms.length, 0, 'no building when the mode is off');
});

test('the nursery and throne are placed farther from the rival than the entry', () => {
  const g = colony(freshApi(), 8);
  g.planNest(false);
  const red = { x: 800, y: 300 };
  const d = t => { const r = g.rooms.find(x => x.type === t); return (r.x - red.x) ** 2 + (r.y - red.y) ** 2; };
  assert.ok(d('nursery') > d('entry'), 'nursery sits away from the rival');
  assert.ok(d('throne')  > d('entry'), 'throne sits away from the rival');
});

test('room caps: one throne, unlimited pantries', () => {
  const g = colony(freshApi(), 8);
  g.planNest(false);
  assert.strictEqual(g.roomCount(false, 'throne'), 1);
  assert.strictEqual(g.addRoomManual(false, 'throne'), false, 'no second throne');
  assert.strictEqual(g.addRoomManual(false, 'pantry'), true, 'another pantry is fine');
  assert.strictEqual(g.roomCount(false, 'pantry'), 2);
});

test('nursery gate: past the threshold, no births without a built nursery', () => {
  const mk = g => { const a = g.createAnt(false, false, 200, 300); a.happiness = 100; a.fullness = 100; a.age = 1e6; a.breedingTimer = 1e9; return a; };
  const bigColony = g => { g.spawnPoints = { yellow: [{ x: 200, y: 300, r: 40 }], red: [] };
                           g.ants = []; for (let i = 0; i < g.TUNE.NURSERY_REQUIRED_ABOVE + 1; i++) g.ants.push(mk(g)); };

  // No nursery -> the gate blocks every attempt, and posts the nudge.
  const g = freshApi(); g.rooms = []; bigColony(g);
  let births = 0;
  for (let i = 0; i < 200; i++) { const n = g.ants.length; g.tryBreeding(g.ants[0]); if (g.ants.length > n) births++; g.ants.length = Math.min(g.ants.length, g.TUNE.NURSERY_REQUIRED_ABOVE + 1); }
  assert.strictEqual(births, 0, 'blocked without a nursery');
  assert.ok(g.nurseryNoticeUntil > Date.now() - 1000, 'the "needs a nursery" nudge was posted');

  // A built nursery reopens breeding.
  const g2 = freshApi(); bigColony(g2);
  g2.rooms = [{ id: 1, team: false, type: 'nursery', x: 150, y: 300, r: 40, sites: [], built: true, order: 2 }];
  let b2 = 0;
  for (let i = 0; i < 300; i++) { g2.ants.length = g2.TUNE.NURSERY_REQUIRED_ABOVE + 1; g2.tryBreeding(g2.ants[0]); if (g2.ants.length > g2.TUNE.NURSERY_REQUIRED_ABOVE + 1) b2++; }
  assert.ok(b2 > 0, 'a built nursery lets the colony grow again');
});

test('builders dig a room: an ant on a wall site raises soil there', () => {
  const g = colony(freshApi(), 6);
  g.planNest(false);
  g.rebuildEnvGrid();
  const entry = g.rooms.find(r => r.type === 'entry');
  const site = entry.sites[0];
  const a = g.ants[0];
  a.x = site.x; a.y = site.y; a.fullness = 100; a.hungerPoint = 40; a.carrying = null; a.wallCooldown = 0; a.age = 1e6;
  for (let i = 0; i < 8; i++) { g.updateAnts(); g.rebuildEnvGrid(); }
  assert.ok(g.environment.some(o => o.type === 'soil'), 'a soil wall block was raised');
});
