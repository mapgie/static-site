// ant-farm — saved configurations: save / load / export / import / compare
'use strict';

// Configurations live under their own key, separate from the running autosave.
// Each entry: { id, name, kind: 'config' | 'world', savedAt, data }.
//   'config' — reproducible setup: settings + spawn points (no live ants/food)
//   'world'  — a full snapshot: settings + spawn points + the live world
const CONFIG_KEY = 'antFarmConfigs';

function loadConfigs() {
  try {
    const list = JSON.parse(localStorage.getItem(CONFIG_KEY) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (err) {
    console.warn('Could not read configurations', err);
    return [];
  }
}

function storeConfigs(list) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn('Could not save configurations', err);
    alert('Could not save the configuration — browser storage may be full.');
  }
}

const configId = () => 'cfg-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);
const deepCopy = obj => JSON.parse(JSON.stringify(obj));

// Snapshot the current state into a config entry of the given kind.
function buildConfigEntry(name, kind) {
  const data = kind === 'world'
    ? serializeWorld()
    : { ...collectSettings(), spawnPoints: deepCopy(spawnPoints) };
  return { id: configId(), name, kind, savedAt: Date.now(), data };
}

function saveCurrentConfig(kind) {
  const raw = ($('config-name').value || '').trim();
  const name = raw || `${kind === 'world' ? 'World' : 'Config'} ${new Date().toLocaleString()}`;
  const list = loadConfigs();
  list.unshift(buildConfigEntry(name, kind));
  storeConfigs(list);
  $('config-name').value = '';
  renderConfigList();
}

function deleteConfig(id) {
  storeConfigs(loadConfigs().filter(c => c.id !== id));
  renderConfigList();
}

// Apply a saved entry. 'world' restores everything; 'config' only re-applies the
// parameters and spawn points, leaving the current ants and food in place.
function applyConfigEntry(entry) {
  if (!entry || !entry.data) return;
  if (entry.kind === 'world') {
    applyState(entry.data);
  } else {
    applySettings(entry.data);
    applySpawnPoints(entry.data);
    writeSettingsToControls();
  }
  buildTuning();
  updateStats();
  saveFarm();
}

// --- Export / import --------------------------------------------------------

function exportConfig(entry) {
  const safe = (entry.name || 'config').replace(/[^\w.-]+/g, '_').slice(0, 60) || 'config';
  const blob = new Blob([JSON.stringify(entry, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safe}.antconfig.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importConfigFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    let obj;
    try { obj = JSON.parse(reader.result); }
    catch { alert('That file is not valid JSON.'); return; }
    if (!obj || typeof obj !== 'object' || !obj.data || !['config', 'world'].includes(obj.kind)) {
      alert('That does not look like an ant configuration file.');
      return;
    }
    const list = loadConfigs();
    list.unshift({
      id: configId(),
      name: (obj.name || 'Imported config') + ' (imported)',
      kind: obj.kind,
      savedAt: Date.now(),
      data: obj.data
    });
    storeConfigs(list);
    renderConfigList();
  };
  reader.readAsText(file);
}

// --- Comparison table -------------------------------------------------------

// Which settings to line up in the compare table, in display order.
const COMPARE_FIELDS = [
  ['matingSpeed',        'Mating speed (ms)'],
  ['normalAntLifespan',  'Ant lifespan (ms)'],
  ['redAntLifespan',     'Rival lifespan (ms)'],
  ['normalAntSpeed',     'Ant speed'],
  ['redAntSpeed',        'Rival speed'],
  ['redAggressionLevel', 'Rival aggression'],
  ['penWidth',           'Brush thickness'],
  ['foodDecayRate',      'Food decay rate'],
  ['autoFood',           'Auto food'],
  ['allowRedBreeding',   'Rival breeding'],
  ['sadistMode',         'Sadist mode'],
];

function fmtValue(v) {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'boolean') return v ? 'on' : 'off';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : v.toFixed(2);
  return String(v);
}

const spawnCount = (entry, colony) =>
  (entry.data.spawnPoints && Array.isArray(entry.data.spawnPoints[colony])) ? entry.data.spawnPoints[colony].length : 0;

// Build [label, [cell per entry]] rows for the selected configs.
function comparisonRows(entries) {
  const rows = [];
  const add = (label, fn) => rows.push([label, entries.map(fn)]);

  for (const [key, label] of COMPARE_FIELDS) add(label, e => fmtValue(e.data[key]));
  for (const key of Object.keys(TUNE_DEFAULTS)) add('tune · ' + key, e => fmtValue(e.data.tune ? e.data.tune[key] : undefined));
  add('Spawn points · ant',   e => fmtValue(spawnCount(e, 'yellow')));
  add('Spawn points · rival', e => fmtValue(spawnCount(e, 'red')));

  if (entries.some(e => e.kind === 'world')) {
    const world = (e, fn) => e.kind === 'world' ? fmtValue(fn(e.data)) : '—';
    add('Saved ants',  e => world(e, d => (d.ants  || []).length));
    add('Saved food',  e => world(e, d => (d.foods || []).length));
    add('Born · ant',  e => world(e, d => d.totalBornWhite || 0));
    add('Born · rival',e => world(e, d => d.totalBornRed   || 0));
  }
  return rows;
}

function renderComparison(entries) {
  const body = $('config-compare-body');
  const differs = cells => new Set(cells).size > 1;

  let html = '<table class="compare-table"><thead><tr><th>Field</th>';
  for (const e of entries) {
    html += `<th>${escapeHtml(e.name)}<span class="compare-kind">${e.kind === 'world' ? 'world' : 'settings'}</span></th>`;
  }
  html += '</tr></thead><tbody>';
  for (const [label, cells] of comparisonRows(entries)) {
    html += `<tr class="${differs(cells) ? 'row-diff' : ''}"><th>${escapeHtml(label)}</th>`;
    html += cells.map(c => `<td>${escapeHtml(c)}</td>`).join('');
    html += '</tr>';
  }
  html += '</tbody></table>';
  body.innerHTML = html;
  $('config-compare-modal').classList.add('open');
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// --- List UI ----------------------------------------------------------------

function renderConfigList() {
  const list = loadConfigs();
  const box = $('config-list');
  if (!box) return;
  if (!list.length) {
    box.innerHTML = '<p class="hint">No saved configurations yet. Save the current setup above.</p>';
    return;
  }
  box.innerHTML = list.map(c => `
    <div class="config-row" data-id="${c.id}">
      <label class="config-pick"><input type="checkbox" data-act="pick"> </label>
      <div class="config-meta">
        <span class="config-name">${escapeHtml(c.name)}</span>
        <span class="config-badge ${c.kind}">${c.kind === 'world' ? 'world' : 'settings'}</span>
      </div>
      <div class="config-actions">
        <button type="button" data-act="load" title="Apply this configuration">Load</button>
        <button type="button" data-act="export" title="Download as a file">Export</button>
        <button type="button" data-act="delete" class="subtle" title="Delete">&times;</button>
      </div>
    </div>`).join('');
}

function selectedConfigs() {
  const ids = [...document.querySelectorAll('#config-list .config-row')]
    .filter(row => row.querySelector('input[data-act="pick"]').checked)
    .map(row => row.dataset.id);
  const byId = new Map(loadConfigs().map(c => [c.id, c]));
  return ids.map(id => byId.get(id)).filter(Boolean);
}

function setupConfigUI() {
  const on = (id, ev, fn) => $(id)?.addEventListener(ev, fn);

  on('config-save',       'click', () => saveCurrentConfig('config'));
  on('config-save-world', 'click', () => saveCurrentConfig('world'));
  on('config-import',     'click', () => $('config-import-input').click());
  on('config-import-input', 'change', e => {
    if (e.target.files && e.target.files[0]) importConfigFile(e.target.files[0]);
    e.target.value = '';   // allow re-importing the same file
  });
  on('config-compare', 'click', () => {
    const picked = selectedConfigs();
    if (picked.length < 2) { alert('Tick at least two configurations to compare.'); return; }
    renderComparison(picked);
  });
  on('config-compare-close', 'click', () => $('config-compare-modal').classList.remove('open'));
  on('config-compare-modal', 'click', e => {
    if (e.target.id === 'config-compare-modal') e.target.classList.remove('open');   // click backdrop
  });

  // The list uses delegation so it survives re-renders.
  $('config-list')?.addEventListener('click', e => {
    const btn = e.target.closest('button[data-act]');
    if (!btn) return;
    const row = e.target.closest('.config-row');
    const id = row && row.dataset.id;
    const entry = loadConfigs().find(c => c.id === id);
    if (!entry) return;
    if (btn.dataset.act === 'load')   applyConfigEntry(entry);
    if (btn.dataset.act === 'export') exportConfig(entry);
    if (btn.dataset.act === 'delete' && confirm(`Delete "${entry.name}"?`)) deleteConfig(id);
  });

  renderConfigList();
}
