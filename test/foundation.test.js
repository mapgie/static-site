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

test('planNest lays out the whole nest from the start; digging waits for a big enough colony', () => {
  // The plan (one of each room) exists even for a tiny colony, so foragers always
  // have a pantry to aim at — but nothing is built or dug until the build threshold.
  const g = colony(freshApi(), 3);
  g.planNest(false);
  const kinds = new Set(g.rooms.map(r => r.type));
  for (const t of ['entry', 'pantry', 'nursery', 'throne', 'empty']) assert.ok(kinds.has(t), `nest plans a ${t} from the start`);
  assert.ok(g.rooms.every(r => !r.built), 'a tiny colony has planned but built nothing');
  assert.strictEqual(g.buildTaskFor(g.ants[0]), null, 'a tiny colony does not dig yet');
  const n = g.rooms.length;
  g.planNest(false);
  assert.strictEqual(g.rooms.length, n, 'planning again adds nothing');

  colony(g, 6);          // same plan, now a colony big enough to build it
  assert.ok(g.buildTaskFor(g.ants[0]), 'at the threshold the colony starts digging');

  const g2 = colony(freshApi(), 20);
  g2.worldBuilding = false;
  g2.planNest(false);
  assert.strictEqual(g2.rooms.length, 0, 'no nest when the mode is off');
});

test('the nursery sits on the spawn point; the other rooms grow outward from it', () => {
  const g = colony(freshApi(), 8);
  g.planNest(false);
  const spawn = g.spawnPoints.yellow[0];
  const dToSpawn = t => { const r = g.rooms.find(x => x.type === t); return Math.hypot(r.x - spawn.x, r.y - spawn.y); };
  const nurseryD = dToSpawn('nursery');
  assert.ok(nurseryD < 30, 'the nursery is planted on the spawn point');
  for (const t of ['entry', 'pantry', 'throne']) {
    assert.ok(dToSpawn(t) > nurseryD, `the ${t} grows out beyond the nursery`);
  }
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

  // No nursery -> the gate blocks every attempt.
  const g = freshApi(); g.rooms = []; bigColony(g);
  let births = 0;
  for (let i = 0; i < 200; i++) { const n = g.ants.length; g.tryBreeding(g.ants[0]); if (g.ants.length > n) births++; g.ants.length = Math.min(g.ants.length, g.TUNE.NURSERY_REQUIRED_ABOVE + 1); }
  assert.strictEqual(births, 0, 'blocked without a nursery');

  // A built nursery reopens breeding — as eggs laid in the nursery.
  const g2 = freshApi(); bigColony(g2);
  g2.rooms = [{ id: 1, team: false, type: 'nursery', x: 150, y: 300, r: 40, sites: [], tunnelSites: [], built: true, order: 2 }];
  let eggsLaid = 0;
  for (let i = 0; i < 300; i++) { g2.eggs = []; g2.tryBreeding(g2.ants[0]); eggsLaid += g2.eggs.length; }
  assert.ok(eggsLaid > 0, 'a built nursery lets the colony grow again (via eggs)');
});

test('builders dig a room: a builder at a wall site raises soil there', () => {
  const g = colony(freshApi(), 6);   // at the build threshold, so digging is allowed
  g.planNest(false);
  g.rebuildEnvGrid();
  const entry = g.rooms.find(r => r.type === 'entry');
  const site = entry.sites[0];
  // Put one builder right on a wall site's approach point. Its five nestmates keep
  // the colony at the threshold (building is gated below it) and only help dig.
  const a = g.ants[0];
  a.x = site.ax; a.y = site.ay; a.fullness = 100; a.hungerPoint = 40; a.carrying = null; a.wallCooldown = 0; a.age = 1e6;
  for (let i = 0; i < 120; i++) { g.updateAnts(); g.rebuildEnvGrid(); }   // travel + BUILD_TICKS
  assert.ok(g.environment.some(o => o.type === 'soil'), 'a soil wall block was raised');
});

test('ringed rooms are placed fully on-canvas even from an edge nest', () => {
  const g = freshApi();
  g.spawnPoints = { yellow: [{ x: 70, y: 70, r: 40 }], red: [{ x: 800, y: 300, r: 40 }] };
  g.ants = []; for (let i = 0; i < 8; i++) g.ants.push(g.createAnt(false, false, 70, 70));
  g.planNest(false);
  for (const room of g.rooms) {
    assert.ok(room.x - room.r >= 0 && room.x + room.r <= g.canvas.width,  `${room.type} within width`);
    assert.ok(room.y - room.r >= 0 && room.y + room.r <= g.canvas.height, `${room.type} within height`);
  }
});

test('the nursery is planted on the spawn point and links directly to the throne', () => {
  const g = freshApi();
  g.spawnPoints = { yellow: [{ x: 250, y: 300, r: 40 }], red: [{ x: 850, y: 300, r: 40 }] };
  g.ants = []; for (let i = 0; i < 8; i++) g.ants.push(g.createAnt(false, false, 250, 300));
  g.planNest(false);
  const nursery = g.rooms.find(r => r.type === 'nursery');
  assert.ok(Math.hypot(nursery.x - 250, nursery.y - 300) < 30, 'nursery is on the spawn point');
  // The nursery connects directly to the throne (a doorway + corridor between them).
  const throne = g.rooms.find(r => r.type === 'throne');
  assert.ok(nursery.links.includes(throne.id) && throne.links.includes(nursery.id), 'nursery and throne are directly connected');
});

test('the rival builds a smaller nest of its own', () => {
  const g = freshApi();
  g.spawnPoints = { yellow: [{ x: 200, y: 300, r: 40 }], red: [{ x: 820, y: 300, r: 40 }] };
  g.ants = []; for (let i = 0; i < 8; i++) g.ants.push(g.createAnt(true, false, 820, 300));
  g.planNest(true);
  const types = g.rooms.filter(r => r.team === true).map(r => r.type).sort().join(',');
  assert.strictEqual(types, 'empty,entry,nursery,pantry', 'rival builds a modest nest (hub, entry, pantry, nursery)');
  const redPantry = g.rooms.find(r => r.team === true && r.type === 'pantry');
  assert.ok(redPantry.r < g.roomRadius(false, 'pantry'), 'rival rooms are scaled smaller');
});

test('the auto nest is sealed and connected, and every link obeys the rules', () => {
  const g = freshApi();
  g.spawnPoints = { yellow: [{ x: 400, y: 330, r: 40 }], red: [{ x: 880, y: 330, r: 40 }] };
  g.ants = []; for (let i = 0; i < 8; i++) g.ants.push(g.createAnt(false, false, 400, 330));
  g.planNest(false);
  const R = g.rooms.filter(r => !r.team);
  const byId = new Map(R.map(r => [r.id, r]));
  // reachable from the hub across corridor links
  const hub = R.find(r => r.type === 'empty');
  const seen = new Set([hub.id]), st = [hub.id];
  while (st.length) for (const l of byId.get(st.pop()).links) if (byId.has(l) && !seen.has(l)) { seen.add(l); st.push(l); }
  assert.strictEqual(seen.size, R.length, 'every room is reachable');
  // every doorway link is an allowed connection
  for (const r of R) for (const l of r.links) assert.ok(g.canConnect(r.type, byId.get(l).type), `${r.type}-${byId.get(l).type} allowed`);
  // sealed: exactly one doorway isn't a room link (the entry's door to the outside)
  const outer = R.reduce((n, r) => n + Math.max(0, r.gaps.length - r.links.length), 0);
  assert.strictEqual(outer, 1, 'only the entry opens to the outside');
});

test('room rules: empty connects to anything; entry only to empty; pantry not to nursery', () => {
  const g = freshApi();
  assert.ok(g.canConnect('empty', 'throne') && g.canConnect('empty', 'pantry') && g.canConnect('empty', 'empty'));
  assert.ok(g.canConnect('entry', 'empty') && !g.canConnect('entry', 'pantry'));
  assert.ok(g.canConnect('pantry', 'pantry') && !g.canConnect('pantry', 'nursery'));
  assert.ok(g.canConnect('nursery', 'throne') && g.canConnect('nursery', 'nursery'));
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

test('rooms are joined by corridors, and a room needs its walls and corridors to count as built', () => {
  const g = colony(freshApi(), 8);
  g.planNest(false);
  // The hub (empty room) owns the corridors out to the rooms it connects.
  const hub = g.rooms.find(r => r.type === 'empty' && r.tunnelSites.length > 0);
  assert.ok(hub, 'the hub has corridor walls linking it to its rooms');
  hub.sites.forEach(s => s.done = true); g.refreshBuilt(hub);
  assert.strictEqual(hub.built, false, 'ring alone is not built');
  hub.tunnelSites.forEach(s => s.done = true); g.refreshBuilt(hub);
  assert.strictEqual(hub.built, true, 'ring + corridors done -> built');
});

test('corridor walls run all the way to the far room\'s ring (no gap at the mouth)', () => {
  // Each corridor is two walls offset ±hoff from the A→B axis. On the far ring those
  // offset points sit back from B's centre by sqrt(b.r²−hoff²), so a wall's far end
  // must land ON B's ring (distance ≈ b.r from B's centre). The old code stopped the
  // walls a flat b.r short of B's CENTRE, leaving them ~sqrt(b.r²+hoff²)−b.r ≈ 6–9px
  // adrift of the ring — a gap at every corridor mouth. This asserts they meet.
  const g = colony(freshApi(), 8);
  g.planNest(false);
  const byId = new Map(g.rooms.map(r => [r.id, r]));
  let checked = 0;
  for (const a of g.rooms.filter(r => !r.team)) {
    for (const bId of a.links) {
      const b = byId.get(bId);
      if (!b || (a.tunnelSites || []).length === 0) continue;   // walls live on the parent
      // The a-owned wall sites heading toward b: those nearer b than to any other link.
      const toward = a.tunnelSites.filter(s => {
        let best = a; for (const oId of a.links) { const o = byId.get(oId); if (o && Math.hypot(s.x - o.x, s.y - o.y) < Math.hypot(s.x - best.x, s.y - best.y)) best = o; }
        return best === b;
      });
      if (!toward.length) continue;
      // The far-most site toward b should sit essentially on b's ring.
      const far = toward.reduce((m, s) => Math.hypot(s.x - a.x, s.y - a.y) > Math.hypot(m.x - a.x, m.y - a.y) ? s : m);
      const dFromB = Math.hypot(far.x - b.x, far.y - b.y);
      assert.ok(Math.abs(dFromB - b.r) <= 6 || dFromB < b.r,   // within a soil block of the ring (or inside it)
        `corridor ${a.type}->${b.type}: wall ends ${dFromB.toFixed(1)}px from ${b.type} centre, ring at ${b.r} (gap at the mouth)`);
      checked++;
    }
  }
  assert.ok(checked >= 4, `expected to check several corridors, checked ${checked}`);
});

test('the built nest is geometrically sealed: only the entry door reaches the outside', () => {
  // Raise the whole nest (place the real soil for every wall site), then flood-fill
  // the walkable space from a far corner with the entry's OUTER door plugged. If any
  // room can be reached from outside, a wall has a gap — outsiders would get in and
  // "nothing crosses a nest wall" is broken. This guards the corridor-mouth seal.
  const g = colony(freshApi(), 8);
  g.planNest(false);
  const white = g.rooms.filter(r => r.team === false);
  for (const room of white) {
    for (const s of room.sites.concat(room.tunnelSites || [])) { g.digSoil(s.x, s.y, true); s.done = true; }
    g.refreshBuilt(room);
  }
  g.rebuildEnvGrid();

  const entry = white.find(r => r.type === 'entry');
  const door = { x: entry.x + Math.cos(entry.gapAngle) * entry.r, y: entry.y + Math.sin(entry.gapAngle) * entry.r };
  const step = 2, W = g.canvas.width, H = g.canvas.height;   // fine enough to catch a ~6px corridor-mouth gap
  const cols = Math.ceil(W / step), rows = Math.ceil(H / step), idx = (cx, cy) => cy * cols + cx;
  const free = new Uint8Array(cols * rows);
  for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
    const x = cx * step, y = cy * step;
    let blocked = g.blockedForAnt(x, y);
    if (!blocked && (x - door.x) ** 2 + (y - door.y) ** 2 < 30 * 30) blocked = true;   // plug the legit entrance
    free[idx(cx, cy)] = blocked ? 0 : 1;
  }
  const seen = new Uint8Array(cols * rows), st = [idx(0, 0)]; seen[idx(0, 0)] = 1;
  while (st.length) {
    const c = st.pop(), cx = c % cols, cy = (c / cols) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const n = idx(nx, ny); if (seen[n] || !free[n]) continue; seen[n] = 1; st.push(n);
    }
  }
  for (const room of white) {
    if (room.type === 'entry') continue;   // the entry legitimately opens outside (plugged above)
    const cx = Math.round(room.x / step), cy = Math.round(room.y / step);
    assert.ok(!seen[idx(cx, cy)], `${room.type} is reachable from outside — the nest wall leaks`);
  }
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
