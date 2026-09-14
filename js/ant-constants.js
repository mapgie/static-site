// ant-farm — constants and food specs
//
// The simulation is split across js/ant-*.js, loaded as plain (non-module)
// scripts by ant-farm.html so they all share one global scope, exactly as the
// original single file did. Load order (set in the HTML) follows the
// dependencies for top-level evaluation:
//   constants → state → utils → entities → ui → simulation → render → storage
// Function bodies resolve names at call time, so cross-file calls work once all
// scripts have loaded; only top-level initialisers care about order.
'use strict';

const SAVE_KEY       = 'antFarmSave';
const MAX_WHITE_ANTS = 500;
const MAX_RED_ANTS   = 500;
const MAX_FOOD       = 300;
const MAX_PHEROMONES = 1500;
const TICK_MS        = 16;
const GRID_CELL      = 32;

const SENSE_FOOD  = 180;
const SENSE_PREY  = 160;
const SENSE_TRAIL = 60;
const EAT_RANGE   = 8;
const BITE_RANGE  = 8;
const MATE_RANGE  = 30;

// The nest: ants drop food off in a ring around the spawn point, never on it.
const NEST_CORE   = 12;   // keep the spawn point itself clear (scales a little with size)
const NEST_RADIUS = 40;   // default drop-off radius; each point can be resized
const NEST_MIN_R  = 24;
const NEST_MAX_R  = 120;
const CARRY_RETRY = 1800; // ticks before a stuck carrier picks a new drop spot
const PROTEIN_BOOST_TICKS = 600; // ~10s of extra vigour and mating drive after eating protein

// Live-tunable balance numbers. Everything the Tuning panel can nudge lives here
// so it can be changed at runtime and saved; TUNABLES (further down) drives the UI.
const TUNE_DEFAULTS = {
  // Happiness gains
  H_EAT: 5,          // any meal
  H_GOOD_FOOD: 6,    // extra for protein / fruit / insect
  H_MATE: 8,         // a successful pairing (both parents)
  H_DELIVER: 5,      // colony-building: dropping food at the nest
  H_SATIATED: 2.5,   // per second while well-fed
  H_SURVIVE: 1.5,    // per second, main colony only, while unattacked
  H_ATTACK: 6,       // per kill, antagonist only (replaces the survival tick)
  RED_FACTOR: 0.6,   // antagonist happiness gains are scaled by this
  ATTACK_CALM_S: 6,  // seconds since the last attack before survival happiness ticks up
  // Happiness losses
  HAPPINESS_DECAY: 1.2,  // points lost per second, always
  H_POISON_HIT: 6,       // becoming poisoned
  H_POISON_DECAY: 1.0,   // extra per second while poisoned
  H_ALLY_LOST: 6,        // morale hit to nearby colony-mates when one is killed
  WITNESS_RADIUS: 70,    // how near a colony-mate must be to feel the loss
  // Sadist-only losses
  H_QUEEN_LEFT: 5,   // a colony's morale when its queen departs
  H_WET: 1.5,        // per second while in water
  H_SLOW: 1.0,       // per second while slowed
  // Fullness / hunger (a separate axis from mood)
  FULLNESS_DECAY: 3,     // fullness lost per second, becoming hunger
  FULLNESS_MEAL: 28,     // fullness a normal meal restores
  FULLNESS_FEAST: 40,    // ...a dead insect
  SATIATED_LEVEL: 65,    // fullness at/above which an ant counts as well-fed
  HUNGER_MIN: 30,        // new ant's hunger point is jittered between these...
  HUNGER_MAX: 50,        // ...on its fullness bar; below it, it eats from the store
  // New-ant seed
  HAPPINESS_START: 50,
  HAPPINESS_JITTER: 12,
  FULLNESS_START: 60,
  FULLNESS_JITTER: 15,
  TEMPERAMENT_SPREAD: 0.3,   // width of the hidden per-ant temperament band
  // Breeding & queens
  MATE_CHANCE: 0.35,     // base chance a nearby pair breeds
  CROWD_MATE_STEP: 0.04, // each nearby colony-mate trims that chance by this
  CROWD_MATE_FLOOR: 0.5, // ...but never below this fraction of it
  QUEEN_HIGH: 75,        // a colony's bar at/above this summons its queen
  QUEEN_LOW: 40,         // ...and she leaves below this
  SADIST_SPAWN: 25,      // Sadist: rival queen arrives when main mood is below this
  SADIST_LEAVE: 60,      // ...and leaves once main mood recovers above this
};
let TUNE = { ...TUNE_DEFAULTS };

// Dead insects: too big for one ant, a feast for the colony.
const INSECT_HAULERS  = 3;    // ants needed before a carcass moves
const INSECT_SERVINGS = 5;    // how many ants can eat from one
const INSECT_RADIUS   = 9;
const HAUL_PATIENCE   = 900;  // ticks a short-handed team waits before giving up
const HAUL_COOLDOWN   = 900;  // ticks a giver-upper ignores carcasses afterwards

// Per food type. FOOD_UNITS is how many separate trips a dropped piece takes to
// haul home (its "drops"): a carrier lifts one unit per trip and the rest waits
// for the next ant. FOOD_FEEDS is how many nestmates one delivered drop feeds.
// FOOD_SPACING is how far apart a dragged brush scatters pieces — protein sits
// wider than fruit, fruit wider than sugar, and a dead insect drops once per tap.
const FOOD_UNITS   = { sugar: 3, fruit: 5, protein: 1, poison: 1, spoiled: 1, insect: 1 };
const FOOD_FEEDS   = { sugar: 1, fruit: 1, protein: 2, spoiled: 1, insect: INSECT_SERVINGS };
const FOOD_SPACING = { sugar: 22, fruit: 40, protein: 64, poison: 90, spoiled: 30, insect: Infinity };

function initialUnits(type) { return FOOD_UNITS[type] || 1; }

// Poison is a slow bomb: one drop carried home poisons a whole crowd (5-10).
function deliveredServings(type) {
  return type === 'poison' ? 5 + Math.floor(Math.random() * 6) : (FOOD_FEEDS[type] || 1);
}

