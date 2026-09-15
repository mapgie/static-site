// ant-farm — runtime state
'use strict';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let ants               = [];
let foods              = [];
let pheromones         = [];
let environment        = [];
let environmentHistory = [];
let queens             = { white: null, red: null };
let spawnPoints        = { yellow: [], red: [] };   // per colony; empty = canvas centre
let showSpawnPoints    = false;  // during play; the maintenance view always shows them
let maintenance        = false;  // spawn point maintenance view
let selectedPoint      = null;
let dragPoint          = null;
let pausedBeforeMaint  = false;
let nextAntId          = 1;

let animationPaused    = false;
let whiteHappiness     = 50;
let redHappiness       = 50;
let whiteCalmMs        = 0;   // ms since a main-colony ant was last killed by an antagonist
let whiteQueenReadyMs  = 0;   // ms the main colony's mood has held at/above the queen threshold
let redQueenReadyMs    = 0;   // ...same for the rival colony (non-sadist)
let autoFood           = true;  // "living world": food rains at random by default
let autoFoodTimer      = 0;   // ms accrued toward the next auto drop
let autoFoodNext       = 0;   // ms until the next auto drop (jittered)
let matingSpeed        = 8200;
let allowRedBreeding   = true;
let redAggressionLevel = 50;
let sadistMode         = false;  // rival queen keyed off the main colony's misery instead of its own mood
let normalAntLifespan  = 120000;
let redAntLifespan     = 120000;
let normalAntSpeed     = 1.1;    // px per tick; sliders hold hundredths
let redAntSpeed        = 1.05;
let foodDecayRate      = 25;     // 1..100, slider; see decayStageMs()

let totalBornWhite = 0, totalDeadWhite = 0;
let totalBornRed   = 0, totalDeadRed   = 0;
// Of the born total, how many came from mating vs. were spawned (queen / hand-added).
let matedWhite = 0, spawnedWhite = 0;
let matedRed   = 0, spawnedRed   = 0;
// Of the dead total, how many were killed by a rival (vs. died of hunger / age / poison).
let killedWhite = 0, killedRed = 0;

let canvas, ctx;
let lastX = null, lastY = null;
let lastFoodX = null, lastFoodY = null;   // last painted sugar piece, for drop spacing
let penWidth = 4;

let worldBuilding  = true;   // World Building Mode: ants dig soil and build rooms (on by default for now)

let envGrid   = new Map();
let envDirty  = true;
let statsTimer = 0;

