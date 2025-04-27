let ants = [];
let foods = [];
let animationPaused = false;
let matingSpeed = 5000; // milliseconds per breeding opportunity
let allowRedBreeding = true;
let totalBorn = 0;
let totalDead = 0;
let canvas, ctx;

// Initialize when DOM is ready
window.addEventListener('DOMContentLoaded', () => {
  canvas = document.getElementById('antCanvas');
  ctx = canvas.getContext('2d');
  setupUI();
  animate();
});

function setupUI() {
  document.getElementById('add-ant').addEventListener('click', () => {
    ants.push(createAnt());
    totalBorn++;
    updateStats();
  });

  document.getElementById('add-red-ant').addEventListener('click', () => {
    ants.push(createAnt(true));
    totalBorn++;
    updateStats();
  });

  document.getElementById('pause-resume').addEventListener('click', () => {
    animationPaused = !animationPaused;
    document.getElementById('pause-resume').innerText = animationPaused ? 'Resume' : 'Pause';
  });

  document.getElementById('mute-toggle').addEventListener('click', () => {
    // Mute button kept for future (no sound currently)
  });

  document.getElementById('allow-red-breeding').addEventListener('change', (e) => {
    allowRedBreeding = e.target.checked;
  });

  document.getElementById('kill-red-ants').addEventListener('click', () => {
    ants = ants.filter(a => !a.isRed);
    updateStats();
  });

  document.getElementById('mating-slider').addEventListener('input', (e) => {
    const value = e.target.value;
    matingSpeed = 10000 - (value * 90); // Mating conditions from awful (slow) to optimal (fast)
    updateMatingLabel(value);
  });

  document.getElementById('antCanvas').addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const foodType = document.getElementById('food-type').value;
    createFood(x, y, foodType);
  });
}

function updateMatingLabel(value) {
  const label = document.getElementById('mating-label');
  if (value <= 20) label.innerText = "Awful";
  else if (value <= 50) label.innerText = "Moderate";
  else label.innerText = "Optimal";
}

function createAnt(isRed = false) {
  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    angle: Math.random() * Math.PI * 2,
    isRed: isRed,
    speed: isRed ? 2 : 1,
    breedingTimer: 0
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
  ants.forEach(ant => {
    ctx.beginPath();
    ctx.fillStyle = ant.isRed ? 'red' : 'white';
    ctx.arc(ant.x, ant.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.closePath();

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

    // Breeding logic
    ant.breedingTimer += 16;
    if (ant.breedingTimer >= matingSpeed) {
      tryBreeding(ant);
      ant.breedingTimer = 0;
    }
  });
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
