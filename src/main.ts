import { Game } from './core/Game';

const canvas = document.getElementById('viewport');
const hint = document.getElementById('hint');
const loading = document.getElementById('loading');
const loadingText = document.getElementById('loading-text');

if (!(canvas instanceof HTMLCanvasElement)
  || hint === null || loading === null || loadingText === null) {
  throw new Error('[main] the markup is missing #viewport, #hint or #loading');
}

const game = new Game(canvas, hint);

// Loading is the one failure this project has to show on screen rather
// than only in the console. It is a link people open cold, and a dark
// rectangle tells a visitor nothing about whether it is broken or slow.
try {
  await game.load();
  loading.hidden = true;
  hint.hidden = false;
  game.start();
} catch (error) {
  loading.classList.add('failed');
  loadingText.textContent = 'the valley failed to load — see the console';
  console.error('[main] load failed:', error);
}

// Vite swaps modules on the fly — without this, every save would leave
// behind a live loop with its own renderer and its own event listeners
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
