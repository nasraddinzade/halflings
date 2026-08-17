// Keyboard and mouse -> player intent. No other module subscribes to
// input events directly.

export interface MoveIntent {
  /** Left-right relative to the camera, -1..1. */
  x: number;
  /** Forward-back relative to the camera, -1..1. */
  z: number;
}

/** Firefox reports wheel deltas in lines; three of them make one detent. */
const LINE_HEIGHT = 33.3;
/** What one detent of a mouse wheel is worth, in Chrome's pixels. */
const PIXELS_PER_NOTCH = 100;

const MOVE_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight',
  'ShiftLeft', 'ShiftRight', 'Space',
]);

export class Input {
  private readonly pressed = new Set<string>();
  private readonly intent: MoveIntent = { x: 0, z: 0 };

  /** Mouse movement accumulated over the frame, cleared in endFrame(). */
  private mouseDeltaX = 0;
  private mouseDeltaY = 0;
  /** Wheel notches accumulated over the frame, same lifetime as the above. */
  private wheelNotches = 0;

  /** A space press lives until the controller picks it up. */
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
    // Not passive: the page must not scroll behind the canvas
    canvas.addEventListener('wheel', this.handleWheel, { passive: false });
    document.addEventListener('pointerlockchange', this.handleLockChange);
    document.addEventListener('mousemove', this.handleMouseMove);
  }

  get isRunHeld(): boolean {
    return this.pressed.has('ShiftLeft') || this.pressed.has('ShiftRight');
  }

  get isPointerLocked(): boolean {
    return this.locked;
  }

  /** Movement direction in camera axes. Length never exceeds one. */
  getMoveIntent(): Readonly<MoveIntent> {
    const forward = Number(this.pressed.has('KeyW') || this.pressed.has('ArrowUp'))
      - Number(this.pressed.has('KeyS') || this.pressed.has('ArrowDown'));
    const right = Number(this.pressed.has('KeyD') || this.pressed.has('ArrowRight'))
      - Number(this.pressed.has('KeyA') || this.pressed.has('ArrowLeft'));

    // Otherwise moving diagonally would be 1.41 times faster
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

  /** Takes the jump press. A second call in the same frame returns false. */
  consumeJump(): boolean {
    if (!this.jumpQueued) return false;
    this.jumpQueued = false;
    return true;
  }

  getMouseDelta(): { x: number; y: number } {
    return { x: this.mouseDeltaX, y: this.mouseDeltaY };
  }

  /**
   * Wheel notches this frame. Positive pushes the camera away.
   * Capped: a burst that lands across a stalled frame must not teleport
   * the boom from one clamp to the other.
   */
  getWheelNotches(): number {
    return Math.max(-1, Math.min(1, this.wheelNotches));
  }

  /** Called at the end of a frame: mouse movement accumulates per frame. */
  endFrame(): void {
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.wheelNotches = 0;
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    this.canvas.removeEventListener('mousedown', this.requestLock);
    this.canvas.removeEventListener('wheel', this.handleWheel);
    document.removeEventListener('pointerlockchange', this.handleLockChange);
    document.removeEventListener('mousemove', this.handleMouseMove);
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (MOVE_KEYS.has(event.code)) event.preventDefault();
    // Autorepeat has to reach the set, not be dropped before it.
    // handleLockChange clears everything on Esc, and a key still held
    // across that never sends another non-repeat keydown — an early
    // return here would leave it dead until physically released.
    this.pressed.add(event.code);
    // Shift does not autorepeat, so it cannot heal itself the same way
    if (event.getModifierState('Shift')) this.pressed.add('ShiftLeft');
    // The repeat guard only ever existed to stop a held space bar
    // queueing a jump every few milliseconds
    if (event.code === 'Space' && !event.repeat) this.jumpQueued = true;
  };

  private readonly handleKeyUp = (event: KeyboardEvent): void => {
    this.pressed.delete(event.code);
  };

  /** Leaving the tab must not leave a key "stuck" down. */
  private readonly handleBlur = (): void => {
    this.pressed.clear();
    this.jumpQueued = false;
  };

  private readonly requestLock = (): void => {
    if (this.locked) return;
    // The lock gets rejected as a matter of course: the browser cooldown
    // after Esc, lost focus, an embedded frame. Unhandled, that would land
    // in the console as an unhandled promise rejection every time.
    const result: unknown = this.canvas.requestPointerLock();
    if (result instanceof Promise) {
      result.catch((error: unknown) => {
        console.warn('[input] pointer lock not acquired:', error);
      });
    }
  };

  private readonly handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    // deltaMode differs by device, and so does the event RATE. A detented
    // wheel sends one event per notch; a trackpad sends a burst of small
    // ones every frame plus momentum. Counting events would make the
    // whole 4.8 m of boom travel a single flick on a laptop, so normalise
    // the magnitude to pixels — a detent is about 100 of them — instead
    // of taking only the sign.
    const pixels = event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? event.deltaY * LINE_HEIGHT
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? event.deltaY * window.innerHeight
        : event.deltaY;
    this.wheelNotches += pixels / PIXELS_PER_NOTCH;
  };

  private readonly handleLockChange = (): void => {
    this.locked = document.pointerLockElement === this.canvas;
    // Releasing the pointer must also release the keys. Otherwise a key
    // held at the moment of Esc stays held — its keyup lands outside the
    // lock — and the character walks off on his own
    if (!this.locked) {
      this.pressed.clear();
      this.jumpQueued = false;
    }
    this.onLockChange?.(this.locked);
  };

  private readonly handleMouseMove = (event: MouseEvent): void => {
    if (!this.locked) return;
    this.mouseDeltaX += event.movementX;
    this.mouseDeltaY += event.movementY;
  };
}
