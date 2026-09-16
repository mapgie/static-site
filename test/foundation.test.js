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

  // A built nursery reopens breeding — as eggs laid in the nursery.
  const g2 = freshApi(); bigColony(g2);
  g2.rooms = [{ id: 1, team: false, type: 'nursery', x: 150, y: 300, r: 40, sites: [], tunnelSites: [], built: true, order: 2 }];
  let eggsLaid = 0;
  for (let i = 0; i < 300; i++) { g2.eggs = []; g2.tryBreeding(g2.ants[0]); eggsLaid += g2.eggs.length; }
  assert.ok(eggsLaid > 0, 'a built nursery lets the colony grow again (via eggs)');
});

test('builders dig a room: an ant at a wall site raises soil there', () => {
  const g = colony(freshApi(), 6);
  g.planNest(false);
  g.rebuildEnvGrid();
  const entry = g.rooms.find(r => r.type === 'entry');
  const site = entry.sites[0];
  const a = g.ants[0];
  g.ants = [a];   // isolate one builder (the cap would otherwise hand the slots to its nestmates)
  a.x = site.ax; a.y = site.ay; a.fullness = 100; a.hungerPoint = 40; a.carrying = null; a.wallCooldown = 0; a.age = 1e6;
  for (let i = 0; i < 55; i++) { g.updateAnts(); g.rebuildEnvGrid(); }   // BUILD_TICKS + travel
  assert.ok(g.environment.some(o => o.type === 'soil'), 'a soil wall block was raised');
});

test('ringed rooms are placed fully on-canvas even from an edge nest', () => {
  const g = freshApi();
  g.spawnPoints = { yellow: [{ x: 70, y: 70, r: 40 }], red: [{ x: 800, y: 300, r: 40 }] };
  g.ants = []; for (let i = 0; i < 8; i++) g.ants.push(g.createAnt(false, false, 70, 70));
  g.planNest(false);
  // The nursery is pinned to the spawn point by design; the ringed rooms must fit.
  for (const room of g.rooms) {
    if (room.type === 'nursery') continue;
    assert.ok(room.x - room.r >= 0 && room.x + room.r <= g.canvas.width,  `${room.type} within width`);
    assert.ok(room.y - room.r >= 0 && room.y + room.r <= g.canvas.height, `${room.type} within height`);
  }
});

test('the nursery is built on the spawn point', () => {
  const g = freshApi();
  g.spawnPoints = { yellow: [{ x: 320, y: 280, r: 40 }], red: [{ x: 800, y: 300, r: 40 }] };
  g.ants = []; for (let i = 0; i < 8; i++) g.ants.push(g.createAnt(false, false, 320, 280));
  g.planNest(false);
  const nursery = g.rooms.find(r => r.type === 'nursery');
  assert.ok(Math.abs(nursery.x - 320) < 1 && Math.abs(nursery.y - 280) < 1, 'nursery sits on the spawn');
});

test('planned rooms never overlap each other', () => {
  const g = freshApi();
  g.spawnPoints = { yellow: [{ x: 400, y: 300, r: 40 }], red: [{ x: 850, y: 300, r: 40 }] };
  g.ants = []; for (let i = 0; i < 8; i++) g.ants.push(g.createAnt(false, false, 400, 300));
  g.planNest(false);
  g.addRoomManual(false, 'pantry');   // a couple of extras
  g.addRoomManual(false, 'entry');
  for (let i = 0; i < g.rooms.length; i++) {
    for (let j = i + 1; j < g.rooms.length; j++) {
      const a = g.rooms[i], b = g.rooms[j];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(d >= a.r + b.r, `${a.type} and ${b.type} overlap (d=${d.toFixed(0)}, r=${a.r}+${b.r})`);
    }
  }
});

test('a room links back to the nest by a tunnel, and needs both to count as built', () => {
  const g = colony(freshApi(), 8);
  g.planNest(false);
  const entry = g.rooms.find(r => r.type === 'entry');
  assert.ok(entry.tunnelSites.length > 0, 'a room gets tunnel walls back to the nest');
  entry.sites.forEach(s => s.done = true); g.refreshBuilt(entry);
  assert.strictEqual(entry.built, false, 'ring alone is not built');
  entry.tunnelSites.forEach(s => s.done = true); g.refreshBuilt(entry);
  assert.strictEqual(entry.built, true, 'ring + tunnel done -> built');
});

test('eggs: a mating with a built nursery lays an egg that later hatches', () => {
  const g = freshApi();
  g.spawnPoints = { yellow: [{ x: 200, y: 300, r: 40 }], red: [] };
  g.rooms = [{ id: 1, team: false, type: 'nursery', x: 200, y: 300, r: 40, sites: [], tunnelSites: [], built: true, order: 2 }];
  const mk = () => { const a = g.createAnt(false, false, 200, 300); a.happiness = 100; a.fullness = 100; a.age = 1e6; a.breedingTimer = 1e9; return a; };

  let laid = false;
  for (let i = 0; i < 300 && !laid; i++) { g.ants = [mk(), mk()]; g.eggs = []; g.tryBreeding(g.ants[0]); laid = g.eggs.length > 0; }
  assert.ok(laid, 'a mating lays an egg in the nursery');
  assert.strictEqual(g.ants.length, 2, 'no instant birth when an egg is laid');

  g.eggs = [{ x: 200, y: 300, team: false, hatch: 0 }];
  const before = g.ants.length;
  g.updateEggs();
  assert.strictEqual(g.eggs.length, 0, 'the egg hatched');
  assert.strictEqual(g.ants.length, before + 1, 'and became an ant');
});

test('threat response: a rival at a built doorway triggers a barricade the builders prioritise', () => {
  const g = colony(freshApi(), 8);
  g.planNest(false);
  const entry = g.rooms.find(r => r.type === 'entry');
  entry.sites.forEach(s => s.done = true); entry.tunnelSites.forEach(s => s.done = true); g.refreshBuilt(entry);
  assert.ok(entry.built);

  const dx = entry.x + Math.cos(entry.gapAngle) * entry.r, dy = entry.y + Math.sin(entry.gapAngle) * entry.r;
  g.ants.push(g.createAnt(true, false, dx, dy));   // a rival on the doorstep
  g.updateThreats();
  assert.ok(entry.barricadeSites && entry.barricadeSites.length > 0, 'a breach queues a barricade');
  assert.strictEqual(entry.breached, true);

  const w = g.ants.find(a => !a.isRed);
  const task = g.buildTaskFor(w);
  assert.ok(task && task.urgent, 'the barricade is worked first');
});
