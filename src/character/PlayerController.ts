import * as THREE from 'three';

import {
  AIR_ACCELERATION,
  COYOTE_TIME,
  GRAVITY,
  GROUND_ACCELERATION,
  GROUND_DECELERATION,
  GROUND_SNAP,
  JUMP_BUFFER,
  JUMP_SPEED,
  MAX_SLOPE,
  MODEL_YAW_OFFSET,
  PLAYER_RADIUS,
  RUN_SPEED,
  STAMINA_DRAIN,
  STAMINA_MAX,
  STAMINA_REGEN,
  STAMINA_REGEN_DELAY,
  STAMINA_RUN_THRESHOLD,
  STEP_HEIGHT,
  TURN_RATE,
  WALK_SPEED,
} from '../config/constants';
import type { Ground } from '../world/Ground';
import type { Obstacles } from '../world/Obstacles';
import type { MoveIntent } from '../core/Input';
import type { LocomotionInput } from './LocomotionState';

export interface ControllerFrame {
  wantsRun: boolean;
  intent: Readonly<MoveIntent>;
  /** Jump was pressed on this frame. */
  jumpPressed: boolean;
  /** Where the camera looks: movement is measured from it. */
  cameraYaw: number;
}

/**
 * Player movement over the terrain.
 *
 * There is deliberately no physics engine (CLAUDE.md): for a hero who
 * walks on a heightmap, a downward ray is enough. The character is a
 * point on the surface, not a capsule: this slice has no walls, and
 * the terrain is handled by the slope check.
 */
export class PlayerController {
  readonly position = new THREE.Vector3();
  private readonly velocity = new THREE.Vector3();

  private grounded = false;
  private groundNormal = new THREE.Vector3(0, 1, 0);
  private stamina = STAMINA_MAX;
  private staminaHold = 0;
  private coyoteLeft = 0;
  private jumpBufferLeft = 0;
  private jumpedThisFrame = false;
  // The camera sits on the +Z side by default, and the model faces +Z.
  // Without this the character stares into the lens at spawn until you
  // start walking.
  private modelYaw = Math.PI;

  private readonly desired = new THREE.Vector3();
  private readonly horizontal = new THREE.Vector3();

  constructor(
    private readonly ground: Ground,
    private readonly obstacles: Obstacles,
    private readonly root: THREE.Object3D,
    spawnX: number,
    spawnZ: number,
  ) {
    const sample = this.ground.sample(spawnX, spawnZ);
    this.position.set(spawnX, sample?.height ?? 0, spawnZ);
    this.grounded = true;
    this.syncTransform();
  }

  /** Horizontal speed, m/s. */
  get speed(): number {
    return Math.hypot(this.velocity.x, this.velocity.z);
  }

  get staminaLeft(): number {
    return this.stamina;
  }

  get isGrounded(): boolean {
    return this.grounded;
  }

  /** State for the animation state machine. */
  get locomotion(): LocomotionInput {
    return {
      speed: this.speed,
      grounded: this.grounded,
      verticalSpeed: this.velocity.y,
      jumped: this.jumpedThisFrame,
    };
  }

  update(frame: ControllerFrame, delta: number): void {
    this.jumpedThisFrame = false;

    this.updateStamina(frame, delta);
    this.applyHorizontal(frame, delta);
    this.applyJump(frame, delta);
    this.integrate(delta);
    this.faceMovement(delta);
    this.syncTransform();
  }

  private updateStamina(frame: ControllerFrame, delta: number): void {
    const moving = frame.intent.x !== 0 || frame.intent.z !== 0;
    const draining = frame.wantsRun && moving && this.canRun();

    if (draining) {
      this.stamina = Math.max(0, this.stamina - STAMINA_DRAIN * delta);
      this.staminaHold = STAMINA_REGEN_DELAY;
      return;
    }

    // A short pause before regen kicks in: otherwise it pays to
    // machine-gun the shift key and run forever
    if (this.staminaHold > 0) {
      this.staminaHold -= delta;
      return;
    }
    this.stamina = Math.min(STAMINA_MAX, this.stamina + STAMINA_REGEN * delta);
  }

  /** At zero, running is blocked until stamina regrows past the threshold. */
  private canRun(): boolean {
    return this.stamina > 0 && (this.stamina >= STAMINA_RUN_THRESHOLD || this.staminaHold > 0);
  }

  private applyHorizontal(frame: ControllerFrame, delta: number): void {
    const { intent, cameraYaw } = frame;

    // Intent from camera axes to world axes: forward is where the camera looks
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    this.desired.set(
      intent.x * cos - intent.z * sin,
      0,
      -intent.x * sin - intent.z * cos,
    );

    const moving = this.desired.lengthSq() > 1e-6;
    const targetSpeed = moving
      ? (frame.wantsRun && this.canRun() ? RUN_SPEED : WALK_SPEED)
      : 0;

    this.desired.multiplyScalar(targetSpeed);

    this.horizontal.set(this.velocity.x, 0, this.velocity.z);
    const rate = this.grounded
      ? (moving ? GROUND_ACCELERATION : GROUND_DECELERATION)
      : AIR_ACCELERATION;

    // The same exponential approach as the camera: behaviour must
    // not depend on the frame rate
    const alpha = 1 - Math.exp(-rate * delta);
    this.horizontal.lerp(this.desired, alpha);

    if (this.horizontal.lengthSq() < 1e-4) this.horizontal.set(0, 0, 0);
    this.velocity.x = this.horizontal.x;
    this.velocity.z = this.horizontal.z;
  }

  private applyJump(frame: ControllerFrame, delta: number): void {
    if (frame.jumpPressed) this.jumpBufferLeft = JUMP_BUFFER;
    else if (this.jumpBufferLeft > 0) this.jumpBufferLeft -= delta;

    if (this.grounded) this.coyoteLeft = COYOTE_TIME;
    else if (this.coyoteLeft > 0) this.coyoteLeft -= delta;

    // Coyote time forgives a jump pressed slightly after stepping off
    // an edge; the buffer forgives one pressed slightly before landing.
    // Without them the jump feels finicky, even though it formally works
    if (this.jumpBufferLeft > 0 && this.coyoteLeft > 0) {
      this.velocity.y = JUMP_SPEED;
      this.grounded = false;
      this.jumpBufferLeft = 0;
      this.coyoteLeft = 0;
      this.jumpedThisFrame = true;
    }
  }

  private integrate(delta: number): void {
    // 1. Horizontal — with a check that we are not running into a slope
    const nextX = this.position.x + this.velocity.x * delta;
    const nextZ = this.position.z + this.velocity.z * delta;
    const ahead = this.ground.sample(nextX, nextZ);

    const blocked = ahead === null
      || (ahead.slope > MAX_SLOPE && ahead.height > this.position.y + STEP_HEIGHT);

    if (blocked) {
      // Ran into the valley wall or a hill that is too steep: kill
      // the horizontal speed, but don't get in the way of falling
      this.velocity.x = 0;
      this.velocity.z = 0;
    } else {
      this.position.x = nextX;
      this.position.z = nextZ;
      this.groundNormal.copy(ahead.normal);
    }

    // 2. Obstacles: the burrow door and villagers. Speed is not killed —
    //    along the circle the character should slide, not stick
    this.obstacles.resolve(this.position, PLAYER_RADIUS);

    // 3. Vertical
    this.velocity.y -= GRAVITY * delta;
    this.position.y += this.velocity.y * delta;

    // 4. Ground contact
    const below = this.ground.sample(this.position.x, this.position.z);
    if (below === null) return;

    if (this.position.y <= below.height) {
      this.position.y = below.height;
      this.velocity.y = 0;
      this.grounded = true;
      this.groundNormal.copy(below.normal);
      return;
    }

    // Running downhill: without snapping, the character lifts off on
    // every bump and the run turns into a string of little hops
    const gap = this.position.y - below.height;
    if (this.grounded && this.velocity.y <= 0 && gap < GROUND_SNAP) {
      this.position.y = below.height;
      this.velocity.y = 0;
      this.groundNormal.copy(below.normal);
      return;
    }

    this.grounded = false;
  }

  private faceMovement(delta: number): void {
    if (this.speed < 0.05) return;

    const targetYaw = Math.atan2(this.velocity.x, this.velocity.z) + MODEL_YAW_OFFSET;
    // Shortest way around the circle: without normalising, a 180°
    // turn could go the long way round
    let difference = targetYaw - this.modelYaw;
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));

    const alpha = 1 - Math.exp(-TURN_RATE * delta);
    this.modelYaw += difference * alpha;
  }

  private syncTransform(): void {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.modelYaw;
  }
}
