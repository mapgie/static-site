// ant-farm — canvas drawing, bars & stats
'use strict';

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function drawEnvironment() {
  for (const o of environment) {
    if (o.type === 'soil' && o.room) continue;   // room walls are stroked smoothly in drawRooms
    const r = o.r || 4;
    ctx.beginPath();
    if (o.type === 'wall') {
      ctx.fillStyle = '#888';
      ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
    } else if (o.type === 'soil') {
      ctx.fillStyle = SOIL_COLOR;
      ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
    } else {
      ctx.fillStyle = 'rgba(0,180,255,0.6)';
      ctx.arc(o.x, o.y, r + 2, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

// Stroke the raised (done) blocks of a wall as one smooth line: short segments
// between nearby blocks, thick with round joins, so the wall reads continuous
// rather than as a string of beads.
function strokeWall(sites) {
  const done = [];
  for (const s of sites) if (s.done) done.push(s);
  if (!done.length) return;
  const near = ROOM_SITE_STEP * 1.7, near2 = near * near;
  ctx.beginPath();
  for (let i = 0; i < done.length; i++) {
    for (let j = i + 1; j < done.length; j++) {
      if (dist2(done[i].x, done[i].y, done[j].x, done[j].y) < near2) {
        ctx.moveTo(done[i].x, done[i].y); ctx.lineTo(done[j].x, done[j].y);
      }
    }
  }
  ctx.lineWidth = WALL_DRAW;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = SOIL_COLOR;
  ctx.stroke();
}

// Planned / built nest rooms: a tinted, labelled disc, with the raised walls
// drawn as smooth soil lines over it (a placing ghost is dashed and faint).
function drawRooms() {
  if (!worldBuilding) return;
  ctx.save();
  // The nest exists as a plan from the start, but stays hidden until the colony is
  // large enough to build it (matching buildTaskFor) — so an empty board shows no
  // ghost rooms. A hand-placed room is the player's own doing and always shows.
  const shown = room => room.manual || (room.team ? countRedAnts() : countWhiteAnts()) >= MIN_BUILD_ANTS;
  // Pass 0: a faint "blueprint" line down each planned corridor, shown until BOTH of
  // its rooms are built. Digging a corridor takes a while, and until it lands the two
  // side-walls are just stubs poking out of each room — which reads as unconnected
  // rooms (the very bug this nest is meant to fix). The guide makes the intended link
  // visible from the moment it's planned, so a half-built nest reads as "wiring itself
  // up", not "broken". It disappears once the corridor's solid walls take over.
  const linked = new Set();
  ctx.setLineDash([5, 6]);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(201,138,55,0.28)';
  for (const room of rooms) {
    if (!shown(room)) continue;
    for (const id of room.links) {
      const key = room.id < id ? room.id + '-' + id : id + '-' + room.id;
      if (linked.has(key)) continue;
      linked.add(key);
      const b = rooms.find(r => r.id === id);
      if (!b || (room.built && b.built)) continue;   // finished corridor: the walls speak for it
      ctx.beginPath();
      ctx.moveTo(room.x, room.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
  // Pass 1: room bodies — an opaque dark disc (a hollow room, and it hides trails
  // that would otherwise show through) plus a faint colour tint and the centre
  // symbol. Drawn first, so the soil walls (rings AND corridor side-walls) stroke
  // cleanly OVER every disc in pass 2 and tuck into the rooms they join.
  for (const room of rooms) {
    if (!shown(room)) continue;
    const spec = ROOM_SPECS[room.type];
    const col = (spec && spec.color) || '#c9a227';
    ctx.beginPath();
    ctx.arc(room.x, room.y, room.r, 0, Math.PI * 2);
    ctx.fillStyle = '#080808';
    ctx.fill();
    ctx.fillStyle = hexToRgba(col, room.built ? 0.16 : 0.07);
    ctx.fill();
    if (spec && spec.sym) {   // a symbol at the centre; empty/entry stay unlabelled
      ctx.globalAlpha = room.built ? 1 : 0.7;
      ctx.font = Math.round(room.r * 0.8) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(spec.sym, room.x, room.y + 1);
      ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
    }
  }
  // Pass 2: the soil walls. Corridors are TWO side-walls with a dark walkable
  // channel between them (the black board shows through) — a tunnel an ant threads,
  // not a solid plug. The ring and the corridor walls are the same soil, stroked
  // smoothly, so they read as one continuous nest wall with a doorway at each mouth.
  for (const room of rooms) {
    if (!shown(room)) continue;
    const spec = ROOM_SPECS[room.type];
    const col = (spec && spec.color) || '#c9a227';
    ctx.lineWidth = room.breached ? 2.5 : 1.5;
    ctx.setLineDash(room.built ? [] : [4, 4]);
    ctx.strokeStyle = room.breached ? 'rgba(255,60,40,0.9)' : hexToRgba(col, room.built ? 0.9 : 0.5);
    ctx.beginPath();
    ctx.arc(room.x, room.y, room.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    strokeWall(room.sites);              // the ring's raised soil
    strokeWall(room.tunnelSites || []);  // the corridor side-walls out to linked rooms
    if (room.barricadeSites) strokeWall(room.barricadeSites);
  }
  // A room the player is dragging into place: dashed ghost, red if it overlaps.
  if (placingRoom) {
    const spec = ROOM_SPECS[placingRoom.type];
    const overlaps = placementBlocked(false, placingRoom.x, placingRoom.y, spec.r);
    const orphan = rooms.some(r => r.team === false) &&
                   !nearestConnectable(false, placingRoom.type, placingRoom.x, placingRoom.y);
    const bad = overlaps || orphan;
    ctx.beginPath();
    ctx.arc(placingRoom.x, placingRoom.y, spec.r, 0, Math.PI * 2);
    ctx.fillStyle = bad ? 'rgba(255,60,40,0.12)' : hexToRgba(spec.color, 0.12);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = bad ? 'rgba(255,60,40,0.95)' : hexToRgba(spec.color, 0.95);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = bad ? 'rgba(255,120,110,1)' : hexToRgba(spec.color, 1);
    ctx.font = '11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const tag = overlaps ? 'overlaps' : orphan ? 'no link' : (spec.sym || placingRoom.type);
    ctx.fillText(tag, placingRoom.x, placingRoom.y + 4);
  }
  ctx.restore();
}

// Eggs waiting to hatch in a nursery: small pale ovals.
function drawEggs() {
  if (!eggs.length) return;
  ctx.save();
  ctx.fillStyle = 'rgba(255,250,230,0.9)';
  ctx.strokeStyle = 'rgba(120,110,90,0.6)';
  for (const e of eggs) {
    ctx.beginPath();
    ctx.ellipse(e.x, e.y, EGG_R, EGG_R * 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function hexToRgba(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function getFoodColor(type) {
  switch (type) {
    case 'protein': return '#ef9a9a';
    case 'spoiled': return '#3d5afe';
    case 'poison':  return '#b040ff';
    case 'fruit':   return '#ff8c00';
    case 'insect':  return '#8d6e63';
    default:        return '#f5f5f5';
  }
}

// In the maintenance view only real points are drawn (the centre fallback
// can't be dragged) and the selected one is highlighted.
function drawSpawnPoints(editing = false) {
  ctx.save();
  for (const isRed of [false, true]) {
    const rgb = isRed ? '60,179,153' : '255,240,179';   // rival ring matches the jade ants
    const list = editing ? spawnPoints[colonyKey(isRed)] : colonySpawnPoints(isRed);
    for (const s of list) {
      const sel = editing && s === selectedPoint;
      ctx.lineWidth = sel ? 2 : 1;
      ctx.setLineDash(sel ? [] : [4, 4]);
      ctx.strokeStyle = `rgba(${rgb},${sel ? 0.9 : editing ? 0.6 : 0.35})`;
      ctx.fillStyle = `rgba(${rgb},${sel ? 0.12 : editing ? 0.06 : 0})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.fillStyle = `rgba(${rgb},0.12)`;
      ctx.strokeStyle = `rgba(${rgb},0.8)`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, nestCore(s), 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawMaintenanceBanner() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, canvas.height - 22, canvas.width, 22);
  ctx.fillStyle = '#ccc';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const n = spawnPoints.yellow.length + spawnPoints.red.length;
  ctx.fillText(n ? 'Spawn point maintenance: drag to move, click to select, then resize or delete.' : 'Spawn point maintenance: no points yet, add one from the panel.', 10, canvas.height - 11);
  ctx.restore();
}

function drawFoods() {
  for (const f of foods) {
    const r = foodRadius(f);
    ctx.beginPath();
    ctx.fillStyle = getFoodColor(f.type);
    if (f.type === 'insect') {
      ctx.ellipse(f.x, f.y, r, r * 0.55, f.heading || 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#d7ccc8';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (!f.delivered && f.haulers.length && f.haulers.length < INSECT_HAULERS) {   // still short-handed
        ctx.fillStyle = '#eee';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${f.haulers.length}/${INSECT_HAULERS}`, f.x, f.y - r - 4);
      }
    } else {
      ctx.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx.fill();
      if (!f.delivered && f.units > 1) {   // a pile that will take several trips
        ctx.fillStyle = '#333';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(f.units, f.x, f.y);
      }
    }
    if (f.delivered) {           // ready to eat
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(255,240,179,0.6)';
      ctx.lineWidth = 1;
      ctx.arc(f.x, f.y, r + 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

function drawPheromones() {
  for (const p of pheromones) {
    if (p.strength <= 0) continue;
    const danger = p.kind === 'danger';
    ctx.beginPath();
    // A busy lane reads brighter and a touch fatter than a lone wandering mark, so
    // the trail stands out; a danger scent glows red.
    if (danger) {
      ctx.fillStyle = `rgba(255,60,40,${Math.min(p.strength, 1) * 0.6})`;
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    } else {
      const s = Math.min(p.strength / TRAIL_MAX, 1);      // 0..1 lane intensity
      ctx.fillStyle = `rgba(255,${210 - Math.round(s * 60)},0,${0.18 + s * 0.62})`;
      ctx.arc(p.x, p.y, 1.8 + s * 2.2, 0, Math.PI * 2);
    }
    ctx.fill();
  }
}

function drawAnt(a) {
  const r = a.isQueen ? 12 : 3.5;
  ctx.beginPath();
  // Rival colony is a muted jade; poisoned ants of each colony turn an amethyst shade.
  if (a.poisoned) ctx.fillStyle = a.isRed ? '#9f95b5' : '#7d6f9e';
  else            ctx.fillStyle = a.isRed ? '#3cb399' : '#fff0b3';
  ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
  ctx.fill();

  if (a.carrying) {              // the haul rides just ahead of the ant
    ctx.beginPath();
    ctx.fillStyle = getFoodColor(a.carrying.type);
    ctx.arc(a.x + Math.cos(a.angle) * 3, a.y + Math.sin(a.angle) * 3, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }

  if (a.isQueen) {
    ctx.beginPath();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 2;
    ctx.arc(a.x, a.y, r + 3, 0, Math.PI * 2);
    ctx.stroke();
  } else if (a.slowed > 0) {
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(61,90,254,0.9)';
    ctx.lineWidth = 1.5;
    ctx.arc(a.x, a.y, r + 2, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function setBar(id, value, happyColor, queenColor, hasQueen) {
  const bar = $(id);
  if (!bar) return;
  bar.style.width = `${value}%`;
  let c = happyColor;
  if (value < 25) c = 'red';
  else if (value < 50) c = 'orange';
  else if (value >= 75 && hasQueen) c = queenColor;
  bar.style.background = c;
}

function updateHappinessBars() {
  // Happiness is a colony reading, so an empty colony shows an empty bar rather
  // than the neutral 50 the mood defaults to.
  const w = countWhiteAnts() > 0 ? whiteHappiness : 0;
  const r = countRedAnts()   > 0 ? redHappiness   : 0;
  setBar('happiness-bar',  w, 'lime',    '#c77dff', !!queens.white);
  setBar('antagonist-bar', r, '#3cb399', '#7d6f9e', !!queens.red);
}

// Per-colony tallies, gathered once and shared by the summary, the on-canvas HUD
// and the detailed breakdown.
function colonyStats() {
  const g = () => ({ n: 0, h: 0, f: 0, hungry: 0, pois: 0, carry: 0 });
  const w = g(), r = g();
  for (const a of ants) {
    const c = a.isRed ? r : w;
    c.n++; c.h += a.happiness; c.f += a.fullness;
    if (a.fullness < a.hungerPoint) c.hungry++;
    if (a.poisoned) c.pois++;
    if (a.carrying) c.carry++;
  }
  let wStore = 0, rStore = 0;
  for (const f of foods) if (f.delivered) { if (f.team) rStore++; else wStore++; }
  return { w, r, wStore, rStore };
}

// A face for the colony's mood at a glance.
function moodFace(h) { return h >= 66 ? '😀' : h >= 40 ? '🙂' : '😣'; }

// The compact, emoji summary shared by the on-canvas HUD and the side panel's
// always-visible top line: count + mood per colony, hungry when it matters, and
// the food on the board.
function statsSummaryHTML(s) {
  const wm = s.w.n > 0 ? Math.round(whiteHappiness) : null;
  const rm = s.r.n > 0 ? Math.round(redHappiness)   : null;
  const line = (cls, sym, c, mood) => {
    let t = `<span class="${cls}">${sym} <b>${c.n}</b>`;
    if (mood !== null) t += ` · ${moodFace(mood)} ${mood}`;
    if (c.hungry > 0) t += ` · 🍽 ${c.hungry}`;
    return t + '</span>';
  };
  let html = line('yellow', '🐜', s.w, wm);
  if (s.r.n > 0 || totalBornRed > 0) html += '<br>' + line('rival', '✦', s.r, rm);
  const atNest = s.wStore + s.rStore;
  html += `<br><span class="food">🍎 ${foods.length}${atNest ? ` · 🏠 ${atNest}` : ''}</span>`;
  return html;
}

function updateStats() {
  const s = colonyStats();
  const summary = statsSummaryHTML(s);
  const hud = $('hud-stats');
  if (hud) hud.innerHTML = summary;
  const sum = $('stats-summary');
  if (sum) sum.innerHTML = summary;

  const el = $('stats');
  if (el) {
    const w = s.w.n, r = s.r.n;
    const atNest = s.wStore + s.rStore;
    el.innerHTML =
      `Total Alive: ${ants.length}<br>` +
      `Yellow Ants: Alive ${w} | Born ${totalBornWhite} | Dead ${totalDeadWhite} (${killedWhite} killed)<br>` +
      `Rival Ants: Alive ${r} | Born ${totalBornRed} | Dead ${totalDeadRed} (${killedRed} killed)<br>` +
      `Food: ${foods.length} (${atNest} at nest) | Happiness: ${w > 0 ? Math.round(whiteHappiness) : '—'} | Rival: ${r > 0 ? Math.round(redHappiness) : '—'}`;
  }
  updateBreakdown(s);
}

// Per-colony figures, to make the source of a happiness gap visible: average
// mood and fullness, how many are hungry / poisoned / hauling, and the size of
// each colony's own store. `main unattacked` shows whether the survival lift is
// currently running (it pauses whenever a main ant is killed).
function updateBreakdown(s = colonyStats()) {
  const el = $('breakdown');
  if (!el) return;
  const { w, r, wStore, rStore } = s;
  const avg = (sum, n) => (n ? Math.round(sum / n) : '—');
  const block = (label, c, store, queen) =>
    `<b>${label}</b>${queen ? ' + queen' : ''}<br>` +
    `ants ${c.n} · mood ${avg(c.h, c.n)} · full ${avg(c.f, c.n)}<br>` +
    `hungry ${c.hungry} · sick ${c.pois} · hauling ${c.carry} · stored ${store}`;
  const calm = Math.round(whiteCalmMs / 1000);
  el.innerHTML =
    block('Main', w, wStore, queens.white) + '<br>' +
    block('Rival', r, rStore, queens.red) + '<br>' +
    `<span class="hint">main unattacked ${calm}s ${whiteCalmMs > TUNE.ATTACK_CALM_S * 1000 ? '· mood rising' : '· under attack'}</span>`;
}

