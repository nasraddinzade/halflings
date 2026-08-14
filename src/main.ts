import { Game } from './core/Game';

const canvas = document.getElementById('viewport');
const hint = document.getElementById('hint');

if (!(canvas instanceof HTMLCanvasElement) || hint === null) {
  throw new Error('[main] в разметке нет #viewport или #hint');
}

const game = new Game(canvas, hint);
await game.load();
game.start();

// Vite подменяет модули на лету — без этого каждое сохранение оставляло бы
// позади живой цикл, свой рендерер и свои слушатели событий
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
