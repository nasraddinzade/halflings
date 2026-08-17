// Keyboard and mouse -> player intent. No other module subscribes to
// input events directly.

export interface MoveIntent {
  /** Left-right relative to the camera, -1..1. */
  x: number;
  /** Forward-back relative to the camera, -1..1. */
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

  /** Wheel notches this frame. Positive pushes the camera away. */
  getWheelNotches(): number {
    return this.wheelNotches;
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
    if (event.repeat) return;
    if (MOVE_KEYS.has(event.code)) event.preventDefault();
    this.pressed.add(event.code);
    if (event.code === 'Space') this.jumpQueued = true;
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
    // deltaMode differs by browser and by device — pixels on a trackpad,
    // lines on a wheel. Only the sign is portable, so take just that and
    // let the camera decide how far a notch is
    this.wheelNotches += Math.sign(event.deltaY);
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
