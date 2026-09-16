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
  for (const room of rooms) {
    const spec = ROOM_SPECS[room.type];
    const col = (spec && spec.color) || '#c9a227';
    ctx.beginPath();
    ctx.arc(room.x, room.y, room.r, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(col, room.built ? 0.16 : 0.07);
    ctx.fill();
    ctx.lineWidth = room.breached ? 2.5 : 1.5;
    ctx.setLineDash(room.built ? [] : [4, 4]);
    ctx.strokeStyle = room.breached ? 'rgba(255,60,40,0.9)' : hexToRgba(col, room.built ? 0.9 : 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    if (spec && spec.sym) {   // a symbol at the centre; empty/entry stay unlabelled
      ctx.globalAlpha = room.built ? 1 : 0.7;
      ctx.font = Math.round(room.r * 0.8) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(spec.sym, room.x, room.y + 1);
      ctx.textBaseline = 'alphabetic'; ctx.globalAlpha = 1;
    }
    // Smooth soil walls over the disc.
    strokeWall(room.sites);
    if (room.tunnelSites) strokeWall(room.tunnelSites);
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

// A transient nudge over the map (e.g. "the colony needs a nursery to grow").
function drawCanvasNotice() {
  if (Date.now() >= nurseryNoticeUntil) { noticeBounds = null; return; }
  const msg = 'The colony needs a built nursery to keep growing';
  ctx.save();
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  const pad = 24, closeW = 22;
  const w = ctx.measureText(msg).width + pad + closeW;
  const cx = canvas.width / 2, x = cx - w / 2, y = 16, h = 26;
  ctx.fillStyle = 'rgba(20,20,20,0.8)';
  ctx.strokeStyle = 'rgba(200,111,176,0.9)';
  roundRect(x, y, w, h, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#f2d6ea';
  ctx.fillText(msg, cx - closeW / 2, y + 17);
  // A close (✕) affordance on the right; its rect is stored so a tap can dismiss it.
  ctx.fillStyle = '#e0a8cf';
  ctx.fillText('✕', x + w - closeW / 2, y + 17);
  noticeBounds = { x, y, w, h };   // tap anywhere on the bar to dismiss
  ctx.restore();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
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
  let w = 0;
  for (const p of pheromones) {
    if (!animationPaused) p.strength -= 0.004;
    if (p.strength <= 0) continue;
    pheromones[w++] = p;
    ctx.beginPath();
    const a = Math.min(p.strength, 1) * 0.6;
    // Trails are the familiar yellow; a danger scent glows red so a threatened
    // stretch of the map reads at a glance.
    ctx.fillStyle = p.kind === 'danger' ? `rgba(255,60,40,${a})` : `rgba(255,230,0,${a})`;
    ctx.arc(p.x, p.y, p.kind === 'danger' ? 3 : 2, 0, Math.PI * 2);
    ctx.fill();
  }
  pheromones.length = w;
}

function drawAnt(a) {
  const r = a.isQueen ? 12 : 4;
  ctx.beginPath();
  // Rival colony is a muted jade; poisoned ants of each colony turn an amethyst shade.
  if (a.poisoned) ctx.fillStyle = a.isRed ? '#9f95b5' : '#7d6f9e';
  else            ctx.fillStyle = a.isRed ? '#3cb399' : '#fff0b3';
  ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
  ctx.fill();

  if (a.carrying) {              // the haul rides just ahead of the ant
    ctx.beginPath();
    ctx.fillStyle = getFoodColor(a.carrying.type);
    ctx.arc(a.x + Math.cos(a.angle) * 5, a.y + Math.sin(a.angle) * 5, 2.5, 0, Math.PI * 2);
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
  setBar('happiness-bar',  whiteHappiness, 'lime',    '#c77dff', !!queens.white);
  setBar('antagonist-bar', redHappiness,   '#3cb399', '#7d6f9e', !!queens.red);
}

function updateStats() {
  const el = $('stats');
  if (!el) return;
  const w = countWhiteAnts(), r = countRedAnts();
  const atNest = foods.reduce((n, f) => n + (f.delivered ? 1 : 0), 0);
  el.innerHTML =
    `Total Alive: ${ants.length}<br>` +
    `Yellow Ants: Alive ${w} | Born ${totalBornWhite} | Dead ${totalDeadWhite} (${killedWhite} killed)<br>` +
    `Rival Ants: Alive ${r} | Born ${totalBornRed} | Dead ${totalDeadRed} (${killedRed} killed)<br>` +
    `Food: ${foods.length} (${atNest} at nest) | Happiness: ${Math.round(whiteHappiness)} | Rival: ${Math.round(redHappiness)}`;

  const hud = $('hud-stats');
  if (hud) {
    const wOther = Math.max(0, totalDeadWhite - killedWhite);
    const rOther = Math.max(0, totalDeadRed - killedRed);
    let html = `<span class="yellow">🐜 <b>${w}</b> · born ${matedWhite} · spawned ${spawnedWhite} · killed ${killedWhite} · died ${wOther}</span>`;
    if (r > 0 || totalBornRed > 0) {
      html += `<br><span class="rival">✦ <b>${r}</b> · born ${matedRed} · spawned ${spawnedRed} · killed ${killedRed} · died ${rOther}</span>`;
    }
    hud.innerHTML = html;
  }
  updateBreakdown();
}

// Per-colony figures, to make the source of a happiness gap visible: average
// mood and fullness, how many are hungry / poisoned / hauling, and the size of
// each colony's own store. `main unattacked` shows whether the survival lift is
// currently running (it pauses whenever a main ant is killed).
function updateBreakdown() {
  const el = $('breakdown');
  if (!el) return;
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
  const avg = (s, n) => (n ? Math.round(s / n) : '—');
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

