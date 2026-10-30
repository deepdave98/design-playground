import { createSandClouds } from './smoke.js';

const canvas = document.querySelector('.smoke');
const motion = document.querySelector('#motion');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let paused = reducedMotion.matches;

if (new URLSearchParams(location.search).has('embed')) {
  document.documentElement.dataset.embed = '';
}

function fit() {
  const scale = Math.max(innerWidth / 1920, innerHeight / 1080);
  document.documentElement.style.setProperty('--scale', scale);
}

fit();

const fog = createSandClouds(canvas, {
  maxBackingWidth: 1920,
  textX0: 148,
  textX1: 1772,
});

function syncPlayback() {
  motion.textContent = paused ? 'Play' : 'Pause';
  motion.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
  if (document.hidden) {
    fog.stop();
  } else if (paused) {
    fog.stop();
    fog.renderOnce();
  } else {
    fog.start();
  }
}

motion.hidden = false;
motion.addEventListener('click', () => {
  paused = !paused;
  syncPlayback();
});

reducedMotion.addEventListener('change', (event) => {
  paused = event.matches;
  syncPlayback();
});

document.addEventListener('visibilitychange', syncPlayback);
addEventListener('resize', () => {
  fit();
  if (!document.hidden) fog.renderOnce();
});
addEventListener('pagehide', (event) => {
  if (event.persisted) fog.stop();
  else fog.destroy();
});
addEventListener('pageshow', (event) => {
  if (event.persisted) syncPlayback();
});

syncPlayback();
