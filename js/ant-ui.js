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
  setupTuningInfo();
  setupConfigUI();
  setupCollapsibleCards();
  updateStats();
  requestAnimationFrame(animate);
});

// Live balance knobs, grouped: [key, label, min, max, step]. A '*' in the label
// marks a value that only takes effect on newly born ants.
// [key, label, min, max, step, description]. The description shows as a tooltip on
// the slider. A "*" in a label means the value is stamped on an ant when it's born,
// so a change only affects ants spawned afterwards, not the ones already alive.
const TUNABLES = [
  ['Happiness · gains', [
    ['H_EAT', 'Eat', 0, 20, 0.5, 'Happiness gained each time an ant eats a serving of food.'],
    ['H_GOOD_FOOD', 'Good-food bonus', 0, 20, 0.5, 'Extra happiness on top of Eat when the meal is protein or an insect (richer food, bigger lift).'],
    ['H_MATE', 'Mate', 0, 30, 0.5, 'Happiness both partners gain when they successfully mate.'],
    ['H_SATIATED', 'Well-fed /s', 0, 10, 0.1, 'Happiness gained per second while an ant\'s fullness is above the Well-fed level.'],
    ['H_SURVIVE', 'Survive /s (main)', 0, 10, 0.1, 'Happiness the MAIN colony gains each second it goes un-attacked (only after the calm delay below).'],
    ['H_ATTACK', 'Kill (rival)', 0, 20, 0.5, 'Happiness a RIVAL ant gains for killing a main-colony ant (rivals thrive on kills, not food security).'],
    ['RED_FACTOR', 'Rival gain factor', 0, 1.5, 0.05, 'Multiplier on ALL happiness gains for rival ants — below 1 makes rivals harder to keep content than the main colony.'],
    ['ATTACK_CALM_S', 'Calm before survive (s)', 1, 30, 1, 'Seconds the main colony must go un-attacked before the "Survive /s" happiness starts building.'],
  ]],
  ['Happiness · losses', [
    ['HAPPINESS_DECAY', 'Decay /s', 0, 5, 0.1, 'Baseline happiness lost every second — mood always drifts down unless something lifts it.'],
    ['H_POISON_HIT', 'Get poisoned', 0, 30, 0.5, 'One-time happiness hit the moment an ant becomes poisoned.'],
    ['H_POISON_DECAY', 'Poisoned /s', 0, 5, 0.1, 'Extra happiness lost each second an ant stays poisoned (on top of normal decay).'],
    ['H_ALLY_LOST', 'Ally killed', 0, 30, 0.5, 'Happiness lost by nearby colony-mates when one of them is killed (grief).'],
    ['WITNESS_RADIUS', 'Witness radius', 0, 200, 5, 'How close an ant must be to a death to feel the "Ally killed" grief.'],
  ]],
  ['Sadist-only losses', [
    ['H_QUEEN_LEFT', 'Queen leaves', 0, 30, 0.5, 'Happiness hit when a queen departs. Only applies in Sadist mode.'],
    ['H_WET', 'Wet /s', 0, 10, 0.1, 'Happiness lost per second while an ant is in water. Only applies in Sadist mode.'],
    ['H_SLOW', 'Slowed /s', 0, 10, 0.1, 'Happiness lost per second while an ant is slowed (by spoiled food). Only applies in Sadist mode.'],
  ]],
  ['Fullness · hunger', [
    ['FULLNESS_DECAY', 'Fullness decay /s', 0, 10, 0.1, 'How fast fullness drops (hunger builds) each second. Reach 0 and the ant starts to starve.'],
    ['FULLNESS_MEAL', 'Meal refill', 0, 100, 1, 'Fullness restored by eating one ordinary serving (sugar/fruit/protein).'],
    ['FULLNESS_FEAST', 'Insect refill', 0, 100, 1, 'Fullness restored by an insect meal — a bigger feast than an ordinary serving.'],
    ['SATIATED_LEVEL', 'Well-fed level', 0, 100, 1, 'Fullness above which an ant counts as "well-fed" and earns the Well-fed /s happiness.'],
    ['HUNGER_MIN', 'Hunger point min *', 0, 100, 1, 'Each ant gets a random hunger threshold in the min–max band; below it, it stops other tasks and looks for food. * set at birth.'],
    ['HUNGER_MAX', 'Hunger point max *', 0, 100, 1, 'Top of the random hunger-threshold band (see min). Higher = ants get "hungry" sooner. * set at birth.'],
  ]],
  ['New-ant seed *', [
    ['HAPPINESS_START', 'Start mood', 0, 100, 1, 'Happiness a newly born/spawned ant starts with.'],
    ['HAPPINESS_JITTER', 'Mood jitter', 0, 50, 1, 'Random ± spread on the starting mood, so new ants aren\'t identical.'],
    ['FULLNESS_START', 'Start fullness', 0, 100, 1, 'Fullness a newly born/spawned ant starts with.'],
    ['FULLNESS_JITTER', 'Fullness jitter', 0, 50, 1, 'Random ± spread on the starting fullness.'],
    ['TEMPERAMENT_SPREAD', 'Temperament spread', 0, 1, 0.05, 'Width of each ant\'s hidden "temperament" multiplier, which scales how strongly happiness gains hit it. Wider = more varied personalities.'],
  ]],
  ['Breeding · queens', [
    ['MATE_URGE_MIN', 'Mate urge min * (mood)', 0, 100, 1, 'An ant will only mate once its happiness reaches a threshold picked at random in this min–max band. Higher = fewer ants ready to breed. * set at birth.'],
    ['MATE_URGE_MAX', 'Mate urge max * (mood)', 0, 100, 1, 'Top of the mate-readiness band (see min). * set at birth.'],
    ['MATE_CHANCE', 'Mate chance', 0, 1, 0.01, 'Base probability that a ready pair actually breeds when they meet.'],
    ['CROWD_MATE_STEP', 'Crowd penalty /ant', 0, 0.2, 0.005, 'How much the mate chance drops for each nearby ant — crowding suppresses breeding.'],
    ['CROWD_MATE_FLOOR', 'Crowd floor', 0, 1, 0.05, 'The lowest fraction the crowd penalty can push mate chance to, so breeding never fully stops from crowding alone.'],
    ['POP_CAPACITY', 'Ideal colony size', 10, 500, 5, 'The colony size the happiness bar treats as "full strength" — below it the bar scales down with size, so a tiny colony reads lower even when content.'],
    ['QUEEN_MIN_ANTS', 'Queen needs ≥ ants', 1, 100, 1, 'Minimum colony size before a queen can arise at all.'],
    ['NURSERY_REQUIRED_ABOVE', 'Nursery needed > ants', 1, 200, 1, 'Above this colony size, breeding stalls until a nursery has been built (World Building Mode).'],
    ['QUEEN_HIGH', 'Queen arrives ≥', 50, 100, 1, 'Colony happiness must reach and hold this for a spell before a queen appears.'],
    ['QUEEN_LOW', 'Queen leaves <', 0, 60, 1, 'If colony happiness falls below this, the queen departs.'],
    ['SADIST_SPAWN', 'Sadist queen <', 0, 60, 1, 'Sadist mode: the rival queen appears when the MAIN colony\'s happiness drops below this (she feeds on their misery).'],
    ['SADIST_LEAVE', 'Sadist queen leaves >', 0, 100, 1, 'Sadist mode: the rival queen leaves once the main colony\'s happiness climbs back above this.'],
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
    for (const [key, label, min, max, step, desc] of params) {
      const row = document.createElement('div');
      row.className = 'tune-row';
      if (desc) row.title = desc;   // hover/long-press to see what the value does
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

// The ℹ️ guide: a modal listing every tuning value and what it does, built from the
// same TUNABLES the sliders use (labels/descriptions are static, so innerHTML is safe).
function setupTuningInfo() {
  const modal = $('tuning-info-modal'), body = $('tuning-info-body'), openBtn = $('tuning-info');
  if (!modal || !body || !openBtn) return;
  let html = '<p class="info-note">A <b>*</b> marks values stamped on an ant when it is born — changing one only affects ants spawned afterwards.</p>';
  for (const [group, params] of TUNABLES) {
    html += `<div class="info-group">${group}</div>`;
    for (const [, label, , , , desc] of params) {
      html += `<div class="info-item"><span class="info-name">${label}</span><span class="info-desc">${desc || ''}</span></div>`;
    }
  }
  body.innerHTML = html;
  const close = () => modal.classList.remove('open');
  openBtn.addEventListener('click', () => modal.classList.add('open'));
  $('tuning-info-close').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });   // tap the backdrop to dismiss
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
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

// Show or hide the on-canvas overlay (happiness bars + population readout), and
// keep the eye toggle's glyph, label and state in step. Remembered per browser.
const HUD_HIDE_KEY = 'antFarmHudHidden';
function setHudHidden(hidden) {
  const wrap = document.querySelector('.canvas-container');
  if (wrap) wrap.classList.toggle('hud-hidden', hidden);
  const btn = $('hud-toggle');
  if (btn) {
    btn.setAttribute('aria-pressed', String(hidden));
    const label = hidden ? 'Show stats' : 'Hide stats';
    btn.title = label;
    btn.setAttribute('aria-label', label + ' overlay');
  }
  try { localStorage.setItem(HUD_HIDE_KEY, hidden ? '1' : '0'); } catch (e) { /* private mode */ }
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
  if ($('world-building')) worldBuilding = $('world-building').checked;
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
  if ($('mbar-brush')) $('mbar-brush').value = penWidth;
  $('decay-slider').value           = foodDecayRate;
  $('show-spawn-points').checked    = showSpawnPoints;
  if ($('auto-food')) $('auto-food').checked = autoFood;
  if ($('world-building')) $('world-building').checked = worldBuilding;
  updateReadouts();
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
function setupUI() {
  const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);

  on('thickness-slider', 'input', e => { penWidth = +e.target.value; const b = $('mbar-brush'); if (b) b.value = penWidth; });

  // Food effects are a spoiler: hidden until the player asks
  on('food-info', 'click', e => {
    const open = $('food-legend').classList.toggle('revealed');
    e.currentTarget.setAttribute('aria-expanded', String(open));
    e.currentTarget.title = open ? 'Hide what each food does' : 'Reveal what each food does (spoiler)';
  });

  on('add-ant', 'click', () => {
    if (countWhiteAnts() < MAX_WHITE_ANTS) {
      ants.push(createAntAtSpawn(false));
      totalBornWhite++; spawnedWhite++;
      updateStats(); saveFarm();
    }
  });
  on('add-red-ant', 'click', () => {
    if (countRedAnts() < MAX_RED_ANTS) {
      ants.push(createAntAtSpawn(true));
      totalBornRed++; spawnedRed++;
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
  on('spawn-randomise',   'click', randomiseSpawnPoints);
  on('spawn-delete-all',  'click', () => { spawnPoints = { yellow: [], red: [] }; selectPoint(null); saveFarm(); });
  on('spawn-size-slider', 'input',  e => { if (selectedPoint) selectedPoint.r = +e.target.value; });
  on('spawn-size-slider', 'change', () => saveFarm());
  on('show-spawn-points', 'change', e => { showSpawnPoints = e.target.checked; saveFarm(); });

  // The floating strip drives the maintenance view without the side menu open.
  on('sq-add-yellow',     'click', () => addPointFromPanel(false));
  on('sq-add-red',        'click', () => addPointFromPanel(true));
  on('sq-randomise',      'click', randomiseSpawnPoints);
  on('sq-smaller',        'click', () => resizeSelectedPoint(-8));
  on('sq-bigger',         'click', () => resizeSelectedPoint(8));
  on('sq-delete',         'click', deleteSelectedPoint);
  on('sq-done',           'click', exitMaintenance);
  document.addEventListener('keydown', e => {
    if (!maintenance) return;
    const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName || '');
    if (e.key === 'Escape') exitMaintenance();
    else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPoint && !typing) { e.preventDefault(); deleteSelectedPoint(); }
  });

  on('destroy-world', 'click', () => {
    ants = []; foods = []; pheromones = []; environment = []; environmentHistory = [];
    rooms = []; nextRoomId = 1; eggs = []; placingRoom = null;
    queens.white = queens.red = null;
    seedDefaultSpawnPoints();
    whiteHappiness = redHappiness = 50; whiteCalmMs = 0;
    totalBornWhite = totalDeadWhite = totalBornRed = totalDeadRed = 0;
    matedWhite = spawnedWhite = matedRed = spawnedRed = 0;
    killedWhite = killedRed = 0;
    markEnvDirty();
    updateStats(); saveFarm();
  });

  // Tear down just the nests: rooms, their soil walls and any eggs, leaving painted
  // walls, water, loose food and the ants where they are.
  on('destroy-nest', 'click', () => {
    rooms = []; nextRoomId = 1; eggs = []; placingRoom = null;
    environment = environment.filter(o => !(o.type === 'soil' && o.room));
    activeBuildersW = activeBuildersR = 0;
    markEnvDirty();
    updateStats(); saveFarm();
  });

  on('toggle-controls', 'click', () => {
    setControlsHidden(!document.querySelector('main').classList.contains('controls-hidden'));
  });
  on('controls-backdrop', 'click', () => setControlsHidden(true));

  // Eye toggle: fold the on-canvas overlay away for a clean map. Restore the
  // last choice on load (defaults to shown).
  on('hud-toggle', 'click', () => {
    const hidden = document.querySelector('.canvas-container').classList.contains('hud-hidden');
    setHudHidden(!hidden);
  });
  let hudHidden = false;
  try { hudHidden = localStorage.getItem(HUD_HIDE_KEY) === '1'; } catch (e) { /* private mode */ }
  setHudHidden(hudHidden);

  // Mobile quick bar: the main buttons stay visible beside the map; Menu opens
  // the full controls drawer. Add/Rival reuse the real handlers.
  on('mbar-menu',    'click', () => setControlsHidden(false));
  on('mbar-add',     'click', () => $('add-ant').click());
  on('mbar-add-red', 'click', () => $('add-red-ant').click());
  on('mbar-pause',   'click', () => { animationPaused = !animationPaused; syncPauseLabels(); });

  // The bar's food and tool pickers mirror the panel selects both ways, so the
  // two stay in step whichever one you use.
  const mirror = (from, to) => { const s = $(to); if (s) s.value = $(from).value; };
  // The food picker only makes sense while a food tool is active (tap-to-drop or
  // paint food); the brush size only while painting, not tapping.
  const syncMbarTool = () => {
    const tool = $('mbar-tool') ? $('mbar-tool').value : 'none';
    const food = $('mbar-food-wrap') || $('mbar-food');
    const brush = $('mbar-brush-wrap');
    if (food)  food.style.display  = (tool === 'none' || tool === 'food') ? '' : 'none';
    if (brush) brush.style.display = (tool === 'none') ? 'none' : '';
  };
  on('mbar-food',        'change', () => mirror('mbar-food', 'food-type'));
  on('food-type',        'change', () => mirror('food-type', 'mbar-food'));
  on('mbar-tool',        'change', () => { mirror('mbar-tool', 'environment-tool'); syncMbarTool(); });
  on('environment-tool', 'change', () => { mirror('environment-tool', 'mbar-tool'); syncMbarTool(); });
  on('mbar-brush',       'input',  e => { penWidth = +e.target.value; const t = $('thickness-slider'); if (t) t.value = penWidth; });
  syncMbarTool();

  on('pause-resume', 'click', () => { animationPaused = !animationPaused; syncPauseLabels(); });

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
  on('world-building', 'change', e => { worldBuilding = e.target.checked; saveFarm(); });

  // Nudge the auto-builder: pick a spot for an extra entrance or food store and
  // drag it where you want before the ants dig it.
  on('add-entry',   'click', () => startPlacingRoom('entry'));
  on('add-pantry',  'click', () => startPlacingRoom('pantry'));
  on('add-nursery', 'click', () => startPlacingRoom('nursery'));
  on('add-throne',  'click', () => startPlacingRoom('throne'));
  on('add-empty',   'click', () => startPlacingRoom('empty'));
  on('repair-nest', 'click', repairNest);
  on('room-place-ok',     'click', () => finishPlacingRoom(true));
  on('room-place-cancel', 'click', () => finishPlacingRoom(false));

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
    if (placingRoom) { placingPointerMove(e); return; }   // tap moves the room being placed
    if (maintenance || $('environment-tool').value !== 'none') return;
    const c = getCanvasCoords(e);
    if (addFood(c.x, c.y, $('food-type').value)) saveFarm();
  });

  // Drag to draw
  const startDraw = e => { if (placingRoom) return placingPointerMove(e); if (maintenance) return maintPointerDown(e); lastX = lastY = lastFoodX = lastFoodY = null; handleDraw(e); };
  const endDraw   = () => { if (placingRoom || maintenance) return maintPointerUp(); lastX = lastY = lastFoodX = lastFoodY = null; };

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

// Bulldoze a spot: clear terrain and loose food, and mark any room wall sites whose
// soil we just removed as undone — so the hole stays open (no rendered wall with no
// collision), but the colony does NOT rush to rebuild it. Repairs happen only when
// the player hits "Repair nest".
function bulldozeAt(ix, iy, r2) {
  environment = environment.filter(o => dist2(o.x, o.y, ix, iy) > r2);
  foods       = foods.filter(f => dist2(f.x, f.y, ix, iy) > r2);
  for (const room of rooms) {
    const reach = room.r + CORRIDOR_LEN + 40;
    if (dist2(room.x, room.y, ix, iy) > reach * reach) continue;
    for (const s of room.sites.concat(room.tunnelSites || [], room.barricadeSites || [])) {
      if (s.done && dist2(s.x, s.y, ix, iy) <= r2) { s.done = false; s.tries = 0; }
    }
  }
}

// "Send ants to fix the nest": mark every room that has a knocked-out wall as unbuilt
// so the colony digs its missing walls back in. Only touches damaged rooms.
function repairNest() {
  let any = false;
  for (const room of rooms) {
    const sites = room.sites.concat(room.tunnelSites || [], room.barricadeSites || []);
    if (sites.some(s => !s.done)) { room.built = false; room._stall = 0; room._lastDone = -1; any = true; }
  }
  if (any) { markEnvDirty(); saveFarm(); }
}

function handleDraw(e) {
  if (placingRoom) return placingPointerMove(e);
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
    } else if (tool === 'soil') {
      environment.push({ x: ix, y: iy, type: 'soil', r: penWidth });   // a brown soil wall, blocks ants like the nest walls
    } else if (tool === 'food') {
      // Every food scatters with its own spacing so a dragged line is spaced
      // drops, not a solid pile: sugar close, fruit wider, protein wider still,
      // and a dead insect (Infinity) only once per press.
      const spacing = FOOD_SPACING[foodType] ?? 22;
      if (lastFoodX === null || dist2(ix, iy, lastFoodX, lastFoodY) >= spacing * spacing) {
        if (addFood(ix, iy, foodType)) { lastFoodX = ix; lastFoodY = iy; }
      }
    } else if (tool === 'bulldozer') {
      bulldozeAt(ix, iy, (penWidth + 4) * (penWidth + 4));
    }
  });
  if (tool !== 'food') markEnvDirty();

  lastX = x; lastY = y;
  saveFarm();
}

// ---------------------------------------------------------------------------
// Spawn point maintenance view
// ---------------------------------------------------------------------------
function setMaintenanceChrome(active) {
  const qb = $('spawn-quickbar'); if (qb) qb.hidden = !active;
}

function enterMaintenance() {
  if (maintenance) return;
  maintenance = true;
  pausedBeforeMaint = animationPaused;
  setPaused(true);
  document.querySelector('main').classList.add('spawn-mode');
  $('spawn-panel').hidden = false;
  setMaintenanceChrome(true);
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
  setMaintenanceChrome(false);
  selectPoint(null);
  saveFarm();
}

// ---------------------------------------------------------------------------
// Placing a room by hand (+ Entrance / + Food store): drag a ghost where you
// want it, then Place. It won't commit on top of another room, and once the
// ants have built it, it can't be moved.
// ---------------------------------------------------------------------------
function startPlacingRoom(type) {
  if (!worldBuilding) { alert('Turn on World Building Mode first.'); return; }
  if (!canAddRoom(false, type)) { alert('That room type is already at its limit.'); return; }
  const a = colonySpawnPoints(false)[0];
  placingRoom = { type, x: clamp(a.x + a.r + 70, 0, canvas.width), y: clamp(a.y, 0, canvas.height) };
  placingBefore = animationPaused;
  setPaused(true);
  const bar = $('room-place-bar');
  if (bar) { bar.hidden = false; $('room-place-label').textContent = 'Drag the ' + (ROOM_SPECS[type].label || type).toLowerCase() + ' where you want it'; }
}

function finishPlacingRoom(commit) {
  if (!placingRoom) return;
  if (commit) {
    const type = placingRoom.type, spec = ROOM_SPECS[type];
    if (placementBlocked(false, placingRoom.x, placingRoom.y, spec.r)) {
      alert('That spot overlaps another room — drag it to a clear space.');
      return;   // stay in placing mode
    }
    if (rooms.some(r => r.team === false) && !nearestConnectable(false, type, placingRoom.x, placingRoom.y)) {
      alert('A ' + (spec.label || type).toLowerCase() + ' has nothing here it can connect to — put an empty room in between to route a path.');
      return;
    }
    buildRoomAt(false, type, placingRoom.x, placingRoom.y, true);   // buildRoomAt adds & wires it
    saveFarm();
  }
  placingRoom = null;
  const bar = $('room-place-bar');
  if (bar) bar.hidden = true;
  setPaused(placingBefore);
}

function placingPointerMove(e) {
  if (e.cancelable) e.preventDefault();
  const { x, y } = getCanvasCoords(e);
  placingRoom.x = clamp(x, 0, canvas.width);
  placingRoom.y = clamp(y, 0, canvas.height);
}

// Keep both Pause buttons (the panel's and the mobile quick bar's) in step.
function syncPauseLabels() {
  const t = animationPaused ? 'Resume' : 'Pause';
  for (const id of ['pause-resume', 'mbar-pause']) { const b = $(id); if (b) b.textContent = t; }
}

function setPaused(p) {
  animationPaused = p;
  syncPauseLabels();
}

function selectPoint(s) {
  selectedPoint = s;
  const label = $('spawn-selected-label'), slider = $('spawn-size-slider'), del = $('spawn-delete');
  const sqLabel = $('sq-selected'), sqButtons = ['sq-smaller', 'sq-bigger', 'sq-delete'].map($);
  if (s) {
    const list = spawnPoints[pointIsRed(s) ? 'red' : 'yellow'];
    const idx = list.indexOf(s) + 1, kind = pointIsRed(s) ? 'Rival ant' : 'Ant';
    if (label)  label.textContent = `${kind} point ${idx} of ${list.length}`;
    if (slider) { slider.disabled = false; slider.value = s.r; }
    if (del)    del.disabled = false;
    if (sqLabel) sqLabel.textContent = `${pointIsRed(s) ? 'Rival' : 'Ant'} ${idx}`;
    for (const b of sqButtons) if (b) b.disabled = false;
  } else {
    if (label)  label.textContent = 'Nothing selected. Click a point on the map.';
    if (slider) slider.disabled = true;
    if (del)    del.disabled = true;
    if (sqLabel) sqLabel.textContent = 'Tap a point';
    for (const b of sqButtons) if (b) b.disabled = true;
  }
}

function addPointFromPanel(isRed) {
  if (!maintenance) enterMaintenance();   // on-canvas add works even from a fresh map
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

// Nudge the selected point's radius, keeping the panel slider and labels in step.
function resizeSelectedPoint(delta) {
  if (!selectedPoint) return;
  selectedPoint.r = clamp(selectedPoint.r + delta, NEST_MIN_R, NEST_MAX_R);
  selectPoint(selectedPoint);
  saveFarm();
}

// Scatter a fresh random layout (varied counts, sizes and spots) for both colonies.
function randomiseSpawnPoints() {
  if (!maintenance) enterMaintenance();
  spawnPoints = randomSpawnLayout();
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

