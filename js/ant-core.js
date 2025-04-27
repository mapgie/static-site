 
let ants = [];
let foods = [];
let animationPaused = false;
let matingSpeed = 5000;
let allowRedBreeding = true;
let totalBorn = 0;
let totalDead = 0;
let normalAntLifespan = BASE_NORMAL_LIFESPAN;
let redAntLifespan = BASE_RED_LIFESPAN;
let canvas, ctx;

function createAnt(isRed = false) {
  const baseLife = isRed ? redAntLifespan : normalAntLifespan;
  const jitter = (Math.random() * 0.2 - 0.1);
  const lifespan = baseLife * (1 + jitter);

  return {
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    angle: Math.random() * Math.PI * 2,
    isRed: isRed,
    speed: isRed ? 2 : 1,
    breedingTimer: 0,
    lifespan
  };
}

function createFood(x, y, type) {
  foods.push({x, y, type});
}

function moveAndDrawAnts() {
  for (let i = ants.length - 1; i >= 0; i--) {
    const ant = ants[i];

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

    ant.breedingTimer += 16;
    if (ant.breedingTimer >= matingSpeed) {
      tryBreeding(ant);
      ant.breedingTimer = 0;
    }

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