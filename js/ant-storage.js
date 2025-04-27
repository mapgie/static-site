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

function loadFarm() {
  const saved = localStorage.getItem(SAVE_KEY);
  if (saved) {
    const data = JSON.parse(saved);
    ants = data.ants || [];
    foods = data.foods || [];
    totalBorn = data.totalBorn || 0;
    totalDead = data.totalDead || 0;
    matingSpeed = data.matingSpeed || 5000;
    normalAntLifespan = data.normalAntLifespan || BASE_NORMAL_LIFESPAN;
    redAntLifespan = data.redAntLifespan || BASE_RED_LIFESPAN;
    allowRedBreeding = data.allowRedBreeding !== undefined ? data.allowRedBreeding : true;
    updateStats();
  }
}