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
