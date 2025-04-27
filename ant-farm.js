let ants = [];
let foods = [];
let animationPaused = false;
let matingSpeed = 5000; // milliseconds per breeding opportunity
let allowRedBreeding = true;
let totalBorn = 0;
let totalDead = 0;
let canvas, ctx;

// Lifespan settings
let normalAntLifespan = 120000;
let redAntLifespan = 120000;

// LocalStorage key
const SAVE_KEY = 'antFarmSave';

// Setup when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('antCanvas');
  ctx = canvas.getContext('2d');
  loadFarm();  // Load saved farm data from localStorage
  setupUI();
  animate();
});

function setupUI() {
  document.getElementById('add-ant').addEventListener('click', () => {
    ants.push(createAnt(false));
    totalBorn++;
    updateStats();
    saveFarm();
  });

  document.getElementById('add-red-ant').addEventListener('click', () => {
    ants.push(createAnt(true));
    totalBorn++;
    updateStats();
    saveFarm();
  });

  document.getElementById('pause-resume').addEventListener('click', () => {
    animationPaused = !animationPaused;
    document.getElementById('pause-resume').innerText = animationPaused ? 'Resume' : 'Pause';
  });

  document.getElementById('allow-red-breeding').addEventListener('change', (e) => {
    allowRedBreeding = e.target.checked;
    saveFarm();
  });

  document.getElementById('kill-red-ants').addEventListener('click', () => {
    ants = ants.filter(a => !a.isRed);
    updateStats();
    saveFarm();
  });

  document.getElementById('mating-slider').addEventListener('input', (e) => {
    const value = e.target.value;
    matingSpeed = 10000 - (value * 90);
    updateMatingLabel(value);
    saveFarm();
  });

  document.getElementById('lifespan-slider-normal').addEventListener('input', (e) => {
    normalAntLifespan = e.target.value * 1000;
    updateLifespanLabelNormal(e.target.value);
    saveFarm();
  });

  document.getElementById('lifespan-slider-red').addEventListener('input', (e) => {
    redAntLifespan = e.target.value * 1000;
    updateLifespanLabelRed(e.target.value);
    saveFarm();
  });

  document.getElementById('antCanvas').addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const foodType = document.getElementById('food-type').value;
    createFood(x, y, foodType);
    saveFarm();
  });
}

function updateMatingLabel(value) {
  const label = document.getElementById('mating-label');
  if (value <= 20) label.innerText = "Awful";
  else if (value <= 50) label.innerText = "Moderate";
  else label.innerText = "Optimal";
}

function updateLifespanLabelNormal(value) {
  document.getElementById('lifespan-label-normal').innerText = `${Math.round(value/60)} min`;
}

function updateLifespanLabelRed(value) {
  document.getElementById('lifespan-label-red').innerText = `${Math.round(value/60)} min`;
}

function createAnt(isRed = false) {
  const baseLife = isRed ? redAntLifespan : normalAntLifespan;
  const jitter = (Math.random() * 0.2 - 0.1); // ±10%
  const lifespan = baseLife * (1 + jitter);

  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    angle: Math.random() * Math.PI * 2,
    isRed: isRed,
    speed: isRed ? 2 : 1,
    breedingTimer: 0,
    lifespan: lifespan // milliseconds
  };
}

function createFood(x, y, type) {
  foods.push({x, y, type});
}

function updateStats() {
  document.getElementById('stats').innerText = `Ants Alive: ${ants.length} | Born: ${totalBorn} | Dead: ${totalDead}`;
}

function animate() {
  if (!animationPaused) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawFoods();
    moveAndDrawAnts();
  }
  requestAnimationFrame(animate);
}

function drawFoods() {
  foods.forEach(food => {
    ctx.beginPath();
    ctx.fillStyle = getFoodColor(food.type);
    ctx.arc(food.x, food.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();
  });
}

function getFoodColor(type) {
  switch(type) {
    case 'sugar': return 'white';
    case 'protein': return 'green';
    case 'spoiled': return 'blue';
    case 'poison': return 'purple';
    default: return 'white';
  }
}

function moveAndDrawAnts() {
  for (let i = ants.length - 1; i >= 0; i--) {
    const ant = ants[i];

    // Draw
    ctx.beginPath();
    ctx.fillStyle = ant.isRed ? 'red' : 'white';
    ctx.arc(ant.x, ant.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();

    // Movement
    if (foods.length > 0) {
      const nearest = foods.reduce((a, b) => {
        const da = (a.x - ant.x)**2 + (a.y - ant.y)**2;
        const db = (b.x - ant.x)**2 + (b.y - ant.y)**2;
        return da < db ? a : b;
      });
      const angleToFood = Math.atan2(nearest.y - ant.y, nearest.x - ant.x);
      ant.angle += (angleToFood - ant.angle) * 0.1;

      if (Math.hypot(ant.x - nearest.x, ant.y - nearest.y) < 10) {
        foods.splice(foods.indexOf(nearest), 1);
      }
    }

    ant.x += Math.cos(ant.angle) * ant.speed;
    ant.y += Math.sin(ant.angle) * ant.speed;

    if (ant.x < 0) ant.x = canvas.width;
    if (ant.x > canvas.width) ant.x = 0;
    if (ant.y < 0) ant.y = canvas.height;
    if (ant.y > canvas.height) ant.y = 0;

    // Breeding
    ant.breedingTimer += 16;
    if (ant.breedingTimer >= matingSpeed) {
      tryBreeding(ant);
      ant.breedingTimer = 0;
    }

    // Lifespan ticking
    ant.lifespan -= 16;
    if (ant.lifespan <= 0) {
      ants.splice(i, 1);
      totalDead++;
      updateStats();
    }
  }
}

function tryBreeding(ant) {
  ants.forEach(other => {
    if (other === ant) return;
    if (Math.hypot(ant.x - other.x, ant.y - other.y) < 30) {
      if (ant.isRed && other.isRed) {
        if (allowRedBreeding) ants.push(createAnt(true));
      } else if (!ant.isRed && !other.isRed) {
        ants.push(createAnt(false));
      }
      totalBorn++;
      updateStats();
    }
  });
}

// Save farm data to localStorage
function saveFarm() {
  const data = {
    ants,
    foods,
    totalBorn,
    totalDead,
    matingSpeed,
    normalAntLifespan,
    redAntLifespan,
    allowRedBreeding
  };
  localStorage.setItem(SAVE_KEY, JSON.stringify(data));
}

// Load farm data from localStorage
function loadFarm() {
  const saved = localStorage.getItem(SAVE_KEY);
  if (saved) {
    const data = JSON.parse(saved);
    ants = data.ants || [];
    foods = data.foods || [];
    totalBorn = data.totalBorn || 0;
    totalDead = data.totalDead || 0;
    matingSpeed = data.matingSpeed || matingSpeed;
    normalAntLifespan = data.normalAntLifespan || normalAntLifespan;
    redAntLifespan = data.redAntLifespan || redAntLifespan;
    allowRedBreeding = data.allowRedBreeding !== undefined ? data.allowRedBreeding : allowRedBreeding;
    updateStats();
  }
}
