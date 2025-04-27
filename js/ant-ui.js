 
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('antCanvas');
  ctx = canvas.getContext('2d');

  fetch('header.html')
    .then(r => r.text())
    .then(html => {
      document.getElementById('header-placeholder').innerHTML = html;
      return fetch('ant-controls-panel.html');
    })
    .then(r => r.text())
    .then(html => {
      document.getElementById('controls-placeholder').innerHTML = html;
      loadFarm();
      setupUI();
      animate();
    })
    .catch(err => console.error('Failed to load UI:', err));
});

function setupUI() {
  const get = id => document.getElementById(id);

  get('add-ant')?.addEventListener('click', () => {
    ants.push(createAnt(false));
    totalBorn++;
    updateStats();
    saveFarm();
  });

  get('add-red-ant')?.addEventListener('click', () => {
    ants.push(createAnt(true));
    totalBorn++;
    updateStats();
    saveFarm();
  });

  get('pause-resume')?.addEventListener('click', (e) => {
    animationPaused = !animationPaused;
    e.target.innerText = animationPaused ? 'Resume' : 'Pause';
  });

  get('allow-red-breeding')?.addEventListener('change', (e) => {
    allowRedBreeding = e.target.checked;
    saveFarm();
  });

  get('kill-red-ants')?.addEventListener('click', () => {
    ants = ants.filter(a => !a.isRed);
    updateStats();
    saveFarm();
  });

  get('mating-slider')?.addEventListener('input', (e) => {
    matingSpeed = 10000 - (e.target.value * 90);
    updateMatingLabel(e.target.value);
    saveFarm();
  });

  get('lifespan-slider-normal')?.addEventListener('input', (e) => {
    normalAntLifespan = e.target.value * 1000;
    updateLifespanLabelNormal(e.target.value);
    saveFarm();
  });

  get('lifespan-slider-red')?.addEventListener('input', (e) => {
    redAntLifespan = e.target.value * 1000;
    updateLifespanLabelRed(e.target.value);
    saveFarm();
  });

  get('antCanvas')?.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const foodType = get('food-type')?.value || 'sugar';
    createFood(x, y, foodType);
    saveFarm();
  });
}