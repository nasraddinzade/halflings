// Клавиатура и мышь -> намерение игрока. Ни один другой модуль
// не подписывается на события ввода напрямую.

export interface MoveIntent {
  /** Влево-вправо относительно камеры, -1..1. */
  x: number;
  /** Вперёд-назад относительно камеры, -1..1. */
  z: number;
}

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space',
]);

export class Input {
  private readonly pressed = new Set<string>();
  private readonly intent: MoveIntent = { x: 0, z: 0 };

  /** Накопленное за кадр смещение мыши, обнуляется в endFrame(). */
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;

  /** Нажатие пробела живёт до тех пор, пока контроллер его не заберёт. */
  private jumpQueued = false;

  private locked = false;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly onLockChange?: (locked: boolean) => void,
  ) {
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);
    canvas.addEventListener('mousedown', this.requestLock);
    document.addEventListener('pointerlockchange', this.handleLockChange);
    document.addEventListener('mousemove', this.handleMouseMove);
  }

  get isRunHeld(): boolean {
    return this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight');
  }

  get isPointerLocked(): boolean {
    return this.locked;
  }

  /** Направление движения в осях камеры. Длина не больше единицы. */
  getMoveIntent(): Readonly<MoveIntent> {
    const forward = Number(this.pressed.has('KeyW') || this.pressed.has('ArrowUp'))
      - Number(this.pressed.has('KeyS') || this.pressed.has('ArrowDown'));
    const right = Number(this.pressed.has('KeyD') || this.pressed.has('ArrowRight'))
      - Number(this.pressed.has('KeyA') || this.pressed.has('ArrowLeft'));

    // По диагонали иначе получилось бы в 1.41 раза быстрее
    const length = Math.hypot(right, forward);
    if (length > 1) {
      this.intent.x = right / length;
      this.intent.z = forward / length;
    } else {
      this.intent.x = right;
      this.intent.z = forward;
    }
    return this.intent;
  }

  /** Забирает нажатие прыжка. Второй вызов в том же кадре вернёт false. */
  consumeJump(): boolean {
    if (!this.jumpQueued) return false;
    this.jumpQueued = false;
    return true;
  }

  getMouseDelta(): { x: number; y: number } {
    return { x: this.mouseDeltaX, y: this.mouseDeltaY };
  }

  /** Вызывается в конце кадра: смещение мыши накапливается покадрово. */
  endFrame(): void {
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.canvas.removeEventListener('mousedown', this.requestLock);
    document.removeEventListener('pointerlockchange', this.handleLockChange);
    document.removeEventListener('mousemove', this.handleMouseMove);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) return;
    if (MOVE_KEYS.has(event.code)) event.preventDefault();
    this.pressed.add(event.code);
    if (event.code === 'Space') this.jumpQueued = true;
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  /** Уход со вкладки не должен оставлять клавишу «залипшей». */
  private readonly handleBlur = (): void => {
    this.pressed.clear();
    this.jumpQueued = false;
  };

  private readonly requestLock = (): void => {
    if (this.locked) return;
    // Захват отклоняется штатно: кулдаун браузера после Esc, потеря фокуса,
    // встроенный фрейм. Без обработки это каждый раз падало бы в консоль
    // необработанным промисом.
    const result: unknown = this.canvas.requestPointerLock();
    if (result instanceof Promise) {
      result.catch((error: unknown) => {
        console.warn('[input] указатель не захвачен:', error);
      });
    }
  };

  private readonly handleLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    this.onLockChange?.(this.locked);
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return;
    this.mouseDeltaX += event.movementX;
    this.mouseDeltaY += event.movementY;
  };
}
