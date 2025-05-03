export function updateStats() {
  const statsEl = document.getElementById('stats');
  if (!statsEl) return;
  statsEl.innerText = `Ants Alive: ${ants.length} | Born: ${totalBorn} | Dead: ${totalDead}`;
}

export function updateMatingLabel(value) {
  const label = document.getElementById('mating-label');
  if (!label) return;
  label.innerText = value <= 20 ? 'Awful' : value <= 50 ? 'Moderate' : 'Optimal';
}

export function updateLifespanLabelNormal(value) {
  const label = document.getElementById('lifespan-label-normal');
  if (!label) return;
  label.innerText = `${Math.round(value/60)} min`;
}

export function updateLifespanLabelRed(value) {
  const label = document.getElementById('lifespan-label-red');
  if (!label) return;
  label.innerText = `${Math.round(value/60)} min`;
}

export function getFoodColor(type) {
  switch (type) {
    case 'sugar': return 'white';
    case 'protein': return 'green';
    case 'spoiled': return 'blue';
    case 'poison': return 'purple';
    default: return 'white';
  }
}