// ant-farm.js

const canvas = document.getElementById('antCanvas'); const ctx = canvas.getContext('2d');

// Control panel elements const addAntBtn = document.getElementById('add-ant'); const addRedAntBtn = document.getElementById('add-red-ant'); const killRedAntsBtn = document.getElementById('kill-red-ants'); const matingSlider = document.getElementById('mating-slider'); const matingLabel = document.getElementById('mating-label'); const lifespanNormalSlider = document.getElementById('lifespan-slider-normal'); const lifespanLabelNormal = document.getElementById('lifespan-label-normal'); const lifespanRedSlider = document.getElementById('lifespan-slider-red'); const lifespanLabelRed = document.getElementById('lifespan-label-red'); const foodSelector = document.getElementById('food-type'); const allowRedBreedingCheckbox = document.getElementById('allow-red-breeding'); const pauseResumeBtn = document.getElementById('pause-resume'); const muteToggleBtn = document.getElementById('mute-toggle'); const statsDisplay = document.getElementById('stats');

let ants = []; let antCounter = 1; let isPaused = false; let bornCount = 0; let deadCount = 0; let foods = []; // simple food points array

class Ant {
    constructor(name, x, y, color, lifespan) {
        this.name = name; this.x = x; this.y = y; this.dx = Math.random() * 2 - 1; this.dy = Math.random() * 2 - 1; this.color = color; this.lifespan = lifespan; this.birthTime = Date.now(); this.alive = true;
    }

    update() {
        this.x += this.dx;
        this.y += this.dy;

        if (this.x < 0 || this.x > canvas.width) this.dx *= -1;
        if (this.y < 0 || this.y > canvas.height) this.dy *= -1;

        if ((Date.now() - this.birthTime) / 1000 > this.lifespan) {
            this.alive = false;
            deadCount++;
        }
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x, this.y, 6, 6);
    }

}

function addAnt(type = 'normal') {
    const name = $ {
        type === 'red' ? 'Red Ant': 'Ant'
    } $ {
        antCounter++
    }; const color = type === 'red' ? '#FF0000': '#00FF00'; const lifespan = type === 'red' ? Number(lifespanRedSlider.value): Number(lifespanNormalSlider.value); const x = Math.random() * canvas.width; const y = Math.random() * canvas.height; ants.push(new Ant(name, x, y, color, lifespan)); bornCount++;
}

function killAllRedAnts() {
    ants.forEach(ant => {
        if (ant.color === '#FF0000') ant.alive = false;
    });
}

function updateStats() {
    const alive = ants.filter(a => a.alive).length; statsDisplay.textContent = Ants Alive: $ {
        alive
    } | Born: $ {
        bornCount
    } | Dead: $ {
        deadCount
    };
}

function update() {
    if (!isPaused) {
        ants.forEach(ant => ant.update()); ants = ants.filter(ant => ant.alive);
    }
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height); ants.forEach(ant => ant.draw()); foods.forEach(food => {
        ctx.fillStyle = food.color; ctx.fillRect(food.x, food.y, 8, 8);
    });
}

function loop() {
    update(); draw(); updateStats(); requestAnimationFrame(loop);
}

// Event listeners addAntBtn.addEventListener('click', () => addAnt('normal')); addRedAntBtn.addEventListener('click', () => addAnt('red')); killRedAntsBtn.addEventListener('click', killAllRedAnts); pauseResumeBtn.addEventListener('click', () => { isPaused = !isPaused; pauseResumeBtn.textContent = isPaused ? 'Resume' : 'Pause'; });

matingSlider.addEventListener('input', () => {
    const value = matingSlider.value; matingLabel.textContent = value < 33 ? 'Low': value < 66 ? 'Moderate': 'High';
});

lifespanNormalSlider.addEventListener('input', () => {
    const secs = lifespanNormalSlider.value; lifespanLabelNormal.textContent = $ {
        Math.round(secs / 60)} minutes;
});

lifespanRedSlider.addEventListener('input', () => {
    const secs = lifespanRedSlider.value; lifespanLabelRed.textContent = $ {
        Math.round(secs / 60)} minutes;
});

canvas.addEventListener('click', e => {
    const rect = canvas.getBoundingClientRect(); const x = e.clientX - rect.left; const y = e.clientY - rect.top; const foodType = foodSelector.value; let color; switch (foodType) {
        case 'sugar': color = '#FFFFFF'; break; case 'protein': color = '#00FF00'; break; case 'spoiled': color = '#0000FF'; break; case 'poison': color = '#800080'; break;
    } foods.push({
            x, y, color
    });
});

muteToggleBtn.addEventListener('click', () => {
alert('Mute toggle not yet implemented.');
});

// Initialize loop();