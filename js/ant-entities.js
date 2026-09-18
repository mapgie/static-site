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
    mateUrge: TUNE.MATE_URGE_MIN + Math.random() * (TUNE.MATE_URGE_MAX - TUNE.MATE_URGE_MIN),  // happiness it must reach before it's willing to mate (its mate-urge threshold)
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
// The margin is a touch wider than the build-collision one so an ant's body keeps
// clear of the drawn wall instead of visibly riding along it.
function blockedForAnt(x, y) {
  let hit = false;
  forEachEnvNear(x, y, 40, o => {
    if (hit) return;
    const r = (o.r || 4) + ANT_WALL_CLEAR;
    if (dist2(o.x, o.y, x, y) < r * r) hit = true;
  });
  return hit;
}

// Is there a soil/wall block sitting essentially AT this point (not merely nearby)?
// A wall site is only "done" when its own block is in place, so removing a
// neighbouring block can't silently leave it uncovered.
function soilAt(x, y) {
  let hit = false;
  const r2 = (SOIL_R * 0.9) * (SOIL_R * 0.9);
  forEachEnvNear(x, y, 10, o => {
    if (!hit && (o.type === 'soil' || o.type === 'wall') && dist2(o.x, o.y, x, y) < r2) hit = true;
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

// Is (x,y) inside one of this colony's BUILT rooms? Used to decide a carrier is
// "home" — it has made it into the sealed nest, so its load can go to the pantry.
function insideMyBuiltRoom(team, x, y) {
  for (const r of rooms) if (r.team === team && r.built && dist2(r.x, r.y, x, y) < r.r * r.r) return true;
  return false;
}

// In the "nest zone": inside any room, or hemmed in by nest wall soil (a corridor).
// Used to spot a forager that's stuck indoors — a room OR a corridor junction.
function inNestZone(x, y) {
  if (inAnyRoom(x, y)) return true;
  const o = nearestObstacle(x, y, TUNNEL_HALF_W + 8);
  return !!(o && o.type === 'soil' && o.room);
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
// If the block was a room wall, clear its site too — so the wall stops being drawn
// there (no ghost wall that ants appear to walk through) and the colony re-seals the
// escape hole on its own.
function burrowHole(x, y) {
  let bi = -1, bd = 16 * 16;
  for (let i = 0; i < environment.length; i++) {
    const o = environment[i];
    if (o.type !== 'soil') continue;
    const d = dist2(o.x, o.y, x, y);
    if (d < bd) { bd = d; bi = i; }
  }
  if (bi < 0) return false;
  const b = environment[bi];
  environment.splice(bi, 1);
  markEnvDirty();
  if (b.room) clearRoomSiteAt(b.x, b.y);
  return true;
}

// Mark any room wall site at (x,y) as undone and flag its room for re-sealing, so a
// removed block no longer renders as a wall and the colony digs it back in.
function clearRoomSiteAt(x, y) {
  const near2 = (SOIL_R * 1.5) * (SOIL_R * 1.5);
  for (const room of rooms) {
    let hit = false;
    for (const s of room.sites.concat(room.tunnelSites || [], room.barricadeSites || [])) {
      if (s.done && dist2(s.x, s.y, x, y) < near2) { s.done = false; s.tries = 0; hit = true; }
    }
    if (hit) { room.built = false; room._stall = 0; room._lastDone = -1; }
  }
}

// Raise one soil block at (x,y): a brown wall the colony builds with. Refuses to
// stack on terrain already there or to bury a spawn point's clear core.
// Is an ant standing on this spot?
function spotOccupied(x, y) {
  const rr = (SOIL_R + 4) * (SOIL_R + 4);
  for (const o of ants) if (dist2(o.x, o.y, x, y) < rr) return true;
  return false;
}

// Nudge any ants off a spot to just clear of it, so a wall block can go up there
// without burying them (they step aside for the builders).
function shoveAntsOff(x, y) {
  const rr = (SOIL_R + 4) * (SOIL_R + 4);
  for (const o of ants) {
    if (dist2(o.x, o.y, x, y) >= rr) continue;
    const ang = (o.x === x && o.y === y) ? Math.random() * Math.PI * 2 : Math.atan2(o.y - y, o.x - x);
    for (let push = SOIL_R + 6; push <= SOIL_R + 20; push += 4) {
      const nx = clamp(x + Math.cos(ang) * push, 0, canvas.width), ny = clamp(y + Math.sin(ang) * push, 0, canvas.height);
      if (!blockedForAnt(nx, ny)) { o.x = nx; o.y = ny; break; }
    }
  }
}

function digSoil(x, y, room = false) {
  x = clamp(x, 0, canvas.width);
  y = clamp(y, 0, canvas.height);
  // Refuse only a near-exact duplicate. A room wall needs its closely-spaced blocks
  // (~6px apart) to ALL go down so it's solid — the old collision-radius check
  // skipped every other one, leaving gaps ants walked straight through. Free-hand
  // digging keeps the wider spacing.
  const dupR = room ? SOIL_R * 0.8 : SOIL_R + 3, dupR2 = dupR * dupR;
  let dup = false;
  forEachEnvNear(x, y, 20, o => {
    if (!dup && (o.type === 'soil' || o.type === 'wall') && dist2(o.x, o.y, x, y) < dupR2) dup = true;
  });
  if (dup) return false;
  for (const isRed of [false, true]) {
    for (const s of colonySpawnPoints(isRed)) {
      if (dist2(s.x, s.y, x, y) < nestCore(s) * nestCore(s)) return false;
    }
  }
  shoveAntsOff(x, y);   // ants step aside rather than get walled in
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
    const ar = r + SOIL_R + 8;                       // approach from outside the ring
    const ir = Math.max(4, r - SOIL_R - 8);          // ...or from inside it
    sites.push({ x: clamp(cx + Math.cos(ang) * r, 0, canvas.width),
                 y: clamp(cy + Math.sin(ang) * r, 0, canvas.height),
                 ax: clamp(cx + Math.cos(ang) * ar, 0, canvas.width),
                 ay: clamp(cy + Math.sin(ang) * ar, 0, canvas.height),
                 ax2: clamp(cx + Math.cos(ang) * ir, 0, canvas.width),
                 ay2: clamp(cy + Math.sin(ang) * ir, 0, canvas.height), done: false, tries: 0 });
  }
  return sites;
}

// A corridor whose two walls START at a room's doorway edges and run straight to
// the FAR room's matching doorway edges, so the corridor joins both ring walls
// with no gap and leaves a channel exactly as wide as the doorway.
//
// The walls run parallel to the A→B axis at ±hoff (the door-edge offset). On the
// far ring those ±hoff points sit sqrt(b.r² − hoff²) back from B's centre — closer
// than b.r — so the walls must reach that far. Stopping them a flat `b.r` short of
// B's centre (as the old code did) left every corridor ~1 block shy of the far
// doorway and opened a gap at each mouth that the nest leaked through.
function corridorWalls(cx, cy, r, gapAngle, gapArc, tx, ty, endPad = 0) {
  const ux = Math.cos(gapAngle), uy = Math.sin(gapAngle);   // A→B axis (unit)
  const px = -uy, py = ux;                                  // perpendicular (unit)
  const hoff = r * Math.sin(gapArc / 2);                    // channel half-width = A's door-edge offset
  const bR   = endPad || 0;                                 // far room radius
  const D    = Math.hypot(tx - cx, ty - cy);                // centre-to-centre distance
  const sA   = Math.sqrt(Math.max(0, r * r   - hoff * hoff)); // A door edge, axial from A's centre
  const sBack = Math.sqrt(Math.max(0, bR * bR - hoff * hoff)); // B door edge, axial back from B's centre
  const len  = Math.max(0, D - sBack - sA);                 // wall run, from A's door edge onward
  const doorx = cx + ux * sA, doory = cy + uy * sA;         // channel centre at A's mouth
  const sites = [];
  const n = Math.max(1, Math.ceil(len / ROOM_SITE_STEP));   // even spacing, both ends included
  for (let k = 0; k <= n; k++) {
    const d = (len * k) / n;
    const mx = doorx + ux * d, my = doory + uy * d;         // channel centre (the ant works from here)
    for (const side of [1, -1]) {
      sites.push({ x: clamp(mx + px * hoff * side, 0, canvas.width),
                   y: clamp(my + py * hoff * side, 0, canvas.height),
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

// A bare room ring with no doorways yet — openings are cut as it's wired up.
function makeRoom(team, type, cx, cy, manual = false) {
  const r = roomRadius(team, type);
  return {
    id: nextRoomId++, team, type, manual,
    x: clamp(cx, 0, canvas.width), y: clamp(cy, 0, canvas.height), r,
    gapAngle: 0, gaps: [], links: [],
    order: manual ? -1 : ROOM_SPECS[type].order,   // user-placed rooms build first
    sites: roomWallSites(cx, cy, r, []),           // full ring until a doorway is opened
    tunnelSites: [], barricadeSites: null, breached: false, built: false
  };
}

// Open a doorway in a room's ring toward `angle`, rebuilding its wall around it.
function addGap(room, angle) {
  if (!room.gaps.length) room.gapAngle = angle;   // the first opening is the "primary" (barricade target)
  room.gaps.push({ angle, arc: gapArcFor(room.r) });
  room.sites = roomWallSites(room.x, room.y, room.r, room.gaps);
}

// Wire two rooms together: a doorway in each facing the other, plus a corridor
// between their edges (its walls added to `a`'s build work).
function connectRooms(a, b) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x);
  addGap(a, ang); addGap(b, ang + Math.PI);
  a.tunnelSites = a.tunnelSites.concat(corridorWalls(a.x, a.y, a.r, ang, gapArcFor(a.r), b.x, b.y, b.r));
  a.links.push(b.id); b.links.push(a.id);
  // The new corridor's walls belong to `a`. If `a` was already finished, reopen it
  // so the builders dig the fresh corridor — otherwise a hand-placed room never
  // gets wired up and sits there unconnected.
  a.built = false; a._stall = 0; a._lastDone = -1;
}

// Structural completion: every ring and corridor block raised. Barricades are a
// separate emergency task and don't gate this.
function refreshBuilt(room) {
  room.built = room.sites.every(s => s.done) && (room.tunnelSites || []).every(s => s.done);
}

// A room breached by a rival gets its main doorway filled in — soil across the
// gap, dug at top priority to seal the colony in.
function barricadeRoom(room) {
  if (room.barricadeSites || !room.gaps.length) return;
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

function roomCap(type) { return ROOM_CAPS[type] ?? Infinity; }
function canAddRoom(team, type) { return roomCount(team, type) < roomCap(type); }

// May these two room types share a doorway? (Symmetric; empty rooms link anything.)
function canConnect(a, b) { return (ROOM_CONNECT[a] || []).includes(b) || (ROOM_CONNECT[b] || []).includes(a); }

// Would a disc of radius r centred here overlap one of this colony's rooms?
function placementBlocked(team, cx, cy, r) {
  for (const room of rooms) {
    if (room.team !== team) continue;
    const min = room.r + r + 10;
    if (dist2(room.x, room.y, cx, cy) < min * min) return true;
  }
  return false;
}

// The nearest existing room of this colony that `type` is allowed to connect to.
function nearestConnectable(team, type, cx, cy) {
  let best = null, bd = Infinity;
  for (const r of rooms) {
    if (r.team !== team || !canConnect(type, r.type)) continue;
    const d = dist2(r.x, r.y, cx, cy);
    if (d < bd) { bd = d; best = r; }
  }
  return best;
}

// Place a room and wire it to the nearest room it's allowed to connect to. Manual
// placement (the +buttons) and the auto-builder both go through here.
function buildRoomAt(team, type, cx, cy, manual = true) {
  const rr = roomRadius(team, type), m = rr + SOIL_R + 10;
  cx = clamp(cx, m, canvas.width - m);
  cy = clamp(cy, m, canvas.height - m);
  const parent = nearestConnectable(team, type, cx, cy);
  const room = makeRoom(team, type, cx, cy, manual);
  rooms.push(room);
  if (parent) connectRooms(parent, room);
  return room;
}

// Auto-build the colony's nest as a connected, sealed tree of rooms (an empty hub
// at the spawn with the rooms hung off it), grown once. Only the entry opens out.
function growNest(team) {
  if (rooms.some(r => r.team === team)) return;   // already laid out
  const a = nestAnchor(team);
  const W = canvas.width, H = canvas.height;
  // Grow the nest toward OPEN SPACE (the board's middle) rather than blindly away
  // from the rival, so a spawn tucked near an edge spreads inward instead of cramming
  // the rooms — and the entry — into a corner. Only when the spawn is already central
  // does the rival direction decide which way it faces.
  const toCentre = Math.atan2(H / 2 - a.y, W / 2 - a.x);
  const baseDir = Math.hypot(W / 2 - a.x, H / 2 - a.y) > 120 ? toCentre : awayFromRival(team);
  const tree = (team ? NEST_TREE.red : NEST_TREE.white).root;

  const place = (node, parent, dir) => {
    const r = roomRadius(team, node.type), m = r + SOIL_R + 10;
    let cx, cy;
    if (!parent) { cx = clamp(a.x, m, W - m); cy = clamp(a.y, m, H - m); }
    else {
      const dist = parent.r + CORRIDOR_LEN + r;
      let ok = false;
      for (let k = 0; k < 24 && !ok; k++) {
        const ang = dir + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.4;
        const tx = clamp(parent.x + Math.cos(ang) * dist, m, W - m);
        const ty = clamp(parent.y + Math.sin(ang) * dist, m, H - m);
        if (!placementBlocked(team, tx, ty, r)) { cx = tx; cy = ty; ok = true; }
      }
      if (!ok) return;   // nowhere clear for this branch on a cramped board
    }
    const room = makeRoom(team, node.type, cx, cy);
    rooms.push(room);
    if (parent) connectRooms(parent, room);
    const outDir = parent ? Math.atan2(cy - parent.y, cx - parent.x) : baseDir;
    const kids = node.kids || [];
    kids.forEach((kid, i) => place(kid, room, outDir + (i - (kids.length - 1) / 2) * 1.0));
  };
  place(tree, null, baseDir);

  // The entry opens to the OUTSIDE — a second doorway opposite its inward corridor,
  // and the one the barricade seals if a rival forces it.
  const entry = rooms.find(r => r.team === team && r.type === 'entry');
  if (entry && entry.gaps.length) {
    const outer = entry.gaps[0].angle + Math.PI;
    addGap(entry, outer);
    entry.gapAngle = outer;   // the outer door is the breach/barricade point
  }
}

// Reliability backstop: EVERY unbuilt room tracks its own stall, and any that makes
// no progress for a spell has its remaining walls finished outright — so a whole
// backlog of rooms (e.g. several hand-placed ones) can never deadlock waiting on one
// another. Ants are shoved clear, not buried.
function forceUnstall(team) {
  for (const room of rooms) {
    if (room.team !== team || room.built) continue;
    const all = room.sites.concat(room.tunnelSites || []);
    const done = all.reduce((n, s) => n + (s.done ? 1 : 0), 0);
    if (done !== room._lastDone) { room._lastDone = done; room._stall = 0; continue; }
    if ((room._stall = (room._stall || 0) + 1) > 360) {   // ~6s with zero progress
      for (const s of all) if (!s.done && (digSoil(s.x, s.y, true) || soilAt(s.x, s.y))) s.done = true;
      refreshBuilt(room);
      room._stall = 0;
    }
  }
}

function planNest(team) {
  if (!worldBuilding) return;
  const count = team ? countRedAnts() : countWhiteAnts();
  if (count < MIN_BUILD_ANTS) return;
  growNest(team);
  forceUnstall(team);
}

// Manual add (the + buttons / tests): drop a room near a room it may connect to.
function addRoomManual(team, type) {
  if (!canAddRoom(team, type)) return false;
  const host = nearestConnectable(team, type, nestAnchor(team).x, nestAnchor(team).y);
  if (!host) return false;
  const rr = roomRadius(team, type), dist = host.r + CORRIDOR_LEN + rr, m = rr + SOIL_R + 10;
  for (let k = 0; k < 24; k++) {
    const ang = (k / 24) * Math.PI * 2;
    const cx = clamp(host.x + Math.cos(ang) * dist, m, canvas.width - m);
    const cy = clamp(host.y + Math.sin(ang) * dist, m, canvas.height - m);
    if (!placementBlocked(team, cx, cy, rr)) return !!buildRoomAt(team, type, cx, cy, true);
  }
  return false;
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
  // MAX_FOOD caps LOOSE ambient food (the clutter autoFood/painting scatter). A
  // DELIVERED drop is a carrier stocking the pantry — a transfer, not new clutter —
  // so it bypasses that cap (with a higher hard ceiling as a safety net); otherwise
  // a full field would block every delivery and food would never reach the pantry.
  const hard = MAX_FOOD * 2;
  if (foods.length >= hard) return false;
  if (!extra.delivered && foods.length >= MAX_FOOD) return false;
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
  // Food is stored ONLY in the pantry (packed against what's already inside it).
  // Until a pantry is built, it piles at the nest instead.
  const pantry = builtRoom(ant.isRed, 'pantry');
  if (pantry) {
    let anchor = null, bd = pantry.r * pantry.r;   // only food already inside the pantry
    for (const f of foods) {
      if (!f.delivered || f.team !== ant.isRed) continue;
      const d = dist2(f.x, f.y, pantry.x, pantry.y);
      if (d < bd) { bd = d; anchor = f; }
    }
    if (!anchor) return { x: pantry.x, y: pantry.y };
    const ang = Math.atan2(ant.y - anchor.y, ant.x - anchor.x), r = 2 * foodRadius(anchor);
    return { x: anchor.x + Math.cos(ang) * r, y: anchor.y + Math.sin(ang) * r };
  }
  const s = nearestSpawnPoint(ant.isRed, ant.x, ant.y);
  const anchor = nearestColonyDelivered(s, ant.isRed);
  if (!anchor) return nestTarget(s, ant.dropOffset, 4);
  const ang = Math.atan2(ant.y - anchor.y, ant.x - anchor.x), r = 2 * foodRadius(anchor);
  return { x: anchor.x + Math.cos(ang) * r, y: anchor.y + Math.sin(ang) * r };
}

// --- Nest routing: walk the room graph so ants actually reach a deep room -------
function roomById(id) { for (const r of rooms) if (r.id === id) return r; return null; }

// The room an ant is "in": the disc that contains it, else the nearest of its team.
function roomAt(team, x, y) {
  let inside = null, insideD = Infinity, near = null, nearD = Infinity;
  for (const r of rooms) {
    if (r.team !== team) continue;
    const d = dist2(r.x, r.y, x, y);
    if (d < r.r * r.r && d < insideD) { insideD = d; inside = r; }
    if (d < nearD) { nearD = d; near = r; }
  }
  return inside || near;
}

// A steering point that moves `ant` one hop closer to `dest` along the corridors:
// BFS the link graph from the ant's current room, then aim at the doorway leading to
// the next room on the path. Returns dest's own doorway/centre once adjacent, or the
// fallback when already there / no path.
function routeAim(ant, dest, fallback) {
  const cur = roomAt(ant.isRed, ant.x, ant.y);
  if (!cur || cur === dest) return fallback;
  const prev = new Map([[cur.id, null]]);
  const q = [cur];
  while (q.length) {
    const r = q.shift();
    if (r === dest) break;
    for (const id of r.links) if (!prev.has(id)) { prev.set(id, r.id); const nr = roomById(id); if (nr && nr.team === ant.isRed) q.push(nr); }
  }
  if (!prev.has(dest.id)) return fallback;   // graph disconnected — let the caller aim direct
  let step = dest.id;                         // walk back to the first hop out of `cur`
  while (prev.get(step) !== cur.id) step = prev.get(step);
  const next = roomById(step);
  const ang = Math.atan2(next.y - cur.y, next.x - cur.x);
  // Aim a bit past cur's ring toward next, i.e. into the corridor mouth.
  return { x: cur.x + Math.cos(ang) * (cur.r + SOIL_R + 12),
           y: cur.y + Math.sin(ang) * (cur.r + SOIL_R + 12) };
}

// Steer an ant to `room` and, once inside it, to `inner` (a point in that room).
function aimToRoom(ant, room, inner) {
  if (dist2(ant.x, ant.y, room.x, room.y) < room.r * room.r) return inner;   // arrived
  return routeAim(ant, room, inner);
}

// Where a single carrier should steer to bring food home. From outside the sealed
// nest it heads for the entry's outer door; once inside it routes through the
// corridors to the pantry.
function carryHomeAim(ant) {
  const store = builtRoom(ant.isRed, 'pantry');
  // Truly outside the nest (not even in a corridor): make for the entry's outer door.
  if (!inNestZone(ant.x, ant.y)) {
    const entry = builtRoom(ant.isRed, 'entry');
    if (entry) {
      const o = SOIL_R + 12;
      return { x: entry.x + Math.cos(entry.gapAngle) * (entry.r + o),
               y: entry.y + Math.sin(entry.gapAngle) * (entry.r + o) };
    }
  }
  // In the nest zone: route through the corridors to the pantry.
  if (store) return aimToRoom(ant, store, { x: store.x, y: store.y });
  return dropTarget(ant);
}

// Steer an ant OUT of the sealed nest to go foraging: route through the corridors to
// the entry room, then aim through its outer door. Null if there's no entry.
function exitAim(ant) {
  const entry = builtRoom(ant.isRed, 'entry');
  if (!entry) return null;
  const o = SOIL_R + 14;
  const outDoor = { x: entry.x + Math.cos(entry.gapAngle) * (entry.r + o),
                    y: entry.y + Math.sin(entry.gapAngle) * (entry.r + o) };
  if (dist2(ant.x, ant.y, entry.x, entry.y) < entry.r * entry.r) return outDoor;   // in the entry: step out
  return routeAim(ant, entry, outDoor);
}

// Nearest edible food in the colony's own store (the communal larder). Ignores who
// delivered it — a hungry ant may eat from the store even food it carried in — and
// has no range limit, so a starving forager will trek home to the pantry.
function nearestColonyFood(ant) {
  let best = null, bd = Infinity;
  for (const f of foods) {
    if (!f.delivered || f.team !== ant.isRed) continue;
    if (Number.isFinite(f.servings) && f.servings <= 0) continue;
    const d = dist2(f.x, f.y, ant.x, ant.y);
    if (d < bd) { bd = d; best = f; }
  }
  return best;
}

// Same idea for a carcass haul team: aim at the entry door from outside, otherwise
// the pantry (or, with no nest, the spawn point).
function haulHomeAim(team, x, y) {
  if (!insideMyBuiltRoom(team, x, y)) {
    const entry = builtRoom(team, 'entry');
    if (entry) {
      const o = SOIL_R + INSECT_RADIUS + 6;
      return { x: entry.x + Math.cos(entry.gapAngle) * (entry.r + o),
               y: entry.y + Math.sin(entry.gapAngle) * (entry.r + o) };
    }
  }
  const store = builtRoom(team, 'pantry');
  if (store) return { x: store.x, y: store.y };
  const s = nearestSpawnPoint(team, x, y);
  return { x: s.x, y: s.y };
}

// Ants coordinate by scent, not messages: every reaction is a pheromone dropped
// here and read back by whoever passes near (see strongestPheromone). 'trail'
// (the default) marks a food find; 'danger' is laid where a mate was killed and
// drives the flee/rally response.
function layPheromone(x, y, strength = 1, kind = 'trail') {
  if (pheromones.length >= MAX_PHEROMONES) pheromones.shift();
  pheromones.push({ x, y, strength, kind });
}

// Lay (or reinforce) a food trail. Depositing onto a nearby dot strengthens it up to
// TRAIL_MAX instead of littering new ones, so a well-used route builds a bright,
// persistent lane — the classic emergent ant trail.
function layTrail(x, y) {
  const m2 = TRAIL_MERGE * TRAIL_MERGE;
  for (const p of pheromones) {
    if (p.kind === 'trail' && dist2(p.x, p.y, x, y) < m2) {
      p.strength = Math.min(p.strength + TRAIL_START * 0.6, TRAIL_MAX);
      return;
    }
  }
  if (pheromones.length >= MAX_PHEROMONES) pheromones.shift();
  pheromones.push({ x, y, strength: TRAIL_START, kind: 'trail' });
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

