// ant-farm — canvas drawing, bars & stats
'use strict';

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
function drawEnvironment() {
  for (const o of environment) {
    const r = o.r || 4;
    ctx.beginPath();
    if (o.type === 'wall') {
      ctx.fillStyle = '#888';
      ctx.arc(o.x, o.y, r, 0, Math.PI * 2);
    } else {
      ctx.fillStyle = 'rgba(0,180,255,0.6)';
      ctx.arc(o.x, o.y, r + 2, 0, Math.PI * 2);
    }
    ctx.fill();
  }
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
    ctx.fillStyle = `rgba(255,230,0,${Math.min(p.strength, 1) * 0.6})`;
    ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
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
    `Yellow Ants: Alive ${w} | Born ${totalBornWhite} | Dead ${totalDeadWhite}<br>` +
    `Rival Ants: Alive ${r} | Born ${totalBornRed} | Dead ${totalDeadRed}<br>` +
    `Food: ${foods.length} (${atNest} at nest) | Happiness: ${Math.round(whiteHappiness)} | Rival: ${Math.round(redHappiness)}`;
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

