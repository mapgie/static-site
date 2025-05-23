fetch('header.html')
  .then(response => response.text())
  .then(data => {
    document.getElementById('header-placeholder').innerHTML = data;
  });

const canvas = document.getElementById('artCanvas');
const ctx = canvas.getContext('2d');
const generateBtn = document.getElementById('generate');
const saveBtn = document.getElementById('save');

const tabs = document.querySelectorAll('.tab');
const sections = { free: document.getElementById('free'), tonal: document.getElementById('tonal'), complementary: document.getElementById('complementary') };
let currentMode = 'free';

const palette = [];
let savedColors = { tonal: '#ff0000', complementary: '#00ff00' };

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentMode = tab.dataset.mode;
    Object.keys(sections).forEach(mode => sections[mode].classList.add('hidden'));
    sections[currentMode].classList.remove('hidden');
  });
});

document.getElementById('add-color').addEventListener('click', () => {
  const color = document.getElementById('free-color-picker').value;
  palette.push(color);
  updatePaletteDisplay();
});

document.getElementById('clear-palette').addEventListener('click', () => {
  palette.length = 0;
  updatePaletteDisplay();
});

function updatePaletteDisplay() {
  const container = document.getElementById('free-palette');
  container.innerHTML = '';
  palette.forEach(color => {
    const div = document.createElement('div');
    div.className = 'palette-color';
    div.style.background = color;
    container.appendChild(div);
  });
}

function generatePalette(baseColor, type) {
  const base = hexToHSL(baseColor);
  let generated = [];
  if (type === 'tonal') {
    for (let i = -30; i <= 30; i += 15) {
      generated.push(`hsl(${(base.h + i + 360) % 360}, ${base.s}%, ${base.l}%)`);
    }
  } else if (type === 'complementary') {
    const comp = (base.h + 180) % 360;
    for (let i = -20; i <= 20; i += 10) {
      generated.push(`hsl(${(comp + i + 360) % 360}, ${base.s}%, ${base.l}%)`);
    }
  }
  return generated;
}

function hexToHSL(hex) {
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  let cmin = Math.min(r, g, b);
  let cmax = Math.max(r, g, b);
  let delta = cmax - cmin;
  let h = 0, s = 0, l = 0;

  if (delta !== 0) {
    if (cmax === r) h = ((g - b) / delta) % 6;
    else if (cmax === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
  }

  h = Math.round(h * 60);
  if (h < 0) h += 360;

  l = (cmax + cmin) / 2;
  s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  return { h, s: (s * 100).toFixed(1), l: (l * 100).toFixed(1) };
}

function pickColors() {
  if (currentMode === 'free') {
    return palette.length > 0 ? palette : ['#ffffff'];
  } else {
    const baseId = currentMode + '-base';
    const baseColor = document.getElementById(baseId).value || savedColors[currentMode];
    savedColors[currentMode] = baseColor;
    return generatePalette(baseColor, currentMode);
  }
}

function drawArt() {
  const colors = pickColors();
  const complexity = parseInt(document.getElementById('complexity').value, 10);
  const background = document.getElementById('background-color').value;

  const shapes = [];
  if (document.getElementById('circles').checked) shapes.push('circle');
  if (document.getElementById('lines').checked) shapes.push('line');
  if (document.getElementById('wavy-lines').checked) shapes.push('wavy-line');
  if (document.getElementById('wavy-polygons').checked) shapes.push('wavy-polygon');

  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < complexity; i++) {
    ctx.fillStyle = ctx.strokeStyle = colors[Math.floor(Math.random() * colors.length)];
    const shape = shapes[Math.floor(Math.random() * shapes.length)];
    if (shape === 'circle') drawCircle();
    else if (shape === 'line') drawLine();
    else if (shape === 'wavy-line') drawWavyLine();
    else if (shape === 'wavy-polygon') drawWavyPolygon();
  }
}

function drawCircle() {
  ctx.beginPath();
  ctx.arc(Math.random() * 600, Math.random() * 600, Math.random() * 30, 0, Math.PI * 2);
  ctx.fill();
}

function drawLine() {
  ctx.beginPath();
  ctx.moveTo(Math.random() * 600, Math.random() * 600);
  ctx.lineTo(Math.random() * 600, Math.random() * 600);
  ctx.lineWidth = Math.random() * 3;
  ctx.stroke();
}

function drawWavyLine() {
  ctx.beginPath();
  let x = Math.random() * 600;
  let y = Math.random() * 600;
  ctx.moveTo(x, y);
  for (let i = 0; i < 5; i++) {
    x += Math.random() * 100 - 50;
    y += Math.random() * 100 - 50;
    ctx.lineTo(x, y);
  }
  ctx.lineWidth = Math.random() * 2;
  ctx.stroke();
}

function drawWavyPolygon() {
  ctx.beginPath();
  const sides = Math.floor(Math.random() * 4) + 5;
  const centerX = Math.random() * 600;
  const centerY = Math.random() * 600;
  const radius = Math.random() * 50 + 20;
  for (let i = 0; i <= sides; i++) {
    const angle = (i / sides) * Math.PI * 2;
    const r = radius + Math.random() * 10 - 5;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

generateBtn.addEventListener('click', drawArt);
saveBtn.addEventListener('click', () => {
  const link = document.createElement('a');
  link.download = 'artwork.png';
  link.href = canvas.toDataURL();
  link.click();
});