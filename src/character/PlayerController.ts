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
  STEP_HEIGHT,
  STEP_REACH,
  TURN_RATE,
  WADE_FULL_DEPTH,
  WADE_SPEED,
  WALK_SPEED,
} from '../config/constants';
import { waterDepthAt } from '../world/heightfield';
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
  /** Surface that refused the last step; only valid when blockedBySlope. */
  private readonly blockedNormal = new THREE.Vector3(0, 1, 0);
  private blockedBySlope = false;
  private coyoteLeft = 0;
  private jumpBufferLeft = 0;
  private jumpedThisFrame = false;
  /** Touched down on this frame. The camera dips on it. */
  private landedThisFrame = false;
  /** 0 on dry land, 1 in the deepest part of the channel. */
  private wade = 0;
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

  get justLanded(): boolean {
    return this.landedThisFrame;
  }

  /** 0 on dry land, 1 in the deepest water. */
  get wadeDepth(): number {
    return this.wade;
  }

  /** 0 at a walk, 1 at a full run. The camera widens a little on it. */
  get runFraction(): number {
    const span = RUN_SPEED - WALK_SPEED;
    if (span <= 0) return 0;
    return Math.min(1, Math.max(0, (this.speed - WALK_SPEED) / span));
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
    this.landedThisFrame = false;

    // Measured from the analytic height field rather than from the water
    // mesh: the ribbon is drawn a little wider than the channel so its
    // edge tucks under the bank, and raycasting it would call that overlap
    // water when it is buried in the ground.
    //
    // Only while the feet are on the bed. A jump lifts them clear of the
    // surface for about 0.2 s of its 0.48, and a wade that vanished along
    // with them handed the full run speed straight back — holding space
    // crossed the river in 4.05 s against 7.40 s of honest wading.
    if (this.grounded) {
      const depth = waterDepthAt(this.position.x, this.position.z, this.position.y);
      this.wade = Math.min(1, depth / WADE_FULL_DEPTH);
    }

    this.applyHorizontal(frame, delta);
    this.applyJump(frame, delta);
    this.integrate(delta);
    this.faceMovement(delta);
    this.syncTransform();
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
    // Water replaces the target speed rather than scaling it, so wading
    // deep is the same slow whether or not Shift is held
    const onFoot = frame.wantsRun ? RUN_SPEED : WALK_SPEED;
    const targetSpeed = moving ? onFoot + (WADE_SPEED - onFoot) * this.wade : 0;

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
    if (!this.tryStep(this.velocity.x, this.velocity.z, delta)) this.slideAlongSlope(delta);

    // 2. Obstacles: the burrow door and villagers. Speed is not killed —
    //    along the circle the character should slide, not stick
    this.obstacles.resolve(this.position, PLAYER_RADIUS);

    // 3. Vertical
    this.velocity.y -= GRAVITY * delta;
    this.position.y += this.velocity.y * delta;

    // 4. Ground contact
    // The feet's own height goes in: it is what decides whether the
    // footbridge's deck is the surface underfoot or a thing overhead
    const below = this.ground.sample(this.position.x, this.position.z, this.position.y);
    if (below === null) return;

    if (this.position.y <= below.height) {
      this.position.y = below.height;
      this.velocity.y = 0;
      // Only a real touchdown counts. Ground-snap below keeps `grounded`
      // true over bumps, so it never fires there
      this.landedThisFrame = !this.grounded;
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

  /**
   * Moves by (vx, vz) if the ground there can be stood on. Leaves the
   * position alone and returns false if it cannot, recording what
   * refused so the caller can slide along it.
   */
  private tryStep(vx: number, vz: number, delta: number): boolean {
    const nextX = this.position.x + vx * delta;
    const nextZ = this.position.z + vz * delta;
    const ahead = this.ground.sample(nextX, nextZ, this.position.y);

    if (ahead === null) {
      // Off the edge of the terrain geometry entirely — there is no
      // surface here to slide along
      this.blockedBySlope = false;
      return false;
    }

    // The rise is measured over a FIXED distance, not over one frame's
    // travel. It used to be `ahead.height > this.position.y + STEP_HEIGHT`,
    // where `ahead` is sampled at `position + v * delta` — three
    // centimetres at 120 fps. That made the real ceiling
    // atan(STEP_HEIGHT / stride) = 78.7 degrees, so MAX_SLOPE was ANDed
    // with a test strictly looser than itself and could never fire: the
    // player ran up the 64.6-degree rim at 7.6 m/s of climb and straight
    // off the edge of the terrain plane, where he stopped against nothing.
    // `slideAlongSlope` below — whose own comment says it is what makes
    // decision #4 hold — was unreachable code.
    //
    // The probe only runs on ground already steeper than MAX_SLOPE, which
    // is essentially nowhere inside the valley, so it costs nothing.
    if (ahead.slope > MAX_SLOPE) {
      const speed = Math.hypot(vx, vz);
      const probe = speed > 1e-6
        ? this.ground.sample(
          this.position.x + (vx / speed) * STEP_REACH,
          this.position.z + (vz / speed) * STEP_REACH,
          this.position.y,
        )
        : null;
      // A 0.15 m lip that levels off still passes: the probe lands on the
      // flat top. Three tenths of a metre of the rim rises 0.63 m
      if (probe === null || probe.height > this.position.y + STEP_HEIGHT) {
        this.blockedBySlope = true;
        this.blockedNormal.copy(ahead.normal);
        return false;
      }
    }

    this.position.x = nextX;
    this.position.z = nextZ;
    this.groundNormal.copy(ahead.normal);
    return true;
  }

  /**
   * Ran into a hill too steep to climb. Do not stop dead: strip the part
   * of the velocity that pushes into the slope and keep the part that
   * runs along it.
   *
   * This is what makes decision #4 hold. The valley border is the rim
   * itself, with no invisible walls — but a border that stops you the
   * instant you graze it at an angle feels exactly like one. Obstacle
   * circles already slide (see resolve() below); slopes were the odd
   * one out.
   */
  private slideAlongSlope(delta: number): void {
    const stop = (): void => {
      this.velocity.x = 0;
      this.velocity.z = 0;
    };

    if (!this.blockedBySlope) {
      stop();
      return;
    }

    // Horizontal part of the surface normal — the direction the hill
    // pushes back in. On anything steep enough to block it is far from
    // zero, but a degenerate face would divide by nothing
    const length = Math.hypot(this.blockedNormal.x, this.blockedNormal.z);
    if (length < 1e-4) {
      stop();
      return;
    }

    const ux = this.blockedNormal.x / length;
    const uz = this.blockedNormal.z / length;
    const into = this.velocity.x * ux + this.velocity.z * uz;
    const slideX = this.velocity.x - ux * into;
    const slideZ = this.velocity.z - uz * into;

    // Head-on into the hill leaves nothing to slide with, and a corner
    // can put a second wall across the new direction. Then stopping is
    // the right answer after all
    if (this.tryStep(slideX, slideZ, delta)) {
      this.velocity.x = slideX;
      this.velocity.z = slideZ;
      return;
    }
    stop();
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
