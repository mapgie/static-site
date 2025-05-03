import { initCore, createAnt, createFood, ants, foods, animationPaused } from './ant-core.js';
import { updateStats } from './ant-ui.js';
import { saveFarm, loadFarm } from './ant-storage.js';

const canvas = document.getElementById('ant-canvas');
const controls = {
  addAnt: document.getElementById('add-ant'),
  addRedAnt: document.getElementById('add-red-ant'),
  addFood: document.getElementById('add-food'),
  foodType: document.getElementById('food-type'),
  pause: document.getElementById('pause'),
  save: document.getElementById('save'),
  load: document.getElementById('load'),
};

initCore(canvas);
updateStats();

controls.addAnt.addEventListener('click', () => { /* … */ });
controls.addRedAnt.addEventListener('click', () => { /* … */ });

controls.addFood.addEventListener('click', () => {
  createFood(
    Math.random() * canvas.width,
    Math.random() * canvas.height,
    controls.foodType.value
  );
  updateStats();
});

controls.addAnt.addEventListener('click', () => {
  ants.push(createAnt(false));
  updateStats();
});

controls.addRedAnt.addEventListener('click', () => {
  ants.push(createAnt(true));
  updateStats();
});

controls.addSugar.addEventListener('click', () => {
  createFood(Math.random() * canvas.width, Math.random() * canvas.height, 'sugar');
  updateStats();
});

controls.addProtein.addEventListener('click', () => {
  createFood(Math.random() * canvas.width, Math.random() * canvas.height, 'protein');
  updateStats();
});

controls.pause.addEventListener('click', () => {
  animationPaused = !animationPaused;
  controls.pause.textContent = animationPaused ? 'Resume' : 'Pause';
});

controls.save.addEventListener('click', () => {
  saveFarm({ ants, foods, totalBorn, totalDead });
});

controls.load.addEventListener('click', () => {
  const data = loadFarm();
  if (!data) return;
  ants.length = 0;
  foods.length = 0;
  data.ants.forEach(a => ants.push(a));
  data.foods.forEach(f => foods.push(f));
  // totalBorn/totalDead will be refreshed on next updateStats call
  updateStats();
});
