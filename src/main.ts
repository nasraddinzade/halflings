import { Game } from './core/Game';

const canvas = document.getElementById('viewport');
const hint = document.getElementById('hint');

if (!(canvas instanceof HTMLCanvasElement) || hint === null) {
  throw new Error('[main] в разметке нет #viewport или #hint');
}

const game = new Game(canvas, hint);
await game.load();
game.start();

// Vite swaps modules on the fly — without this, every save would leave
// behind a live loop with its own renderer and its own event listeners
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
