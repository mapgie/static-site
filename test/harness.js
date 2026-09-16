'use strict';
// Load the browser-side simulation modules into a Node VM with minimal DOM
// stubs, so the pure game logic can be unit-tested without a browser. The
// modules are plain (non-module) scripts that share one global scope, so we
// concatenate them and run once, then expose the bits tests need via __ANT.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
// Logic modules only — render/ui/storage/config touch the DOM at call time and
// aren't needed for the simulation unit tests.
const FILES = ['constants', 'state', 'utils', 'entities', 'simulation']
  .map(n => path.join(ROOT, 'js', `ant-${n}.js`));

// State vars exposed as live get/set so tests can arrange and inspect the world.
const STATE = [
  'ants', 'foods', 'environment', 'pheromones', 'canvas', 'queens', 'spawnPoints',
  'worldBuilding', 'autoFood', 'autoFoodTimer', 'autoFoodNext', 'animationPaused',
  'whiteHappiness', 'redHappiness', 'TUNE', 'matingSpeed', 'nextAntId',
  'envDirty', 'whiteCalmMs', 'killedWhite', 'killedRed', 'redAggressionLevel',
  'rooms', 'nextRoomId', 'nurseryNoticeUntil', 'eggs',
  'sadistMode', 'poisonReadyMs', 'activeBuildersW', 'activeBuildersR'
];
// Functions exposed by reference.
const FUNCS = [
  'populationFactor', 'aggregateHappiness', 'tryBreeding', 'deliveredServings',
  'insectServings', 'initialUnits', 'foodSpawnAllowed', 'digSoil', 'collidesWall',
  'createAnt', 'addFood', 'makeFood', 'autoDropFood', 'pickAutoFood',
  'rebuildEnvGrid', 'markEnvDirty', 'forEachEnvNear', 'updateAnts',
  'nearestFood', 'strongestTrail', 'strongestPheromone', 'dangerReaction',
  'layPheromone', 'colonySpawnPoints', 'addSpawnPoint', 'nearestSpawnPoint',
  'planNest', 'addRoomManual', 'roomCount', 'hasBuiltRoom', 'builtRoom',
  'buildTaskFor', 'countWhiteAnts', 'countRedAnts', 'refreshBuilt',
  'barricadeRoom', 'layEgg', 'updateEggs', 'updateThreats',
  'placementBlocked', 'canAddRoom', 'buildRoomAt', 'findRoomSpot', 'nurseryOnSpawn',
  'roomRadius', 'stealFood', 'maybeSadistPoison', 'decay', 'dropTarget', 'dropOff',
  'updateFoods'
];

function freshApi() {
  const store = {};
  const sandbox = {
    Math, JSON, Date, console, Set, Map, Array, Object, Number,
    isFinite, isNaN, parseInt, parseFloat, Infinity, NaN, String, Boolean,
    window: { addEventListener() {}, matchMedia: () => ({ matches: false }) },
    document: {
      getElementById: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      addEventListener() {},
      createElement: () => ({ style: {}, classList: { add() {}, toggle() {} }, addEventListener() {}, append() {}, appendChild() {}, setAttribute() {} }),
      documentElement: {}
    },
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    getComputedStyle: () => ({ paddingLeft: '0', paddingRight: '0', paddingTop: '0', paddingBottom: '0', getPropertyValue: () => '' }),
    requestAnimationFrame: () => 0,
    alert: () => {}
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  let src = FILES.map(f => fs.readFileSync(f, 'utf8')).join('\n;\n');
  const accessors = STATE.map(n => `get ${n}(){return ${n}}, set ${n}(v){${n}=v}`).join(', ');
  src += `\n;globalThis.__ANT = { ${FUNCS.join(', ')}, ${accessors} };`;
  vm.runInContext(src, sandbox, { filename: 'ant-bundle.js' });

  const api = sandbox.__ANT;
  // A sensible default board so tests don't each have to set one up.
  api.canvas = { width: 1000, height: 600 };
  api.queens = { white: null, red: null };
  api.spawnPoints = { yellow: [], red: [] };
  api.ants = [];
  api.foods = [];
  api.environment = [];
  api.pheromones = [];
  return api;
}

module.exports = { freshApi };
