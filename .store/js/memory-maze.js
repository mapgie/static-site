
const canvas = document.getElementById('maze');
const ctx = canvas.getContext('2d');
let width = window.innerWidth;
let height = window.innerHeight;
canvas.width = width;
canvas.height = height;

const COLS = 20;
const ROWS = 20;
const CELL_SIZE = Math.min(width, height) / Math.max(COLS, ROWS);

const maze = [];
const stack = [];

const player = {
  x: 0,
  y: 0
};

function Cell(x, y) {
  this.x = x;
  this.y = y;
  this.walls = { top: true, right: true, bottom: true, left: true };
  this.visited = false;
}

function index(x, y) {
  if (x < 0 || y < 0 || x >= COLS || y >= ROWS) return -1;
  return x + y * COLS;
}

function generateMaze() {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      maze.push(new Cell(x, y));
    }
  }

  let current = maze[0];
  current.visited = true;
  stack.push(current);

  while (stack.length > 0) {
    let next = checkNeighbors(current);

    if (next) {
      next.visited = true;
      stack.push(current);
      removeWalls(current, next);
      current = next;
    } else {
      current = stack.pop();
    }
  }
}

function checkNeighbors(cell) {
  const neighbors = [];

  const top = maze[index(cell.x, cell.y - 1)];
  const right = maze[index(cell.x + 1, cell.y)];
  const bottom = maze[index(cell.x, cell.y + 1)];
  const left = maze[index(cell.x - 1, cell.y)];

  if (top && !top.visited) neighbors.push(top);
  if (right && !right.visited) neighbors.push(right);
  if (bottom && !bottom.visited) neighbors.push(bottom);
  if (left && !left.visited) neighbors.push(left);

  if (neighbors.length > 0) {
    return neighbors[Math.floor(Math.random() * neighbors.length)];
  } else {
    return undefined;
  }
}

function removeWalls(a, b) {
  const x = a.x - b.x;
  if (x === 1) {
    a.walls.left = false;
    b.walls.right = false;
  } else if (x === -1) {
    a.walls.right = false;
    b.walls.left = false;
  }

  const y = a.y - b.y;
  if (y === 1) {
    a.walls.top = false;
    b.walls.bottom = false;
  } else if (y === -1) {
    a.walls.bottom = false;
    b.walls.top = false;
  }
}

function drawMaze() {
  ctx.clearRect(0, 0, width, height);
  ctx.strokeStyle = '#fff';

  for (let cell of maze) {
    const x = cell.x * CELL_SIZE;
    const y = cell.y * CELL_SIZE;

    ctx.beginPath();
    if (cell.walls.top) {
      ctx.moveTo(x, y);
      ctx.lineTo(x + CELL_SIZE, y);
    }
    if (cell.walls.right) {
      ctx.moveTo(x + CELL_SIZE, y);
      ctx.lineTo(x + CELL_SIZE, y + CELL_SIZE);
    }
    if (cell.walls.bottom) {
      ctx.moveTo(x + CELL_SIZE, y + CELL_SIZE);
      ctx.lineTo(x, y + CELL_SIZE);
    }
    if (cell.walls.left) {
      ctx.moveTo(x, y + CELL_SIZE);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = 'lime';
  ctx.fillRect(player.x * CELL_SIZE + CELL_SIZE/4, player.y * CELL_SIZE + CELL_SIZE/4, CELL_SIZE/2, CELL_SIZE/2);

  ctx.fillStyle = 'red';
  ctx.fillRect((COLS-1) * CELL_SIZE + CELL_SIZE/4, (ROWS-1) * CELL_SIZE + CELL_SIZE/4, CELL_SIZE/2, CELL_SIZE/2);
}

function movePlayer(dx, dy) {
  const current = maze[index(player.x, player.y)];
  if (dx === -1 && !current.walls.left) player.x--;
  if (dx === 1 && !current.walls.right) player.x++;
  if (dy === -1 && !current.walls.top) player.y--;
  if (dy === 1 && !current.walls.bottom) player.y++;

  drawMaze();
  moves++;

  if (moves % 10 === 0) {
    shuffleMaze();
  }

  if (player.x === COLS-1 && player.y === ROWS-1) {
    document.getElementById('message').style.display = 'block';
    document.getElementById('message').innerText = "You escaped the memory maze!";
  }
}

function shuffleMaze() {
  for (let i = 0; i < 10; i++) {
    const cellA = maze[Math.floor(Math.random() * maze.length)];
    const neighbors = [];
    const top = maze[index(cellA.x, cellA.y - 1)];
    const right = maze[index(cellA.x + 1, cellA.y)];
    const bottom = maze[index(cellA.x, cellA.y + 1)];
    const left = maze[index(cellA.x - 1, cellA.y)];

    if (top) neighbors.push(top);
    if (right) neighbors.push(right);
    if (bottom) neighbors.push(bottom);
    if (left) neighbors.push(left);

    if (neighbors.length > 0) {
      const cellB = neighbors[Math.floor(Math.random() * neighbors.length)];
      removeWalls(cellA, cellB);
    }
  }
}

let moves = 0;

generateMaze();
drawMaze();

window.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowUp') movePlayer(0, -1);
  if (e.key === 'ArrowDown') movePlayer(0, 1);
  if (e.key === 'ArrowLeft') movePlayer(-1, 0);
  if (e.key === 'ArrowRight') movePlayer(1, 0);
});

document.getElementById('up').addEventListener('click', () => movePlayer(0, -1));
document.getElementById('down').addEventListener('click', () => movePlayer(0, 1));
document.getElementById('left').addEventListener('click', () => movePlayer(-1, 0));
document.getElementById('right').addEventListener('click', () => movePlayer(1, 0));

let touchStartX = 0;
let touchStartY = 0;
canvas.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
  touchStartY = e.changedTouches[0].screenY;
}, false);

canvas.addEventListener('touchend', (e) => {
  let dx = e.changedTouches[0].screenX - touchStartX;
  let dy = e.changedTouches[0].screenY - touchStartY;

  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > 30) movePlayer(1, 0);
    else if (dx < -30) movePlayer(-1, 0);
  } else {
    if (dy > 30) movePlayer(0, 1);
    else if (dy < -30) movePlayer(0, -1);
  }
}, false);

window.addEventListener('resize', () => {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width;
  canvas.height = height;
  drawMaze();
});