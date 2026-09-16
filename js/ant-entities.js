// ant-farm — ants, food & nest entities
'use strict';

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------
// Read live from the sliders so a change applies to every ant at once.
function antSpeed(isRed, isQueen) { return isQueen ? 0 : (isRed ? redAntSpeed : normalAntSpeed); }

function createAnt(isRed = false, isQueen = false, x, y) {
  const base   = isRed ? redAntLifespan : normalAntLifespan;
  const jitter = 1 + (Math.random() * 0.2 - 0.1);
  return {
    id: nextAntId++,
    x: x !== undefined ? x : Math.random() * canvas.width,
    y: y !== undefined ? y : Math.random() * canvas.height,
    angle: Math.random() * Math.PI * 2,
    isRed, isQueen,
    baseLifespan: base,
    lifespan: isQueen ? Infinity : base * jitter,
    age: 0,                                        // ms lived; drives the newborn grace period
    breedingTimer: Math.random() * matingSpeed,
    matingJitter: 0.7 + Math.random() * 0.6,       // per-ant ×0.7–1.3 on the mating interval, so pairs don't sync
    mateUrge: TUNE.MATE_URGE_MIN + Math.random() * (TUNE.MATE_URGE_MAX - TUNE.MATE_URGE_MIN),  // happiness it must reach to be willing to mate ("horniness")
    spawnTimer: 0,
    // A hidden temperament and a jittered starting mood so no two ants are alike.
    happiness: clamp(TUNE.HAPPINESS_START + (Math.random() * 2 - 1) * TUNE.HAPPINESS_JITTER, 0, 100),
    temperament: 1 + (Math.random() * TUNE.TEMPERAMENT_SPREAD - TUNE.TEMPERAMENT_SPREAD / 2),
    fullness: clamp(TUNE.FULLNESS_START + (Math.random() * 2 - 1) * TUNE.FULLNESS_JITTER, 0, 100),
    hungerPoint: TUNE.HUNGER_MIN + Math.random() * (TUNE.HUNGER_MAX - TUNE.HUNGER_MIN),
    wet: false,
    poisoned: false,
    slowed: 0,
    speedBoost: 0,      // ticks left moving faster after protein
    mateBoost: 0,       // ticks left keen to mate after protein
    trail: 0,
    carrying: null,     // { type, age } while hauling food back to the nest
    dropOffset: null,   // where in the nest ring this ant will drop it
    carryTicks: 0,
    hauling: null,      // the carcass this ant is on a team for
    haulCooldown: 0,    // ticks left ignoring carcasses after a team gave up
    wallCooldown: 0,    // ticks left peeling away from a wall before chasing again
    digTimer: 0,        // ticks spent digging the wall block it's standing on
    stuckMs: 0          // ms getting nowhere against walls; triggers a burrow-out
  };
}

// Walls and (dug) soil both block movement (used for building/spawn checks).
function collidesWall(x, y) {
  let hit = false;
  forEachEnvNear(x, y, 40, o => {
    if (hit || (o.type !== 'wall' && o.type !== 'soil')) return;
    const r = (o.r || 4) + 3;
    if (dist2(o.x, o.y, x, y) < r * r) hit = true;
  });
  return hit;
}

// What an ant can't walk into: walls, soil AND water (ants avoid and never cross it).
function blockedForAnt(x, y) {
  let hit = false;
  forEachEnvNear(x, y, 40, o => {
    if (hit) return;
    const r = (o.r || 4) + 3;
    if (dist2(o.x, o.y, x, y) < r * r) hit = true;
  });
  return hit;
}

// The nearest bit of terrain to a point (for working out which wall to follow).
function nearestObstacle(x, y, range = 40) {
  let best = null, bd = range * range;
  forEachEnvNear(x, y, range, o => {
    const d = dist2(o.x, o.y, x, y);
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}

// Any room footprint (either colony) covers this point?
function inAnyRoom(x, y) {
  for (const room of rooms) if (dist2(room.x, room.y, x, y) < room.r * room.r) return true;
  return false;
}

// Where auto-food (and Sadist poison) may land: not on terrain/water, not on a
// queen, and never inside the nest — no room footprint and no spawn area, so food
// always lands in the open and must be carried in to the pantry.
function foodSpawnAllowed(x, y) {
  let ok = true;
  forEachEnvNear(x, y, 40, o => {
    if (!ok) return;
    const r = (o.r || 4) + 4;
    if (dist2(o.x, o.y, x, y) < r * r) ok = false;   // wall, soil or water all exclude
  });
  if (!ok) return false;
  for (const q of [queens.white, queens.red]) {
    if (q && dist2(q.x, q.y, x, y) < 16 * 16) return false;
  }
  for (const key of ['yellow', 'red']) {
    for (const s of spawnPoints[key]) if (dist2(s.x, s.y, x, y) < s.r * s.r) return false;
  }
  if (inAnyRoom(x, y)) return false;
  return true;
}

// A trapped ant burrows: remove the nearest soil block, opening a hole to escape.
function burrowHole(x, y) {
  let bi = -1, bd = 16 * 16;
  for (let i = 0; i < environment.length; i++) {
    const o = environment[i];
    if (o.type !== 'soil') continue;
    const d = dist2(o.x, o.y, x, y);
    if (d < bd) { bd = d; bi = i; }
  }
  if (bi < 0) return false;
  environment.splice(bi, 1);
  markEnvDirty();
  return true;
}

// Raise one soil block at (x,y): a brown wall the colony builds with. Refuses to
// stack on terrain already there or to bury a spawn point's clear core.
// Is an ant standing on this spot (so a wall block would bury it)?
function spotOccupied(x, y) {
  const rr = (SOIL_R + 4) * (SOIL_R + 4);
  for (const o of ants) if (dist2(o.x, o.y, x, y) < rr) return true;
  return false;
}

function digSoil(x, y, room = false) {
  x = clamp(x, 0, canvas.width);
  y = clamp(y, 0, canvas.height);
  if (collidesWall(x, y)) return false;
  if (spotOccupied(x, y)) return false;   // never raise a wall on top of an ant
  for (const isRed of [false, true]) {
    for (const s of colonySpawnPoints(isRed)) {
      if (dist2(s.x, s.y, x, y) < nestCore(s) * nestCore(s)) return false;
    }
  }
  environment.push({ x, y, type: 'soil', r: SOIL_R, room });   // room soil is drawn as a smooth wall
  markEnvDirty();
  return true;
}

// ---------------------------------------------------------------------------
// Nest rooms (World Building Mode)
// ---------------------------------------------------------------------------
// A room is a planned circle the colony walls in with soil, leaving a doorway
// gap. Ants dig its wall blocks over time; when every block is raised it's built.

function roomCount(team, type) {
  let n = 0;
  for (const r of rooms) if (r.team === team && r.type === type) n++;
  return n;
}
function builtRoom(team, type) {
  for (const r of rooms) if (r.team === team && r.type === type && r.built) return r;
  return null;
}
function hasBuiltRoom(team, type) { return !!builtRoom(team, type); }

// The colony's primary nest, and the direction that points away from its rival —
// where the nursery and throne want to sit.
function nestAnchor(team) { return colonySpawnPoints(team)[0]; }
function awayFromRival(team) {
  const a = nestAnchor(team), enemy = nestAnchor(!team);
  return Math.atan2(a.y - enemy.y, a.x - enemy.x);
}

// A doorway opening as wide as the tunnel channel, so an ant can actually pass.
function gapArcFor(r) { return 2 * Math.asin(Math.min(0.85, DOORWAY_HALF / Math.max(r, DOORWAY_HALF))); }

// Is an angle within any of a ring's doorway gaps?
function inAnyGap(ang, gaps) {
  for (const g of gaps) {
    const off = Math.abs(((ang - g.angle + Math.PI) % (Math.PI * 2)) - Math.PI);
    if (off < g.arc / 2) return true;
  }
  return false;
}

// The centre of a room's (first) doorway, on the ring.
function doorwayPoint(room) {
  return { x: room.x + Math.cos(room.gapAngle) * room.r, y: room.y + Math.sin(room.gapAngle) * room.r };
}

// Wall-block sites evenly around a room, leaving every doorway gap open. Each site
// carries an open-side approach point so a builder digs from outside the ring.
function roomWallSites(cx, cy, r, gaps) {
  const n = Math.max(10, Math.round((2 * Math.PI * r) / ROOM_SITE_STEP));
  const sites = [];
  for (let k = 0; k < n; k++) {
    const ang = (k / n) * Math.PI * 2;
    if (inAnyGap(ang, gaps)) continue;   // leave the doorway/link openings clear
    const ar = r + SOIL_R + 8;
    sites.push({ x: clamp(cx + Math.cos(ang) * r, 0, canvas.width),
                 y: clamp(cy + Math.sin(ang) * r, 0, canvas.height),
                 ax: clamp(cx + Math.cos(ang) * ar, 0, canvas.width),
                 ay: clamp(cy + Math.sin(ang) * ar, 0, canvas.height), done: false, tries: 0 });
  }
  return sites;
}

// A corridor whose two walls START at a room's doorway edges and run straight to a
// target (the junction, or another room), so the corridor joins the ring wall
// with no gap and leaves a channel exactly as wide as the doorway.
function corridorWalls(cx, cy, r, gapAngle, gapArc, tx, ty, endPad = 0) {
  const doorx = cx + Math.cos(gapAngle) * r, doory = cy + Math.sin(gapAngle) * r;
  const p1x = cx + Math.cos(gapAngle + gapArc / 2) * r, p1y = cy + Math.sin(gapAngle + gapArc / 2) * r;
  const p2x = cx + Math.cos(gapAngle - gapArc / 2) * r, p2y = cy + Math.sin(gapAngle - gapArc / 2) * r;
  const len = Math.max(0, Math.hypot(tx - doorx, ty - doory) - endPad);
  const ux = Math.cos(gapAngle), uy = Math.sin(gapAngle);
  const sites = [];
  for (let d = 0; d <= len; d += ROOM_SITE_STEP) {
    const mx = doorx + ux * d, my = doory + uy * d;   // channel centre (the ant works from here)
    for (const [ex, ey] of [[p1x, p1y], [p2x, p2y]]) {
      sites.push({ x: clamp(ex + ux * d, 0, canvas.width), y: clamp(ey + uy * d, 0, canvas.height),
                   ax: clamp(mx, 0, canvas.width), ay: clamp(my, 0, canvas.height), done: false, tries: 0 });
    }
  }
  return sites;
}

// Two flanking walls from (x0,y0) to (x1,y1), leaving a walkable channel between
// them — used where a corridor isn't anchored to a ring. Works from the centre.
function channelWalls(x0, y0, x1, y1) {
  const ang = Math.atan2(y1 - y0, x1 - x0), perp = ang + Math.PI / 2;
  const len = Math.hypot(x1 - x0, y1 - y0);
  const sites = [];
  for (let d = 0; d <= len; d += ROOM_SITE_STEP) {
    const chx = x0 + Math.cos(ang) * d, chy = y0 + Math.sin(ang) * d;
    for (const side of [-1, 1]) {
      const x = chx + Math.cos(perp) * TUNNEL_HALF_W * side, y = chy + Math.sin(perp) * TUNNEL_HALF_W * side;
      sites.push({ x: clamp(x, 0, canvas.width), y: clamp(y, 0, canvas.height),
                   ax: clamp(chx, 0, canvas.width), ay: clamp(chy, 0, canvas.height), done: false, tries: 0 });
    }
  }
  return sites;
}

// Room radius, scaled down for the rival colony's more modest nest.
function roomRadius(team, type) { return Math.round(ROOM_SPECS[type].r * (team ? RED_ROOM_SCALE : 1)); }

function makeRoom(team, type, cx, cy, gapAngle, manual = false) {
  const spec = ROOM_SPECS[type];
  const r = roomRadius(team, type);
  const gaps = [{ angle: gapAngle, arc: gapArcFor(r) }];
  return {
    id: nextRoomId++, team, type, manual,
    x: clamp(cx, 0, canvas.width), y: clamp(cy, 0, canvas.height), r,
    gapAngle, gaps, order: manual ? -1 : spec.order,   // user-nudged rooms build first
    sites: roomWallSites(cx, cy, r, gaps),
    tunnelSites: [],       // corridor walls back to the junction (and any room link)
    barricadeSites: null,  // filled on a breach: soil to seal the doorway
    breached: false, linked: false, built: false
  };
}

// Structural completion: every ring and tunnel block raised. Barricades are a
// separate emergency task and don't gate this.
function refreshBuilt(room) {
  room.built = room.sites.every(s => s.done) && (room.tunnelSites || []).every(s => s.done);
}

// A room breached by a rival gets its main doorway filled in — soil across the
// gap, dug at top priority to seal the colony in.
function barricadeRoom(room) {
  if (room.barricadeSites) return;
  const arc = room.gaps[0].arc, sites = [];
  const n = Math.max(3, Math.round(arc * room.r / ROOM_SITE_STEP) + 1);
  const ar = room.r + SOIL_R + 8;
  for (let k = 0; k <= n; k++) {
    const ang = room.gapAngle - arc / 2 + (k / n) * arc;
    sites.push({ x: clamp(room.x + Math.cos(ang) * room.r, 0, canvas.width),
                 y: clamp(room.y + Math.sin(ang) * room.r, 0, canvas.height),
                 ax: clamp(room.x + Math.cos(ang) * ar, 0, canvas.width),
                 ay: clamp(room.y + Math.sin(ang) * ar, 0, canvas.height), done: false, tries: 0 });
  }
  room.barricadeSites = sites;
  room.breached = true;
}

// Lay an egg to hatch on a timer — in the colony's nursery if it has one, else at
// a fallback spot (the queen's position). `source` is 'mate' (worker) or 'queen',
// which decides whether the hatchling counts as born or spawned.
function layEgg(team, source = 'mate', fx, fy) {
  const n = builtRoom(team, 'nursery');
  let x, y;
  if (n) { const ang = Math.random() * Math.PI * 2, d = Math.random() * (n.r * 0.6); x = n.x + Math.cos(ang) * d; y = n.y + Math.sin(ang) * d; }
  else if (fx !== undefined) { x = fx; y = fy; }
  else return false;
  eggs.push({ x, y, team, hatch: EGG_HATCH_MS, source });
  return true;
}

// Nursery deepest (away from the rival), throne beside it; pantry off to one
// side; entry toward the open. So the nursery is the most sheltered room.
const ROOM_PLACE_ANGLE = { nursery: 0, throne: 0.85, pantry: -1.4, entry: Math.PI };
const ROOM_DEPTH       = { nursery: 1.35, throne: 1.0, pantry: 1.0, entry: 1.0 };  // ×tunnel length

function roomCap(type) { return ROOM_CAPS[type] ?? Infinity; }
function canAddRoom(team, type) { return roomCount(team, type) < roomCap(type); }

// Would a disc of radius r centred here overlap one of this colony's rooms?
function placementBlocked(team, cx, cy, r) {
  for (const room of rooms) {
    if (room.team !== team) continue;
    const min = room.r + r + 10;
    if (dist2(room.x, room.y, cx, cy) < min * min) return true;
  }
  return false;
}

// Build a full room object (ring + a tunnel back to the junction) at a spot.
function buildRoomAt(team, type, cx, cy, manual = false) {
  const a = nestAnchor(team);
  const m = roomRadius(team, type) + SOIL_R + 10;
  cx = clamp(cx, m, canvas.width - m);
  cy = clamp(cy, m, canvas.height - m);
  const gap = Math.atan2(a.y - cy, a.x - cx);   // doorway faces the junction
  const room = makeRoom(team, type, cx, cy, gap, manual);
  // Corridor from the doorway edges to the junction, stopping short of the open core.
  room.tunnelSites = corridorWalls(cx, cy, room.r, gap, room.gaps[0].arc, a.x, a.y, nestCore(a) + 6);
  return room;
}

// A free, on-canvas spot for a room, per type's angle and depth — rotate and push
// out until it clears the other rooms, so nothing is built on top of anything.
function findRoomSpot(team, type) {
  const a = nestAnchor(team), r = roomRadius(team, type);
  const m = r + SOIL_R + 10, base = awayFromRival(team) + (ROOM_PLACE_ANGLE[type] || 0);
  const reach = a.r + TUNNEL_LEN * (ROOM_DEPTH[type] || 1) + r;
  for (let ring = 0; ring < 5; ring++) {
    const dist = reach + ring * (2 * r + 16);
    for (let k = 0; k < 12; k++) {
      const ang = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.4;
      const cx = clamp(a.x + Math.cos(ang) * dist, m, canvas.width - m);
      const cy = clamp(a.y + Math.sin(ang) * dist, m, canvas.height - m);
      if (!placementBlocked(team, cx, cy, r)) return { x: cx, y: cy };
    }
  }
  return null;   // nowhere clear (a very crowded board)
}

// A direct corridor between the nursery and the throne: open a second doorway in
// each facing the other and run a channel between their edges. Done once, while
// both are still unbuilt so recomputing their rings loses no progress.
function linkNurseryThrone(team) {
  const n = rooms.find(r => r.team === team && r.type === 'nursery' && !r.linked);
  const t = rooms.find(r => r.team === team && r.type === 'throne' && !r.linked);
  if (!n || !t) return;
  if (n.sites.some(s => s.done) || t.sites.some(s => s.done)) { n.linked = t.linked = true; return; }
  const ang = Math.atan2(t.y - n.y, t.x - n.x);
  n.gaps.push({ angle: ang, arc: gapArcFor(n.r) });
  t.gaps.push({ angle: ang + Math.PI, arc: gapArcFor(t.r) });
  n.sites = roomWallSites(n.x, n.y, n.r, n.gaps);
  t.sites = roomWallSites(t.x, t.y, t.r, t.gaps);
  // Corridor from the nursery's new doorway edges across to the throne's edge.
  n.tunnelSites = n.tunnelSites.concat(
    corridorWalls(n.x, n.y, n.r, ang, gapArcFor(n.r), t.x, t.y, t.r));
  n.linked = t.linked = true;
}

// Auto-build planner: each room hangs off the open junction by its own tunnel, so
// no room is crossed to reach another; the pantry links only to the junction and
// the nursery links to the throne. No-ops once each is planned.
function planNest(team) {
  if (!worldBuilding) return;
  const count = team ? countRedAnts() : countWhiteAnts();
  if (count < MIN_BUILD_ANTS) return;
  // The rival keeps it modest (nursery + pantry); the main colony adds an entry
  // and a throne. Build the nursery first so it's the deepest, most sheltered.
  const order = team ? ['nursery', 'pantry'] : ['nursery', 'entry', 'pantry', 'throne'];
  for (const type of order) {
    if (roomCount(team, type) === 0) {
      const spot = findRoomSpot(team, type);
      if (spot) rooms.push(buildRoomAt(team, type, spot.x, spot.y));
    }
  }
  linkNurseryThrone(team);
}

// Non-interactive add (tests / fallback): drop a room in the first clear spot.
function addRoomManual(team, type) {
  if (!canAddRoom(team, type)) return false;
  const spot = findRoomSpot(team, type);
  if (!spot) return false;
  rooms.push(buildRoomAt(team, type, spot.x, spot.y, true));
  return true;
}

function spawnNear(parent, isRed) {
  // Newborns appear beside the parent, but never inside a wall: otherwise a
  // chain of births could creep through to the other side. A wider scatter
  // keeps a breeding cluster from piling births onto one spot.
  const a = Math.random() * Math.PI * 2;
  const d = 10 + Math.random() * 20;
  let x = (parent.x + Math.cos(a) * d + canvas.width)  % canvas.width;
  let y = (parent.y + Math.sin(a) * d + canvas.height) % canvas.height;
  if (collidesWall(x, y)) { x = parent.x; y = parent.y; }
  return createAnt(isRed, false, x, y);
}

function makeFood(x, y, type, extra = {}) {
  const f = { x, y, type, delivered: false, foundBy: null, age: 0 };
  if (type === 'insect') Object.assign(f, { haulers: [], servings: insectServings(), dropOffset: null, stuck: 0, waited: 0, heading: 0 });
  Object.assign(f, extra);
  // units = trips left to haul this piece home; size = the brush it was drawn
  // with, so a fatter brush drops fatter food. Backfill both if not supplied.
  if (!Number.isFinite(f.units)) f.units = initialUnits(type);
  if (!Number.isFinite(f.size))  f.size  = penWidth || 4;
  return f;
}

function addFood(x, y, type, extra = {}) {
  if (foods.length >= MAX_FOOD) return false;
  foods.push(makeFood(x, y, type, extra));
  return true;
}

// Whether this ant is one of the finders of a piece of delivered food.
function foundByAnt(f, ant) {
  return Array.isArray(f.foundBy) ? f.foundBy.includes(ant.id) : f.foundBy === ant.id;
}

function foodRadius(f) {
  const base = f.type === 'insect' ? INSECT_RADIUS : f.type === 'fruit' ? 6 : 4;
  return base * clamp((f.size || 4) / 4, 0.6, 3);   // brush 4 is the baseline drop
}

// Manually added ants appear at one of their colony's spawn points (nudged
// out of any wall).
function createAntAtSpawn(isRed) {
  return spawnNear(randomSpawnPoint(isRed), isRed);
}

// A queen is born at one of her colony's spawn points, not out in the open.
function spawnQueen(isRed) {
  const s = randomSpawnPoint(isRed);
  return createAnt(isRed, true, s.x, s.y);
}

// Pick a spot in the nest ring, as an offset so it applies to whichever nest
// turns out to be nearest on the way home.
function pickDropOffset(clearance = 4, isRed = false, x = 0, y = 0) {
  const s = nearestSpawnPoint(isRed, x, y);
  let dx = 0, dy = 0;
  const lo = nestCore(s) + clearance, hi = Math.max(lo, s.r - 4);
  for (let tries = 0; tries < 6; tries++) {
    const a = Math.random() * Math.PI * 2;
    const d = lo + Math.random() * (hi - lo);
    dx = Math.cos(a) * d; dy = Math.sin(a) * d;
    if (!collidesWall(s.x + dx, s.y + dy)) break;
  }
  return { dx, dy };
}

// The nearest piece of this colony's own stockpile to its nest, if any.
function nearestColonyDelivered(s, isRed) {
  let best = null, bd = (s.r + 20) * (s.r + 20);
  for (const f of foods) {
    if (!f.delivered || f.team !== isRed) continue;
    const d = dist2(f.x, f.y, s.x, s.y);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

function dropTarget(ant) {
  // Once a pantry is built, food is stored there; until then it piles at the nest.
  const pantry = builtRoom(ant.isRed, 'pantry');
  const home = pantry || nearestSpawnPoint(ant.isRed, ant.x, ant.y);
  const anchor = nearestColonyDelivered(home, ant.isRed);
  if (!anchor) return pantry ? { x: pantry.x, y: pantry.y } : nestTarget(home, ant.dropOffset, 4);
  // Every later piece packs against the stockpile, on the ant's approach side.
  const ang = Math.atan2(ant.y - anchor.y, ant.x - anchor.x);
  const r = 2 * foodRadius(anchor);
  return { x: anchor.x + Math.cos(ang) * r, y: anchor.y + Math.sin(ang) * r };
}

// Ants coordinate by scent, not messages: every reaction is a pheromone dropped
// here and read back by whoever passes near (see strongestPheromone). 'trail'
// (the default) marks a food find; 'danger' is laid where a mate was killed and
// drives the flee/rally response.
function layPheromone(x, y, strength = 1, kind = 'trail') {
  if (pheromones.length >= MAX_PHEROMONES) pheromones.shift();
  pheromones.push({ x, y, strength, kind });
}

function killAnt(index) {
  const a = ants[index];
  ants.splice(index, 1);
  // Whatever it was hauling lands where it fell, unclaimed.
  if (a.carrying) addFood(a.x, a.y, a.carrying.type, { age: a.carrying.age, size: a.carrying.size, units: 1 });
  if (a.hauling) leaveTeam(a);
  if (a.isRed) totalDeadRed++;
  else totalDeadWhite++;
}

