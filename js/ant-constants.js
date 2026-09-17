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
const SENSE_SMELL = 26;   // how close food must be before an ant "smells" it (poor vision — trails carry farther)
const SENSE_DANGER = 90;  // how far a 'danger' pheromone (a mate killed nearby) reaches — wider than a food trail

// Food-trail pheromones: an ant carrying food home lays a scent the whole way; other
// foragers follow it OUTWARD to the find and reinforce it, so a busy route grows into
// a bright lane while a spent one evaporates. This is what makes marching trails form.
const TRAIL_START = 1.4;      // strength of a fresh trail deposit
const TRAIL_MAX   = 5;        // a well-trodden lane saturates here
const TRAIL_EVAP  = 0.0016;   // per-frame fade — a quiet trail is gone in ~15s, a busy one lasts far longer
const DANGER_EVAP = 0.006;    // danger scent fades faster
const TRAIL_MERGE = 9;        // deposits within this distance reinforce one dot instead of stacking new ones
const TRAIL_STEP  = 5;        // ticks between deposits while carrying
const FORAGE_SIGHT = 70;      // a fed forager will close on food it can see this near (short, so distant food still needs a trail)

// Danger response. A main-colony ant that senses danger flees, unless its nest
// or queen is under threat and the colony is strong and steady enough to rally
// home and stand its ground (swarm). "Strong enough" tracks the queen threshold
// (TUNE.QUEEN_MIN_ANTS) — a colony big enough to have crowned a queen is big
// enough to make a stand. Swarm-into-combat and barricading are the next phase;
// for now swarm means "regroup at the nest to defend it".
const SWARM_MIN_MOOD = 55;    // a rattled ant (low happiness) flees rather than rallies
const NEST_DEFEND_R  = 120;   // danger within this of a spawn point / queen counts as the nest being at risk

// A rival can plunder the main colony's stockpile, but only once it is physically
// in the pantry — right on top of the food. It never homes in on an enemy store
// from across the map or through walls; it has to breach and be standing there.
const RAID_RANGE = 18;
const EAT_RANGE   = 8;
const BITE_RANGE  = 8;
const MATE_RANGE  = 30;
const ARRIVE_RANGE = 18;  // ants ease off within this of their target, so they settle instead of orbiting

// The nest: ants drop food off in a ring around the spawn point, never on it.
const NEST_CORE   = 12;   // keep the spawn point itself clear (scales a little with size)
const NEST_RADIUS = 40;   // default drop-off radius; each point can be resized
const NEST_MIN_R  = 24;
const NEST_MAX_R  = 120;
const CARRY_RETRY = 1800; // ticks before a stuck carrier picks a new drop spot
const CARRY_GIVEUP = 600; // ticks a carrier tries to reach home before its load is logged to the pantry anyway
const PROTEIN_BOOST_TICKS = 600; // ~10s of extra vigour and mating drive after eating protein

// World building: in this mode ants dig soil — a slow in-situ action — into brown
// blocks that wall off nest rooms. Soil can be mined anywhere; painted walls can
// extend structures ad hoc but aren't recognised as rooms.
const SOIL_COLOR = '#6b4423';
const SOIL_R     = 4;    // radius of a placed soil block (walls are kept thin)
const DIG_TICKS  = 3;    // in-situ digging ticks to raise one soil block
const WALL_DRAW  = SOIL_R * 1.8;  // rendered thickness of a soil wall line

// Nest rooms. The colony auto-builds a walled complex: it plans room sites, then
// idle ants dig the soil walls block by block, leaving a doorway gap facing the
// nest. Build order is entry → pantry → nursery → throne; the nursery and throne
// are placed as far from the rival spawn as the layout allows.
// `sym` is drawn at the room centre (a symbol, not a word); empty/entry show none
// (an entry is obvious from its opening to the outside).
const ROOM_SPECS = {
  empty:   { r: 24, order: 0, color: '#8a8fa0' },              // connector node / pathway hub — unlabelled
  entry:   { r: 22, order: 1, color: '#c9a227' },              // unlabelled — its outside door speaks for it
  pantry:  { r: 34, order: 2, color: '#7ea63c', sym: '🍎' },
  nursery: { r: 40, order: 3, color: '#c86fb0', sym: '🥚' },
  throne:  { r: 30, order: 4, color: '#c98a27', sym: '👑' },
};
const ROOM_CAPS      = { empty: Infinity, entry: Infinity, pantry: Infinity, nursery: 1, throne: 1 };

// Which room types may connect to which. Empty rooms are the universal connectors
// that let you route pathways; the functional rooms are pickier.
const ROOM_CONNECT = {
  empty:   ['empty', 'entry', 'pantry', 'nursery', 'throne'],
  entry:   ['empty'],
  pantry:  ['pantry', 'empty'],
  nursery: ['throne', 'empty', 'nursery'],
  throne:  ['nursery', 'empty'],
};

// The auto-built nest as a connected tree of rooms grown from the spawn, with the
// NURSERY at the root (on the spawn point). Sealed: only the entry opens outside.
const NEST_TREE = {
  white: { root: { type: 'nursery', id: 'nursery', kids: [
    { type: 'throne', id: 'throne' },                       // nursery ↔ throne, direct
    { type: 'empty',  id: 'hub', kids: [                    // and out through a connector hub
      { type: 'entry',  id: 'entry' },
      { type: 'pantry', id: 'pantry' },
    ] },
  ] } },
  // The rival keeps it modest: nursery on its spawn, a hub, an entry and a pantry.
  red: { root: { type: 'nursery', id: 'nursery', kids: [
    { type: 'empty', id: 'hub', kids: [
      { type: 'entry',  id: 'entry' },
      { type: 'pantry', id: 'pantry' },
    ] },
  ] } },
};
const CORRIDOR_LEN = 40;   // gap between two connected rooms, spanned by a corridor
const ROOM_SITE_STEP = SOIL_R * 2.2;  // spacing of wall blocks — wide as it can be while overlapping blocks (r+3) still seal, so walls are solid with fewer blocks to dig
const MIN_BUILD_ANTS = 6;     // the colony only starts building once it's this many strong
const BUILD_SENSE    = 4000;  // a well-fed idle ant will return from anywhere to work the nest (until it's done)
const ROOM_MSG_MS    = 4000;  // how long the "needs a nursery" nudge shows
const NURSERY_NOTICE_MUTE_MS = 45000;  // after the player dismisses the nudge, stay quiet this long
const MAX_BUILDERS   = 5;     // floor on how many ants dig at once; the cap also scales with colony size
const BUILDER_SHARE  = 0.6;   // up to this fraction of a colony can be on the nest at once
const ANT_SEP        = 10;    // ants keep at least this far apart, so they don't stack/walk on each other
const ANT_WALL_CLEAR = 4;     // ant-vs-wall clearance (soil r + this); a hair wider than build collision so bodies keep off the drawn wall, without choking corridors
const MAX_PURSUERS   = 2;     // at most this many rivals gang up on one ant, so they don't all swarm a single target
const CONFINE_BURROW_MS = 6000; // a forager stuck inside the nest this long burrows its own way out
const BUILD_TICKS    = 40;    // in-situ ticks to raise one wall block (~0.65s — a visible, unhurried dig)
const DIG_REACH      = 13;    // how close to a block's open-side approach point an ant digs from

// Tunnels: each room hangs off the open junction at the nest by a two-walled
// corridor with a real, walkable channel; the room's doorway gap is sized to
// match the channel so ants can actually pass through.
const TUNNEL_LEN     = 52;    // corridor length between the junction and a room
const TUNNEL_HALF_W  = 15;    // half-width of the walkable channel (ants ~4px pass comfortably)
const DOORWAY_HALF   = TUNNEL_HALF_W + 3;  // half-width of a room's doorway opening

// Burrowing out: an ant sealed inside a room that can't find a way past the walls
// will, after a spell of getting nowhere, dig a single hole to escape.
const BURROW_STUCK_MS = 2500; // how long an ant must be stuck against walls before it burrows

// Threat response: a rival this close to a built room's doorway counts as a breach,
// and the colony walls the doorway shut (a barricade).
const BREACH_R       = 26;

// Eggs: in a finished nursery, a mating lays an egg that hatches into an ant after
// a spell, instead of a birth on the spot.
const EGG_HATCH_MS   = 9000;
const EGG_R          = 3;

// The rival colony builds a smaller nest of its own (it doesn't get attacked, so
// it can afford to be modest).
const RED_ROOM_SCALE = 0.7;

// Sadist poison: only in Sadist mode, and only once the main colony is thriving
// (a sustained queen at high spirits), the sadist rarely seeds a poison drop to
// spoil the good times. Poison never appears from the ordinary living world.
const POISON_SUSTAIN_MS  = 12000;  // how long the colony must stay over-happy first
const POISON_SPAWN_CHANCE = 0.35;  // chance, per sustained spell, that a drop actually lands

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
  FULLNESS_DECAY: 1.5,   // fullness lost per second, becoming hunger
  FULLNESS_MEAL: 28,     // fullness a normal meal restores
  FULLNESS_FEAST: 40,    // ...a dead insect
  SATIATED_LEVEL: 65,    // fullness at/above which an ant counts as well-fed
  HUNGER_MIN: 30,        // new ant's hunger point is jittered between these...
  HUNGER_MAX: 50,        // ...on its fullness bar; below it, it eats from the store
  // New-ant seed
  HAPPINESS_START: 50,
  HAPPINESS_JITTER: 12,
  FULLNESS_START: 75,
  FULLNESS_JITTER: 15,
  TEMPERAMENT_SPREAD: 0.3,   // width of the hidden per-ant temperament band
  // Colony scale: the bar is average mood scaled by size — a lone ant tops out
  // near 50%, a colony at capacity can reach 100%, and beyond it overpopulation
  // eases it back down.
  POP_CAPACITY: 100,
  // Breeding & queens
  MATE_URGE_MIN: 65,     // an ant will only mate once its own happiness clears a personal
  MATE_URGE_MAX: 95,     // threshold in this band ("horniness"); above newborn start mood, so
                         // the young must mature and cheer up before they can breed
  MATE_CHANCE: 0.35,     // base chance a willing, encountered pair actually breeds
  CROWD_MATE_STEP: 0.05, // each nearby colony-mate trims that chance by this
  CROWD_MATE_FLOOR: 0.35,// ...but never below this fraction of it (denser = fewer births)
  QUEEN_MIN_ANTS: 12,    // ...but only once the colony is at least this many strong
  NURSERY_REQUIRED_ABOVE: 10,  // past this many ants, a colony must have a built nursery to keep breeding
  QUEEN_HIGH: 75,        // a colony's bar at/above this (sustained) summons its queen
  QUEEN_LOW: 40,         // ...and she leaves below this
  SADIST_SPAWN: 25,      // Sadist: rival queen arrives when main mood is below this
  SADIST_LEAVE: 60,      // ...and leaves once main mood recovers above this
};
let TUNE = { ...TUNE_DEFAULTS };

// Dead insects: too big for one ant, a feast for the colony. A carcass is
// roughly 80% sugar / 20% protein (see applyMeal) and feeds a big crowd.
const INSECT_HAULERS      = 3;   // ants needed before a carcass moves
const INSECT_SERVINGS_MIN = 10;  // how many ants one carcass can feed...
const INSECT_SERVINGS_MAX = 15;  // ...picked in this range per carcass
const INSECT_RADIUS   = 9;
const HAUL_PATIENCE   = 900;  // ticks a short-handed team waits before giving up
const HAUL_STUCK_DROP = 300;  // ticks a full team grinds on a wall before it drops the carcass to be re-found
const HAUL_COOLDOWN   = 900;  // ticks a giver-upper ignores carcasses afterwards

function insectServings() {
  return INSECT_SERVINGS_MIN + Math.floor(Math.random() * (INSECT_SERVINGS_MAX - INSECT_SERVINGS_MIN + 1));
}

// Grace: a newborn's happiness and fullness don't decay naturally for its first
// minute of life (only poison/attack still bite). And a colony's mood must hold
// at/above the queen threshold for a sustained spell before its queen appears.
const NEWBORN_GRACE_MS = 60000;
const QUEEN_SUSTAIN_MS = 8000;

// Default "living world": food rains at random, weighted by rarity — sugar
// often, protein seldom, a dead insect a rare treat. AUTO_FOOD_MS is the base
// gap between drops (jittered 0.6–1.4×), so a drop lands roughly every 7–17s —
// an occasional ambient drip, not a downpour.
const AUTO_FOOD_WEIGHTS = { sugar: 73, fruit: 12, protein: 12, insect: 3 };
const AUTO_FOOD_MS = 26000;   // base gap between drops (jittered 0.6–1.4×) — an occasional drip

// Per food type. FOOD_UNITS is how many separate trips a dropped piece takes to
// haul home (its "drops"): a carrier lifts one unit per trip and the rest waits
// for the next ant. FOOD_FEEDS is how many nestmates one delivered drop feeds.
// FOOD_SPACING is how far apart a dragged brush scatters pieces — protein sits
// wider than fruit, fruit wider than sugar, and a dead insect drops once per tap.
const FOOD_UNITS   = { sugar: 3, fruit: 5, protein: 1, poison: 1, spoiled: 1, insect: 1 };
// Delivered servings for single-ant hauls; a dead insect sets its own (insectServings).
const FOOD_FEEDS   = { sugar: 1, fruit: 1, protein: 2, spoiled: 1 };
const FOOD_SPACING = { sugar: 22, fruit: 40, protein: 64, poison: 90, spoiled: 30, insect: Infinity };

function initialUnits(type) { return FOOD_UNITS[type] || 1; }

// Poison is a slow bomb: one drop carried home poisons a whole crowd (5-10).
function deliveredServings(type) {
  return type === 'poison' ? 5 + Math.floor(Math.random() * 6) : (FOOD_FEEDS[type] || 1);
}

