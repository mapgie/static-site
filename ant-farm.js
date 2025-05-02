
/* ant-farm.js */
class Ant {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = Math.random() * 2 - 1;
        this.vy = Math.random() * 2 - 1;
        this.size = 5;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fillStyle = 'black';
        ctx.fill();
    }
}

const canvas = document.getElementById('antCanvas');
const ctx = canvas.getContext('2d');
let ants = [];

window.addEventListener('resize', resizeCanvas);
resizeCanvas();

window.addEventListener('message', (event) => {
    if (event.data.action === 'addAnt') {
        ants.push(new Ant(Math.random() * canvas.width, Math.random() * canvas.height));
    }
});

function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ants.forEach(ant => {
        ant.update();
        ant.draw(ctx);
    });
    requestAnimationFrame(animate);
}

animate();

