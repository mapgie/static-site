'use strict';
// Guards the existing simulation behaviour so the world-building work doesn't
// regress it — and that both modes keep those behaviours.
const test = require('node:test');
const assert = require('node:assert');
const { freshApi } = require('./harness');

test('population factor: lone ant ~0.5, peak at capacity, overpopulation eases down', () => {
  const g = freshApi();
  assert.strictEqual(g.populationFactor(1), 0.5);
  assert.ok(Math.abs(g.populationFactor(2) - 0.505) < 0.01);
  assert.strictEqual(g.populationFactor(100), 1);       // POP_CAPACITY default
  assert.ok(g.populationFactor(200) < 0.6);
  assert.ok(g.populationFactor(300) >= 0.35);           // floored
});

test('colony happiness scales with size', () => {
  const g = freshApi();
  const mk = () => { const a = g.createAnt(false); a.happiness = 100; return a; };
  g.ants = [mk(), mk()];
  g.aggregateHappiness();
  assert.ok(g.whiteHappiness > 50 && g.whiteHappiness < 52, `two happy ants ~50, got ${g.whiteHappiness}`);
});

test('delivered servings: sugar 1, protein 2, poison 5-10; insect 10-15', () => {
  const g = freshApi();
  assert.strictEqual(g.deliveredServings('sugar'), 1);
  assert.strictEqual(g.deliveredServings('protein'), 2);
  for (let i = 0; i < 50; i++) {
    const p = g.deliveredServings('poison');
    assert.ok(p >= 5 && p <= 10, `poison servings ${p}`);
    const s = g.insectServings();
    assert.ok(s >= 10 && s <= 15, `insect servings ${s}`);
  }
});

test('mating needs both partners in the mood; a low-mood ant never breeds', () => {
  const g = freshApi();
  const mk = () => { const a = g.createAnt(false, false, 500, 300); a.happiness = 100; a.fullness = 100; a.age = 1e6; a.breedingTimer = 1e9; return a; };

  // both eligible & adjacent -> breeds around MATE_CHANCE
  let births = 0;
  for (let i = 0; i < 400; i++) { g.ants = [mk(), mk()]; g.tryBreeding(g.ants[0]); if (g.ants.length > 2) births++; }
  const rate = births / 400;
  assert.ok(rate > 0.2 && rate < 0.5, `eligible pair breed rate ${rate}`);

  // low-mood initiator -> never
  let b2 = 0;
  for (let i = 0; i < 200; i++) { g.ants = [mk(), mk()]; g.ants[0].happiness = 40; g.tryBreeding(g.ants[0]); if (g.ants.length > 2) b2++; }
  assert.strictEqual(b2, 0);

  // low-mood partner -> never
  let b3 = 0;
  for (let i = 0; i < 200; i++) { g.ants = [mk(), mk()]; g.ants[1].happiness = 40; g.tryBreeding(g.ants[0]); if (g.ants.length > 2) b3++; }
  assert.strictEqual(b3, 0);
});

test('both parents rest (cooldown) after a successful mating', () => {
  const g = freshApi();
  const mk = () => { const a = g.createAnt(false, false, 500, 300); a.happiness = 100; a.fullness = 100; a.age = 1e6; a.breedingTimer = 1e9; return a; };
  let cooled = false;
  for (let k = 0; k < 80 && !cooled; k++) {
    g.ants = [mk(), mk()];
    const n = g.ants.length;
    g.tryBreeding(g.ants[0]);
    if (g.ants.length > n) cooled = g.ants[0].breedingTimer === 0 && g.ants[1].breedingTimer === 0;
  }
  assert.ok(cooled, 'a successful mating zeroes both parents\' breeding timers');
});

test('foraging by smell: distant food yields to a trail, close food trumps it, food in reach is grabbed', () => {
  const g = freshApi();
  g.rebuildEnvGrid();

  // Distant food (beyond smell) + a trail: the ant follows the trail (north).
  const a = g.createAnt(false, false, 500, 300);
  a.fullness = 100; a.age = 1e6; a.carrying = null; a.wallCooldown = 0; a.angle = 0;
  g.ants = [a];
  g.foods = [g.makeFood(600, 300, 'sugar')];          // ~100px east — sensed for pickup, but out of smell
  g.pheromones = [{ x: 500, y: 255, strength: 1 }];   // trail 45px north
  g.updateAnts();
  assert.ok(Math.sin(a.angle) < 0, `distant food: ant follows the trail (north), angle=${a.angle}`);

  // Food within smell trumps the trail: the ant turns toward the food (south).
  const b = g.createAnt(false, false, 500, 300);
  b.fullness = 100; b.age = 1e6; b.carrying = null; b.wallCooldown = 0; b.angle = 0;
  g.ants = [b];
  g.foods = [g.makeFood(500, 320, 'sugar')];          // 20px south — within SENSE_SMELL
  g.pheromones = [{ x: 500, y: 255, strength: 1 }];   // trail north
  g.updateAnts();
  assert.ok(Math.sin(b.angle) > 0, `close food: smell trumps the trail (south), angle=${b.angle}`);

  // Food in reach is picked up regardless.
  const c = g.createAnt(false, false, 500, 300);
  c.fullness = 100; c.age = 1e6; c.carrying = null; c.wallCooldown = 0;
  g.ants = [c];
  g.foods = [g.makeFood(503, 300, 'sugar')];          // within EAT_RANGE
  g.pheromones = [{ x: 500, y: 255, strength: 1 }];
  g.updateAnts();
  assert.ok(c.carrying && c.carrying.type === 'sugar', 'food in reach grabbed');
});

test('typed pheromones: layPheromone tags a kind; queries filter by kind and range', () => {
  const g = freshApi();
  const a = g.createAnt(false, false, 500, 300);
  g.pheromones = [];
  g.layPheromone(500, 320, 1, 'danger');   // 20px south
  g.layPheromone(500, 340, 1);             // default kind = trail, 40px south
  assert.strictEqual(g.pheromones[0].kind, 'danger');
  assert.strictEqual(g.pheromones[1].kind, 'trail');

  assert.strictEqual(g.strongestPheromone(a, 'danger', 100).kind, 'danger');
  assert.strictEqual(g.strongestPheromone(a, 'trail', 100).kind, 'trail');
  assert.strictEqual(g.strongestTrail(a).kind, 'trail');       // trail query ignores the danger mark
  assert.strictEqual(g.strongestPheromone(a, 'danger', 10), null);  // danger is out of this range
});

test('danger response: flee by default, swarm only when a strong, steady colony\'s nest is at risk', () => {
  const g = freshApi();
  g.addSpawnPoint(false, 500, 300);        // the main colony's nest
  const near = { x: 520, y: 310 };         // danger laid at the nest
  const far  = { x: 900, y: 550 };         // danger out in the field

  // Strong (>= queen threshold), steady (mood high) colony.
  g.ants = [];
  for (let i = 0; i < g.TUNE.QUEEN_MIN_ANTS; i++) { const a = g.createAnt(false, false, 500, 300); a.happiness = 70; g.ants.push(a); }
  assert.strictEqual(g.dangerReaction(g.ants[0], near), 'swarm', 'threatened nest, strong colony -> rally');
  assert.strictEqual(g.dangerReaction(g.ants[0], far), 'flee', 'danger far from the nest -> flee');

  // A rattled ant flees even at the nest.
  g.ants[0].happiness = 20;
  assert.strictEqual(g.dangerReaction(g.ants[0], near), 'flee', 'low-mood ant flees');

  // Too few ants to make a stand.
  g.ants = [g.createAnt(false, false, 500, 300)]; g.ants[0].happiness = 90;
  assert.strictEqual(g.dangerReaction(g.ants[0], near), 'flee', 'a small colony scatters');
});

test('a white ant that senses danger flees it (steers away, with a speed jolt)', () => {
  const g = freshApi();
  g.rebuildEnvGrid();
  const a = g.createAnt(false, false, 500, 300);
  a.fullness = 100; a.age = 1e6; a.carrying = null; a.wallCooldown = 0; a.angle = 0; a.speedBoost = 0;
  g.ants = [a];
  g.foods = [];
  g.pheromones = [{ x: 500, y: 250, strength: 2, kind: 'danger' }];   // 50px north
  g.updateAnts();
  assert.ok(Math.sin(a.angle) > 0, `ant turns away from the danger (south), angle=${a.angle}`);
  assert.ok(a.speedBoost > 0, 'fleeing gives a burst of speed');
});

test('a rival kill counts as "killed", lays a danger scent; a natural death does not', () => {
  const g = freshApi();
  g.rebuildEnvGrid();
  g.redAggressionLevel = 100;              // aggression = 1: the bite always lands
  const red   = g.createAnt(true,  false, 500, 300); red.fullness = 100; red.age = 1e6;
  const white = g.createAnt(false, false, 503, 300); white.fullness = 100; white.age = 1e6;
  g.ants = [red, white];
  g.pheromones = [];
  g.killedWhite = 0;
  g.updateAnts();
  assert.strictEqual(g.ants.length, 1, 'the white ant was killed');
  assert.strictEqual(g.killedWhite, 1, 'counted as killed by a rival');
  assert.ok(g.pheromones.some(p => p.kind === 'danger'), 'a danger scent was laid where it fell');

  // A death of old age is a death, not a kill.
  const g2 = freshApi();
  g2.rebuildEnvGrid();
  const old = g2.createAnt(false, false, 500, 300); old.age = 1e6; old.lifespan = 1; old.fullness = 100;
  g2.ants = [old];
  g2.killedWhite = 0;
  g2.updateAnts();
  assert.strictEqual(g2.ants.length, 0, 'the ant died');
  assert.strictEqual(g2.killedWhite, 0, 'a natural death is not a kill');
});

test('a colony eats only its OWN delivered stockpile', () => {
  const g = freshApi();
  const a = g.createAnt(false, false, 500, 300); a.fullness = 0; a.hungerPoint = 50;  // hungry
  g.ants = [a];
  const enemy = g.makeFood(700, 300, 'sugar'); enemy.delivered = true; enemy.team = true;  enemy.foundBy = null;
  g.foods = [enemy];
  assert.strictEqual(g.nearestFood(a), null, 'a rival store across the map is not food to the main colony');
  const own = g.makeFood(510, 300, 'sugar'); own.delivered = true; own.team = false; own.foundBy = null;
  g.foods = [enemy, own];
  assert.strictEqual(g.nearestFood(a), own, 'the colony\'s own store is fair game');
});

test('a rival raids an enemy stockpile only from inside the pantry, not at range', () => {
  const g = freshApi();
  const r = g.createAnt(true, false, 500, 300); r.fullness = 0; r.hungerPoint = 50;  // a hungry rival
  g.ants = [r];
  // The main colony's store, far from the rival: not a target (no homing through walls / at range).
  const store = g.makeFood(700, 300, 'sugar'); store.delivered = true; store.team = false; store.foundBy = null;
  g.foods = [store];
  assert.strictEqual(g.nearestFood(r), null, 'a distant enemy store is invisible to the raider');
  // Once the rival is standing in the pantry (on the food), it can eat/steal it.
  r.x = 705; r.y = 300;
  assert.strictEqual(g.nearestFood(r), store, 'inside the pantry, the enemy store is fair plunder');
});

test('delivered food is stored in the pantry once one is built', () => {
  const g = freshApi();
  g.spawnPoints = { yellow: [{ x: 200, y: 300, r: 40 }], red: [] };
  const a = g.createAnt(false, false, 510, 300);
  a.carrying = { type: 'sugar', age: 0, size: 4 };
  a.dropOffset = { dx: 12, dy: 0 };   // set by pickUp in real play
  g.ants = [a]; g.foods = [];
  // No pantry yet -> heads for the nest.
  let t = g.dropTarget(a);
  assert.ok(Math.hypot(t.x - 200, t.y - 300) < 60, 'without a pantry, food goes to the nest');
  // With a built pantry -> heads for the pantry.
  g.rooms = [{ id: 1, team: false, type: 'pantry', x: 500, y: 300, r: 34, sites: [], tunnelSites: [], built: true, order: 1 }];
  t = g.dropTarget(a);
  assert.ok(Math.hypot(t.x - 500, t.y - 300) < 34, 'with a pantry, food is stored there');
});

test('a well-fed rival on an enemy store steals it and hauls it home; hungry it eats', () => {
  const g = freshApi();
  g.spawnPoints = { yellow: [{ x: 200, y: 300, r: 40 }], red: [{ x: 800, y: 300, r: 40 }] };
  const store = g.makeFood(500, 300, 'sugar');
  store.delivered = true; store.team = false; store.foundBy = null; store.servings = 3; store.units = 0;
  g.foods = [store];

  // A well-fed rival right on the store targets it (to steal) even without hunger.
  const r = g.createAnt(true, false, 505, 300); r.fullness = 100; r.hungerPoint = 40;
  g.ants = [r];
  assert.strictEqual(g.nearestFood(r), store, 'a raider eyes the enemy store regardless of hunger');
  g.stealFood(r, store);
  assert.ok(r.carrying && r.carrying.type === 'sugar', 'the raider carries off the loot');
  assert.strictEqual(store.servings, 2, 'the raided store shrank by a serving');

  // From across the map, the store is not a target (no reaching through walls).
  const far = g.createAnt(true, false, 120, 300); far.fullness = 100; far.hungerPoint = 40;
  g.ants = [far]; g.foods = [store];
  assert.strictEqual(g.nearestFood(far), null, 'the store is safe until the raider is inside the pantry');
});

test('the queen takes over reproduction: workers stop, the queen lays eggs', () => {
  const g = freshApi();
  g.worldBuilding = true;
  g.spawnPoints = { yellow: [{ x: 300, y: 300, r: 40 }], red: [] };
  g.rooms = [{ id: 1, team: false, type: 'nursery', x: 300, y: 300, r: 40, sites: [], tunnelSites: [], built: true, gaps: [] }];
  const mk = () => { const a = g.createAnt(false, false, 300, 300); a.happiness = 100; a.fullness = 100; a.age = 1e6; a.breedingTimer = 1e9; return a; };

  // With a queen present, workers lay nothing.
  g.queens = { white: g.createAnt(false, true, 300, 300), red: null };
  for (let i = 0; i < 200; i++) { g.ants = [mk(), mk()]; g.eggs = []; g.tryBreeding(g.ants[0]); }
  assert.strictEqual(g.eggs.length, 0, 'workers do not breed while the queen reigns');

  // The queen lays eggs over time, tagged as her own.
  g.whiteHappiness = 90; g.eggs = []; g.queens.white.spawnTimer = 0;
  for (let t = 0; t < 4000 && g.eggs.length === 0; t += 16) g.updateQueens();
  assert.ok(g.eggs.length > 0 && g.eggs[0].source === 'queen', 'the queen lays eggs');

  // A queen egg hatches as born (spawned is reserved for hand-added ants).
  g.eggs = [{ x: 300, y: 300, team: false, hatch: 0, source: 'queen' }];
  g.matedWhite = 0; g.spawnedWhite = 0; g.updateEggs();
  assert.strictEqual(g.matedWhite, 1, 'a queen egg hatches as born');
  assert.strictEqual(g.spawnedWhite, 0, 'not counted as spawned');

  // With no queen, workers breed again.
  g.queens.white = null;
  let laid = false;
  for (let i = 0; i < 300 && !laid; i++) { g.ants = [mk(), mk()]; g.eggs = []; g.tryBreeding(g.ants[0]); laid = g.eggs.length > 0; }
  assert.ok(laid, 'workers breed again once the queen is gone');
});

test('food never auto-spawns inside the nest (rooms or spawn area)', () => {
  const g = freshApi();
  g.spawnPoints = { yellow: [{ x: 300, y: 300, r: 40 }], red: [] };
  g.rooms = [{ id: 1, team: false, type: 'pantry', x: 520, y: 300, r: 34, sites: [], tunnelSites: [], built: true, gaps: [] }];
  g.rebuildEnvGrid();
  assert.strictEqual(g.foodSpawnAllowed(520, 300), false, 'not inside a room');
  assert.strictEqual(g.foodSpawnAllowed(300, 300), false, 'not in the spawn/nest area');
  assert.strictEqual(g.foodSpawnAllowed(700, 500), true,  'open ground is fine');
});

test('a trapped ant burrows a hole (removes the nearest soil block)', () => {
  const g = freshApi();
  g.environment = [{ x: 200, y: 200, type: 'soil', r: 4 }, { x: 260, y: 200, type: 'soil', r: 4 }];
  assert.strictEqual(g.burrowHole(205, 200), true, 'the near block is removed');
  assert.strictEqual(g.environment.length, 1);
  assert.strictEqual(g.environment[0].x, 260, 'the far block is left');
  assert.strictEqual(g.burrowHole(900, 500), false, 'nothing to burrow far from any soil');
});

test('ants cannot end up inside a soil wall', () => {
  const g = freshApi();
  g.environment = [];
  for (let y = 240; y <= 360; y += 6) g.environment.push({ x: 500, y, type: 'soil', r: 4 });  // a vertical wall
  g.rebuildEnvGrid();
  const a = g.createAnt(false, false, 480, 300); a.angle = 0; a.fullness = 100; a.age = 1e6; a.wallCooldown = 0;
  g.ants = [a]; g.foods = [g.makeFood(560, 300, 'sugar')];   // food on the far side, pulls it east into the wall
  for (let i = 0; i < 60; i++) { g.updateAnts(); }
  assert.ok(!g.collidesWall(a.x, a.y), 'the ant never sits inside the wall');
  assert.ok(a.x < 495, 'and it did not pass through to the far side');
});

test('poison: spoiled only rots to poison under Sadist, and Sadist seeds it only when over-happy', () => {
  const g = freshApi();
  const f = g.makeFood(100, 100, 'spoiled'); f.age = 1e9; g.foods = [f];
  g.sadistMode = false; g.decay(f);
  assert.strictEqual(f.type, 'spoiled', 'no poison from decay in normal play');
  g.sadistMode = true; f.age = 1e9; g.decay(f);
  assert.strictEqual(f.type, 'poison', 'Sadist lets spoiled rot into poison');

  // Auto-seeding: nothing outside Sadist, something once over-happy under Sadist.
  const g2 = freshApi(); g2.foods = [];
  g2.queens = { white: { x: 100, y: 100 }, red: null }; g2.whiteHappiness = 90;
  g2.sadistMode = false;
  for (let i = 0; i < 3000; i++) g2.maybeSadistPoison();
  assert.strictEqual(g2.foods.length, 0, 'no auto poison outside Sadist');
  g2.sadistMode = true;
  let seeded = false;
  for (let i = 0; i < 30000 && !seeded; i++) { g2.maybeSadistPoison(); seeded = g2.foods.some(x => x.type === 'poison'); }
  assert.ok(seeded, 'Sadist seeds poison when a sustained queen is over-happy');
});

// A sealed nest's ENTRY must keep a real hole to the outside. The outer door is
// stored as innerAngle + PI, which can exceed 2*PI; a modulo bug once left those
// doorway blocks in place, sealing the entry. Check the doorway stays clear across
// many spawn positions (so ants can come and go, and a bulldozed hole isn't needed).
test('nest entry keeps an open outer doorway (no wall blocks across the gap)', () => {
  const angDiff = (a, b) => { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return Math.abs(d); };
  for (const [sx, sy, w, h] of [[500, 90, 1000, 600], [140, 90, 1000, 600], [860, 90, 1000, 600], [500, 300, 1000, 600], [380, 120, 760, 1400]]) {
    const g = freshApi();
    g.canvas = { width: w, height: h };
    g.spawnPoints = { yellow: [{ x: sx, y: sy, r: 40 }], red: [{ x: w - sx, y: h - sy, r: 40 }] };
    g.ants = []; for (let i = 0; i < 8; i++) g.ants.push(g.createAnt(false, false, sx, sy));
    g.planNest(false);
    const entry = g.rooms.find(r => r.type === 'entry' && r.team === false);
    assert.ok(entry, `entry planned for spawn (${sx},${sy})`);
    assert.ok(entry.gaps.length >= 2, 'entry has an inward and an outer doorway');
    const arc = entry.gaps[entry.gaps.length - 1].arc;
    const inDoor = entry.sites.filter(s => angDiff(Math.atan2(s.y - entry.y, s.x - entry.x), entry.gapAngle) < arc / 2);
    assert.strictEqual(inDoor.length, 0, `no wall blocks inside the outer doorway for spawn (${sx},${sy})`);
  }
});

// World-building: a carrier's load is routed to the PANTRY from the very start —
// the nest is planned (hidden, unbuilt) before the colony can dig it, so early food
// piles at the pantry spot, never on the bare spawn point.
test('carried food is routed to the planned pantry, not the spawn point', () => {
  const g = freshApi();
  g.canvas = { width: 1000, height: 600 };
  g.spawnPoints = { yellow: [{ x: 500, y: 90, r: 40 }], red: [{ x: 500, y: 510, r: 40 }] };
  g.worldBuilding = true;
  g.ants = []; for (let i = 0; i < 3; i++) g.ants.push(g.createAnt(false, false, 500, 100)); // below the build threshold
  g.planNest(false);
  const pantry = g.rooms.find(r => r.type === 'pantry' && r.team === false);
  assert.ok(pantry && !pantry.built, 'pantry is planned but not yet built');
  const ant = g.ants[0]; ant.carrying = { type: 'sugar' }; ant.x = 480; ant.y = 300;
  const t = g.dropTarget(ant);
  const spawn = g.spawnPoints.yellow[0];
  const toPantry = Math.hypot(t.x - pantry.x, t.y - pantry.y);
  const toSpawn = Math.hypot(t.x - spawn.x, t.y - spawn.y);
  assert.ok(toPantry < toSpawn, `drop target sits at the pantry (${toPantry|0}) not the spawn (${toSpawn|0})`);
  assert.ok(toPantry <= pantry.r, 'drop target is inside the pantry footprint');
});

// The food-placement rule and mating apply in BOTH modes.
for (const mode of [true, false]) {
  test(`both modes (worldBuilding=${mode}): food avoids terrain and mating still gated`, () => {
    const g = freshApi();
    g.worldBuilding = mode;
    g.environment = [{ x: 100, y: 100, type: 'soil', r: 5 }];
    g.rebuildEnvGrid();
    assert.strictEqual(g.foodSpawnAllowed(100, 100), false);
    assert.strictEqual(g.foodSpawnAllowed(600, 400), true);

    const a = g.createAnt(false, false, 500, 300); a.happiness = 20; a.age = 1e6; a.breedingTimer = 1e9;
    const o = g.createAnt(false, false, 505, 300); o.happiness = 20; o.age = 1e6; o.breedingTimer = 1e9;
    g.ants = [a, o];
    g.tryBreeding(a);
    assert.strictEqual(g.ants.length, 2, 'miserable ants do not breed in either mode');
  });
}
