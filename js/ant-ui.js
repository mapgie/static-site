// ant-farm — bootstrap, controls, tuning & maintenance view
'use strict';

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
window.addEventListener('DOMContentLoaded', () => {
  canvas = $('antCanvas');
  ctx    = canvas.getContext('2d');
  // On phones the controls start as a closed drawer so the map gets the full
  // width; on wider screens they sit inline and this class is a no-op.
  if (window.matchMedia('(max-width: 767px)').matches) {
    document.querySelector('main').classList.add('controls-hidden');
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  readSettingsFromControls();
  loadFarm();
  setupUI();
  buildTuning();
  $('tuning-reset').addEventListener('click', () => { TUNE = { ...TUNE_DEFAULTS }; buildTuning(); saveFarm(); });
  setupConfigUI();
  setupCollapsibleCards();
  updateStats();
  requestAnimationFrame(animate);
});

// Live balance knobs, grouped: [key, label, min, max, step]. A '*' in the label
// marks a value that only takes effect on newly born ants.
const TUNABLES = [
  ['Happiness · gains', [
    ['H_EAT', 'Eat', 0, 20, 0.5],
    ['H_GOOD_FOOD', 'Good-food bonus', 0, 20, 0.5],
    ['H_MATE', 'Mate', 0, 30, 0.5],
    ['H_DELIVER', 'Deliver food', 0, 20, 0.5],
    ['H_SATIATED', 'Well-fed /s', 0, 10, 0.1],
    ['H_SURVIVE', 'Survive /s (main)', 0, 10, 0.1],
    ['H_ATTACK', 'Kill (rival)', 0, 20, 0.5],
    ['RED_FACTOR', 'Rival gain factor', 0, 1.5, 0.05],
    ['ATTACK_CALM_S', 'Calm before survive (s)', 1, 30, 1],
  ]],
  ['Happiness · losses', [
    ['HAPPINESS_DECAY', 'Decay /s', 0, 5, 0.1],
    ['H_POISON_HIT', 'Get poisoned', 0, 30, 0.5],
    ['H_POISON_DECAY', 'Poisoned /s', 0, 5, 0.1],
    ['H_ALLY_LOST', 'Ally killed', 0, 30, 0.5],
    ['WITNESS_RADIUS', 'Witness radius', 0, 200, 5],
  ]],
  ['Sadist-only losses', [
    ['H_QUEEN_LEFT', 'Queen leaves', 0, 30, 0.5],
    ['H_WET', 'Wet /s', 0, 10, 0.1],
    ['H_SLOW', 'Slowed /s', 0, 10, 0.1],
  ]],
  ['Fullness · hunger', [
    ['FULLNESS_DECAY', 'Fullness decay /s', 0, 10, 0.1],
    ['FULLNESS_MEAL', 'Meal refill', 0, 100, 1],
    ['FULLNESS_FEAST', 'Insect refill', 0, 100, 1],
    ['SATIATED_LEVEL', 'Well-fed level', 0, 100, 1],
    ['HUNGER_MIN', 'Hunger point min *', 0, 100, 1],
    ['HUNGER_MAX', 'Hunger point max *', 0, 100, 1],
  ]],
  ['New-ant seed *', [
    ['HAPPINESS_START', 'Start mood', 0, 100, 1],
    ['HAPPINESS_JITTER', 'Mood jitter', 0, 50, 1],
    ['FULLNESS_START', 'Start fullness', 0, 100, 1],
    ['FULLNESS_JITTER', 'Fullness jitter', 0, 50, 1],
    ['TEMPERAMENT_SPREAD', 'Temperament spread', 0, 1, 0.05],
  ]],
  ['Breeding · queens', [
    ['MATE_CHANCE', 'Mate chance', 0, 1, 0.01],
    ['CROWD_MATE_STEP', 'Crowd penalty /ant', 0, 0.2, 0.005],
    ['CROWD_MATE_FLOOR', 'Crowd floor', 0, 1, 0.05],
    ['QUEEN_HIGH', 'Queen arrives ≥', 50, 100, 1],
    ['QUEEN_LOW', 'Queen leaves <', 0, 60, 1],
    ['SADIST_SPAWN', 'Sadist queen <', 0, 60, 1],
    ['SADIST_LEAVE', 'Sadist queen leaves >', 0, 100, 1],
  ]],
];

function buildTuning() {
  const host = $('tuning');
  if (!host) return;
  host.innerHTML = '';
  for (const [group, params] of TUNABLES) {
    const g = document.createElement('div');
    g.className = 'tune-group';
    g.textContent = group;
    host.appendChild(g);
    for (const [key, label, min, max, step] of params) {
      const row = document.createElement('div');
      row.className = 'tune-row';
      const head = document.createElement('div');
      head.className = 'tune-head';
      const name = document.createElement('span'); name.textContent = label;
      const val = document.createElement('span'); val.className = 'tune-val'; val.textContent = TUNE[key];
      head.append(name, val);
      const input = document.createElement('input');
      input.type = 'range';
      input.min = min; input.max = max; input.step = step; input.value = TUNE[key];
      input.addEventListener('input', () => { TUNE[key] = +input.value; val.textContent = input.value; saveFarm(); });
      row.append(head, input);
      host.appendChild(row);
    }
  }
}

// Each control card's heading folds its card away, so the growing dashboard
// stays manageable. The open/closed choice is remembered per card.
function setupCollapsibleCards() {
  const sections = document.querySelectorAll('.controls-parent > .controls-section');
  sections.forEach((sec, idx) => {
    if (sec.id === 'spawn-panel' || sec.id === 'stats') return;   // a modal view and a live readout, left alone
    const head = sec.querySelector(':scope > h1, :scope > h2');
    if (!head) return;
    head.classList.add('card-toggle');
    head.setAttribute('role', 'button');
    head.setAttribute('tabindex', '0');
    const key = 'antfarm-collapsed-' + (head.textContent.trim() || idx);
    const apply = collapsed => {
      sec.classList.toggle('collapsed', collapsed);
      head.setAttribute('aria-expanded', String(!collapsed));
      try { localStorage.setItem(key, collapsed ? '1' : '0'); } catch (e) { /* private mode */ }
    };
    let start = sec.dataset.collapsed === 'true';   // a card may opt to start folded
    try { const v = localStorage.getItem(key); if (v !== null) start = v === '1'; } catch (e) { /* private mode */ }
    apply(start);
    const toggle = () => apply(!sec.classList.contains('collapsed'));
    head.addEventListener('click', toggle);
    head.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });
  });
}

// Open or close the controls drawer (small screens) and keep the toggle's
// glyph and labels in step. On wide screens the panel shows regardless.
function setControlsHidden(hidden) {
  document.querySelector('main').classList.toggle('controls-hidden', hidden);
  const btn = $('toggle-controls');
  if (btn) {
    btn.textContent = hidden ? '☰' : '✕';   // ☰ / ✕
    btn.setAttribute('aria-expanded', String(!hidden));
    const label = hidden ? 'Show controls' : 'Hide controls';
    btn.title = label;
    btn.setAttribute('aria-label', label);
  }
  resizeCanvas();
}

function resizeCanvas() {
  const container = canvas.parentElement;
  const cs = getComputedStyle(container);
  const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
  const padY = parseFloat(cs.paddingTop)  + parseFloat(cs.paddingBottom);
  const headerH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--header-h')) || 80;
  const borderX = canvas.offsetWidth  - canvas.clientWidth;   // canvas border, so the
  const borderY = canvas.offsetHeight - canvas.clientHeight;  // bitmap is never scaled
  const width  = clamp(Math.floor(container.clientWidth - padX - borderX), 160, 1000);
  const height = clamp(Math.floor(window.innerHeight - headerH - padY - borderY), 240, 900);
  if (canvas.width === width && canvas.height === height) return;
  canvas.width  = width;
  canvas.height = height;
  // keep everything on the board
  for (const a of ants) { a.x = clamp(a.x, 0, width); a.y = clamp(a.y, 0, height); }
  for (const q of [queens.white, queens.red]) if (q) { q.x = clamp(q.x, 0, width); q.y = clamp(q.y, 0, height); }
  for (const list of [spawnPoints.yellow, spawnPoints.red]) {
    for (const s of list) { s.x = clamp(s.x, 0, width); s.y = clamp(s.y, 0, height); }
  }
}

function readSettingsFromControls() {
  matingSpeed        = 10000 - (+$('mating-slider').value) * 90;
  normalAntLifespan  = (+$('lifespan-slider-normal').value) * 1000;
  redAntLifespan     = (+$('lifespan-slider-red').value) * 1000;
  normalAntSpeed     = (+$('speed-slider-normal').value) / 100;
  redAntSpeed        = (+$('speed-slider-red').value) / 100;
  allowRedBreeding   = $('allow-red-breeding').checked;
  sadistMode         = $('sadist-mode').checked;
  redAggressionLevel = +$('red-aggression-slider').value;
  penWidth           = +$('thickness-slider').value;
  foodDecayRate      = +$('decay-slider').value;
  showSpawnPoints    = $('show-spawn-points').checked;
  if ($('auto-food')) autoFood = $('auto-food').checked;
  updateReadouts();
}

function updateReadouts() {
  const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };
  set('decay-readout',        `~${Math.round(decayStageMs() / 1000)}s per stage`);
  set('speed-readout-normal', normalAntSpeed.toFixed(2));
  set('speed-readout-red',    redAntSpeed.toFixed(2));
}

function writeSettingsToControls() {
  $('mating-slider').value          = Math.round((10000 - matingSpeed) / 90);
  $('lifespan-slider-normal').value = Math.round(normalAntLifespan / 1000);
  $('lifespan-slider-red').value    = Math.round(redAntLifespan / 1000);
  $('speed-slider-normal').value    = Math.round(normalAntSpeed * 100);
  $('speed-slider-red').value       = Math.round(redAntSpeed * 100);
  $('allow-red-breeding').checked   = allowRedBreeding;
  $('sadist-mode').checked          = sadistMode;
  $('red-aggression-slider').value  = redAggressionLevel;
  $('thickness-slider').value       = penWidth;
  $('decay-slider').value           = foodDecayRate;
  $('show-spawn-points').checked    = showSpawnPoints;
  if ($('auto-food')) $('auto-food').checked = autoFood;
  updateReadouts();
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
function setupUI() {
  const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);

  on('thickness-slider', 'input', e => { penWidth = +e.target.value; });

  // Food effects are a spoiler: hidden until the player asks
  on('food-info', 'click', e => {
    const open = $('food-legend').classList.toggle('revealed');
    e.currentTarget.setAttribute('aria-expanded', String(open));
    e.currentTarget.title = open ? 'Hide what each food does' : 'Reveal what each food does (spoiler)';
  });

  on('add-ant', 'click', () => {
    if (countWhiteAnts() < MAX_WHITE_ANTS) {
      ants.push(createAntAtSpawn(false));
      totalBornWhite++;
      updateStats(); saveFarm();
    }
  });
  on('add-red-ant', 'click', () => {
    if (countRedAnts() < MAX_RED_ANTS) {
      ants.push(createAntAtSpawn(true));
      totalBornRed++;
      updateStats(); saveFarm();
    }
  });
  on('kill-all-ants', 'click', () => {
    totalDeadWhite += countWhiteAnts();
    totalDeadRed   += countRedAnts();
    ants = [];
    queens.white = queens.red = null;
    pruneHaulers();
    updateStats(); saveFarm();
  });
  on('kill-red-ants', 'click', () => {
    totalDeadRed += countRedAnts();
    ants = ants.filter(a => !a.isRed);
    queens.red = null;
    pruneHaulers();
    updateStats(); saveFarm();
  });
  // Spawn point maintenance view
  on('spawn-maintenance', 'click', enterMaintenance);
  on('spawn-done',        'click', exitMaintenance);
  on('spawn-add-yellow',  'click', () => addPointFromPanel(false));
  on('spawn-add-red',     'click', () => addPointFromPanel(true));
  on('spawn-delete',      'click', deleteSelectedPoint);
  on('spawn-delete-all',  'click', () => { spawnPoints = { yellow: [], red: [] }; selectPoint(null); saveFarm(); });
  on('spawn-size-slider', 'input',  e => { if (selectedPoint) selectedPoint.r = +e.target.value; });
  on('spawn-size-slider', 'change', () => saveFarm());
  on('show-spawn-points', 'change', e => { showSpawnPoints = e.target.checked; saveFarm(); });
  document.addEventListener('keydown', e => {
    if (!maintenance) return;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (e.key === 'Escape') exitMaintenance();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPoint && !typing) { e.preventDefault(); deleteSelectedPoint(); }
  });

  on('destroy-world', 'click', () => {
    ants = []; foods = []; pheromones = []; environment = []; environmentHistory = [];
    queens.white = queens.red = null;
    spawnPoints = { yellow: [], red: [] };
    whiteHappiness = redHappiness = 50; whiteCalmMs = 0;
    totalBornWhite = totalDeadWhite = totalBornRed = totalDeadRed = 0;
    markEnvDirty();
    updateStats(); saveFarm();
  });

  on('toggle-controls', 'click', () => {
    setControlsHidden(!document.querySelector('main').classList.contains('controls-hidden'));
  });
  on('controls-backdrop', 'click', () => setControlsHidden(true));

  on('pause-resume', 'click', e => {
    animationPaused = !animationPaused;
    e.target.textContent = animationPaused ? 'Resume' : 'Pause';
  });

  on('allow-red-breeding', 'change', e => { allowRedBreeding = e.target.checked; saveFarm(); });
  on('sadist-mode', 'change', e => { sadistMode = e.target.checked; saveFarm(); });
  on('mating-slider', 'input', e => { matingSpeed = 10000 - (+e.target.value) * 90; saveFarm(); });
  on('lifespan-slider-normal', 'input', e => { normalAntLifespan = (+e.target.value) * 1000; saveFarm(); });
  on('lifespan-slider-red', 'input', e => { redAntLifespan = (+e.target.value) * 1000; saveFarm(); });
  on('speed-slider-normal', 'input', e => { normalAntSpeed = (+e.target.value) / 100; updateReadouts(); saveFarm(); });
  on('speed-slider-red',    'input', e => { redAntSpeed    = (+e.target.value) / 100; updateReadouts(); saveFarm(); });
  on('red-aggression-slider', 'input', e => { redAggressionLevel = +e.target.value; saveFarm(); });
  on('decay-slider', 'input', e => { foodDecayRate = +e.target.value; updateReadouts(); saveFarm(); });
  on('auto-food', 'change', e => { autoFood = e.target.checked; saveFarm(); });

  on('undoStructure', 'click', () => {
    if (environmentHistory.length) {
      environment = environmentHistory.pop();
      markEnvDirty(); saveFarm();
    }
  });
  on('delete-structures', 'click', () => {
    environment = []; environmentHistory = [];
    markEnvDirty(); saveFarm();
  });

  // Single click with no tool selected drops one piece of food
  canvas.addEventListener('click', e => {
    if (maintenance || $('environment-tool').value !== 'none') return;
    const { x, y } = getCanvasCoords(e);
    if (addFood(x, y, $('food-type').value)) saveFarm();
  });

  // Drag to draw
  const startDraw = e => { if (maintenance) return maintPointerDown(e); lastX = lastY = lastFoodX = lastFoodY = null; handleDraw(e); };
  const endDraw   = () => { if (maintenance) return maintPointerUp(); lastX = lastY = lastFoodX = lastFoodY = null; };

  canvas.addEventListener('mousedown', e => {
    if (e.button !== 0) return;
    startDraw(e);
    canvas.addEventListener('mousemove', handleDraw);
  });
  ['mouseup', 'mouseleave'].forEach(evt => canvas.addEventListener(evt, () => {
    endDraw();
    canvas.removeEventListener('mousemove', handleDraw);
  }));
  canvas.addEventListener('touchstart', e => {
    startDraw(e);
    canvas.addEventListener('touchmove', handleDraw, { passive: false });
  }, { passive: false });
  ['touchend', 'touchcancel'].forEach(evt => canvas.addEventListener(evt, () => {
    endDraw();
    canvas.removeEventListener('touchmove', handleDraw);
  }));
}

function handleDraw(e) {
  if (maintenance) return maintPointerMove(e);
  const tool = $('environment-tool').value;
  if (tool === 'none') return;      // let the click handler place single food
  e.preventDefault();

  const { x, y } = getCanvasCoords(e);
  const foodType = $('food-type').value;

  if (lastX === null) {
    if (tool !== 'food') snapshotEnvironment();
    lastX = x; lastY = y;
  }

  interpolate(lastX, lastY, x, y, (ix, iy) => {
    if (tool === 'wall' || tool === 'water') {
      environment.push({ x: ix, y: iy, type: tool, r: penWidth });
    } else if (tool === 'food') {
      // Every food scatters with its own spacing so a dragged line is spaced
      // drops, not a solid pile: sugar close, fruit wider, protein wider still,
      // and a dead insect (Infinity) only once per press.
      const spacing = FOOD_SPACING[foodType] ?? 22;
      if (lastFoodX === null || dist2(ix, iy, lastFoodX, lastFoodY) >= spacing * spacing) {
        if (addFood(ix, iy, foodType)) { lastFoodX = ix; lastFoodY = iy; }
      }
    } else if (tool === 'bulldozer') {
      const r2 = (penWidth + 4) * (penWidth + 4);
      environment = environment.filter(o => dist2(o.x, o.y, ix, iy) > r2);
      foods       = foods.filter(f => dist2(f.x, f.y, ix, iy) > r2);
    }
  });
  if (tool !== 'food') markEnvDirty();

  lastX = x; lastY = y;
  saveFarm();
}

// ---------------------------------------------------------------------------
// Spawn point maintenance view
// ---------------------------------------------------------------------------
function enterMaintenance() {
  if (maintenance) return;
  maintenance = true;
  pausedBeforeMaint = animationPaused;
  setPaused(true);
  document.querySelector('main').classList.add('spawn-mode');
  $('spawn-panel').hidden = false;
  selectPoint(null);
}

function exitMaintenance() {
  if (!maintenance) return;
  maintenance = false;
  dragPoint = null;
  canvas.classList.remove('grabbing');
  setPaused(pausedBeforeMaint);
  document.querySelector('main').classList.remove('spawn-mode');
  $('spawn-panel').hidden = true;
  selectPoint(null);
  saveFarm();
}

function setPaused(p) {
  animationPaused = p;
  const b = $('pause-resume');
  if (b) b.textContent = p ? 'Resume' : 'Pause';
}

function selectPoint(s) {
  selectedPoint = s;
  const label = $('spawn-selected-label'), slider = $('spawn-size-slider'), del = $('spawn-delete');
  if (!label) return;
  if (s) {
    const list = spawnPoints[pointIsRed(s) ? 'red' : 'yellow'];
    label.textContent = `${pointIsRed(s) ? 'Rival ant' : 'Ant'} point ${list.indexOf(s) + 1} of ${list.length}`;
    slider.disabled = false; slider.value = s.r;
    del.disabled = false;
  } else {
    label.textContent = 'Nothing selected. Click a point on the map.';
    slider.disabled = true;
    del.disabled = true;
  }
}

function addPointFromPanel(isRed) {
  // New points land near the middle, nudged so a run of adds doesn't stack.
  const jitter = () => (Math.random() - 0.5) * 80;
  const s = addSpawnPoint(isRed, canvas.width / 2 + jitter(), canvas.height / 2 + jitter());
  selectPoint(s);
  saveFarm();
}

function deleteSelectedPoint() {
  if (!selectedPoint) return;
  removeSpawnPoint(selectedPoint);
  selectPoint(null);
  saveFarm();
}

function pointAt(x, y) {
  let best = null, bd = Infinity;
  for (const k of ['yellow', 'red']) {
    for (const s of spawnPoints[k]) {
      const d = dist2(s.x, s.y, x, y);
      if (d < s.r * s.r && d < bd) { bd = d; best = s; }
    }
  }
  return best;
}

function maintPointerDown(e) {
  const { x, y } = getCanvasCoords(e);
  const s = pointAt(x, y);
  selectPoint(s);
  dragPoint = s;
  if (s) { e.preventDefault(); canvas.classList.add('grabbing'); }
}

function maintPointerMove(e) {
  if (!dragPoint) return;
  e.preventDefault();
  const { x, y } = getCanvasCoords(e);
  dragPoint.x = clamp(x, 0, canvas.width);
  dragPoint.y = clamp(y, 0, canvas.height);
}

function maintPointerUp() {
  if (dragPoint) { dragPoint = null; saveFarm(); }
  canvas.classList.remove('grabbing');
}

