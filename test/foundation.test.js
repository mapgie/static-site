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
