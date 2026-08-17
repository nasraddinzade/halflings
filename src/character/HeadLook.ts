import * as THREE from 'three';

import {
  NOTICE_EASE,
  NOTICE_FAR,
  NOTICE_NEAR,
  NOTICE_PITCH_LIMIT,
  NOTICE_YAW_FADE,
  NOTICE_YAW_LIMIT,
} from '../config/constants';

/**
 * Turns a villager's head to follow the player, on top of whatever clip
 * their body is playing.
 *
 * This is procedural animation layered over an authored one, and the
 * order it runs in is the whole trick. The mixer rewrites every bone's
 * local transform from scratch on each update, so a head turn applied
 * before mixer.update() is simply erased. It has to come after.
 *
 * The rotation has to be measured from where the head is ALREADY
 * pointing, not from where the body faces. The first version measured it
 * from the body and applied it on top of the clip, which double-counted
 * the clip's own contribution: a villager whose chest the clip had
 * twisted 29 degrees and pitched 23 overshot the player by 36, exactly
 * the combined size of those two.
 *
 * Knowing where the head points needs a forward axis, and rather than
 * guess which way the bone's local axes face, we read it out of the bind
 * pose once at construction: whichever local vector maps onto the body's
 * forward when nothing is animating is, by definition, the head's
 * forward. That makes the whole thing rig-agnostic.
 *
 * Applying it is the other half. A head bone's local rotation is relative
 * to the chest, and the chest is itself being moved by the clip, so a
 * world-space rotation cannot be written into the bone as if it were
 * local. With P the parent's world rotation and R the rotation we want in
 * world space, the same rotation in parent coordinates is P⁻¹ R P.
 * Blending is a slerp from identity to that, which is why the head eases
 * into a look instead of snapping to it.
 *
 * The layer keeps its own copy of the clip's pose and ASSIGNS the result
 * rather than accumulating onto the bone. It has to, because the mixer
 * cannot be relied on to put the clip pose back each frame:
 * PropertyMixer.apply() calls binding.setValue only when the blended
 * value differs from the previous frame's, and several clips in this pack
 * hold the head perfectly still — Walking_A and Fishing_Idle have two
 * identical keys, so the mixer writes the head bone on zero frames out of
 * three hundred, and even Digging writes on only 224. Premultiplying onto
 * a bone nothing resets is an integrator: the head winds up to the edge
 * of its cone and stays there for the rest of the villager's walk.
 */
export class HeadLook {
  private readonly head: THREE.Bone;
  private readonly parent: THREE.Object3D;

  /** Eased towards the target strength; never jumps. */
  private weight = 0;

  /**
   * Where to look, as angles RELATIVE TO THE BODY, rebuilt into a world
   * direction on every frame.
   *
   * Storing a world-space rotation instead is what made heads spin. Once
   * the player left the cone the aim stopped being recomputed, and the
   * held rotation was fixed in world axes while the villager kept turning
   * — and a rotation that is constant in the world is not constant
   * relative to a body that is rotating under it. A head that had eased
   * out to 41 degrees off the shoulders was at 117 two frames later, and
   * kept going.
   */
  private aimYaw = 0;
  private aimPitch = 0;
  private hasAim = false;

  /**
   * The head's own local vector that points where the body faces. Read
   * out of the bind pose, so nothing here assumes the bone's axes.
   */
  private readonly restForward = new THREE.Vector3();

  /**
   * The clip's own pose for the head, and the value this layer last wrote.
   * A new base is adopted only when the bone differs from what we left
   * there — which is exactly the test for "the mixer wrote this frame".
   */
  private readonly base = new THREE.Quaternion();
  private readonly lastWritten = new THREE.Quaternion();

  private readonly headWorld = new THREE.Vector3();
  private readonly headQuaternion = new THREE.Quaternion();
  private readonly parentWorld = new THREE.Quaternion();
  private readonly parentInverse = new THREE.Quaternion();
  private readonly facing = new THREE.Vector3();
  private readonly wanted = new THREE.Vector3();
  private readonly delta = new THREE.Quaternion();
  private readonly blended = new THREE.Quaternion();
  /** The world-space rotation the head would need at full strength. */
  private readonly turn = new THREE.Quaternion();

  private static readonly IDENTITY = new THREE.Quaternion();

  constructor(skeleton: THREE.Skeleton, root: THREE.Object3D) {
    const name = THREE.PropertyBinding.sanitizeNodeName('head');
    const head = skeleton.bones.find((bone) => bone.name === name);
    if (head === undefined) {
      throw new Error(`[headlook] no "${name}" bone in the skeleton`);
    }
    if (head.parent === null) {
      throw new Error('[headlook] the head bone has no parent to rotate against');
    }
    this.head = head;
    this.parent = head.parent;

    // Bind pose, before any clip has been applied: the head's orientation
    // relative to the body. Invert it and +Z — the way the model faces —
    // comes back as a vector in the head's own coordinates.
    root.updateMatrixWorld(true);
    const relative = root.getWorldQuaternion(new THREE.Quaternion()).invert()
      .multiply(head.getWorldQuaternion(new THREE.Quaternion()));
    this.restForward.set(0, 0, 1).applyQuaternion(relative.invert()).normalize();

    this.base.copy(head.quaternion);
    this.lastWritten.copy(head.quaternion);
  }

  /** True once the head has fully returned to the clip's own pose. */
  get idle(): boolean {
    return this.weight < 1e-3;
  }

  /**
   * Aims at `target`. Call after mixer.update(), and only when the
   * villager's world matrices are current — the parent's world rotation
   * is read straight off them.
   *
   * `bodyYaw` is the villager's own facing, which is what the cone is
   * measured against: a head is limited relative to its shoulders, not
   * relative to the world.
   */
  apply(target: THREE.Vector3 | null, bodyYaw: number, delta: number): void {
    // Adopt a new clip pose only if the bone is not still holding what we
    // put there. On a clip that keeps the head still the mixer never
    // writes, and taking the bone at face value would mean measuring our
    // own output and adding to it — the head would wind up and stay wound
    if (!this.head.quaternion.equals(this.lastWritten)) {
      this.base.copy(this.head.quaternion);
    }

    const strength = target === null ? 0 : this.aim(target, bodyYaw);

    // Frame-rate independent easing, the same shape the camera and the
    // controller use. Without it the head snaps the moment the player
    // crosses the radius
    this.weight += (strength - this.weight) * (1 - Math.exp(-NOTICE_EASE * delta));
    if (this.idle) {
      this.weight = 0;
      // Put the clip's own pose back before letting go. The caller stops
      // calling us once we are idle, and on a clip that never writes the
      // head there is nothing else left to undo the last look
      this.head.quaternion.copy(this.base);
      this.lastWritten.copy(this.base);
      return;
    }
    if (!this.hasAim) return;

    // Rebuilt from the CURRENT body yaw every frame, including while the
    // look is fading out. The aim is stored as body-relative angles for
    // exactly this reason.
    this.wanted.set(
      Math.sin(bodyYaw + this.aimYaw) * Math.cos(this.aimPitch),
      Math.sin(this.aimPitch),
      Math.cos(bodyYaw + this.aimYaw) * Math.cos(this.aimPitch),
    );

    this.parent.getWorldQuaternion(this.parentWorld);
    this.parentInverse.copy(this.parentWorld).invert();

    // The head's world orientation AT THE CLIP POSE, composed rather than
    // read off matrixWorld: matrixWorld still carries last frame's look,
    // and measuring from that is the same mistake as accumulating
    this.headQuaternion.copy(this.parentWorld).multiply(this.base);
    this.facing.copy(this.restForward).applyQuaternion(this.headQuaternion).normalize();
    // Facing and target dead opposite leaves the axis of rotation
    // undefined, and setFromUnitVectors then picks one arbitrarily —
    // which flips frame to frame. The cone should make this unreachable;
    // skipping a frame is the right answer if it ever is reached
    if (this.facing.dot(this.wanted) < -0.999) return;
    this.turn.setFromUnitVectors(this.facing, this.wanted);

    // P⁻¹ R P — the same rotation, read in the parent's frame
    this.delta.copy(this.parentInverse).multiply(this.turn).multiply(this.parentWorld);
    this.blended.copy(HeadLook.IDENTITY).slerp(this.delta, this.weight);

    // Assignment from the stored clip pose, never accumulation onto the
    // bone: the result must be the same whether or not the mixer wrote
    this.head.quaternion.copy(this.base).premultiply(this.blended);
    this.lastWritten.copy(this.head.quaternion);
  }

  private aim(target: THREE.Vector3, bodyYaw: number): number {
    this.head.getWorldPosition(this.headWorld);

    const dx = target.x - this.headWorld.x;
    const dz = target.z - this.headWorld.z;
    const dy = target.y - this.headWorld.y;
    const flat = Math.hypot(dx, dz);
    if (flat < 1e-4) return 0;

    // Where the player stands relative to the way this villager faces
    let yaw = Math.atan2(dx, dz) - bodyYaw;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));

    // The aim is recorded whatever the strength turns out to be. A look
    // that is fading still has to fade towards somewhere sensible, and
    // the clamped direction is that somewhere — leaving the previous
    // frame's aim in place instead is what let heads run away.
    this.aimYaw = clamp(yaw, -NOTICE_YAW_LIMIT, NOTICE_YAW_LIMIT);
    this.aimPitch = clamp(Math.atan2(dy, flat), -NOTICE_PITCH_LIMIT, NOTICE_PITCH_LIMIT);
    this.hasAim = true;

    // Beyond NOTICE_FAR nobody looks up; inside NOTICE_NEAR everybody does
    const byDistance = 1 - smoothstep(NOTICE_NEAR, NOTICE_FAR, Math.hypot(flat, dy));
    // Past the cone the look fades out rather than staying pinned at the
    // limit: a head cranked hard sideways and held there reads as a stare
    const byCone = 1 - smoothstep(NOTICE_YAW_LIMIT, NOTICE_YAW_FADE, Math.abs(yaw));
    return byDistance * byCone;
  }
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
