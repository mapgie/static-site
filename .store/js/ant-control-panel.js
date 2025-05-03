import {
    matingSpeed,
    allowRedBreeding,
    setMatingSpeed,
    setAllowRedBreeding,
    killAllRedAnts,
    setLifespans,
    setMute
  } from './ant-core.js';
  import { BASE_NORMAL_LIFESPAN, BASE_RED_LIFESPAN } from './ant-constants.js';
  import { updateStats } from './ant-ui.js';
  // …then use BASE_NORMAL_LIFESPAN and BASE_RED_LIFESPAN to initialize the sliders
  

const matingSlider = document.getElementById('mating-slider');
const lifespanNormal = document.getElementById('lifespan-slider-normal');
const lifespanRed = document.getElementById('lifespan-slider-red');
const allowRed = document.getElementById('allow-red');
const killRedBtn = document.getElementById('kill-red');
const muteCheckbox = document.getElementById('mute');

matingSlider.value = matingSpeed;
lifespanNormal.value = BASE_NORMAL_LIFESPAN;
lifespanRed.value = BASE_RED_LIFESPAN;
allowRed.checked = allowRedBreeding;

matingSlider.addEventListener('input', e => {
  setMatingSpeed(Number(e.target.value));
});
lifespanNormal.addEventListener('input', e => {
  setLifespans(Number(e.target.value), null);
});
lifespanRed.addEventListener('input', e => {
  setLifespans(null, Number(e.target.value));
});
allowRed.addEventListener('change', e => {
  setAllowRedBreeding(e.target.checked);
});
killRedBtn.addEventListener('click', () => {
  killAllRedAnts();
  updateStats();
});
muteCheckbox.addEventListener('change', e => {
  setMute(e.target.checked);
});
