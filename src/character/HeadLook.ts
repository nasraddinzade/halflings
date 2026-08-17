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
 */
export class HeadLook {
  private readonly head: THREE.Bone;
  private readonly parent: THREE.Object3D;

  /** Eased towards the target strength; never jumps. */
  private weight = 0;

  /**
   * The head's own local vector that points where the body faces. Read
   * out of the bind pose, so nothing here assumes the bone's axes.
   */
  private readonly restForward = new THREE.Vector3();

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
    const strength = target === null ? 0 : this.aim(target, bodyYaw);

    // Frame-rate independent easing, the same shape the camera and the
    // controller use. Without it the head snaps the moment the player
    // crosses the radius
    this.weight += (strength - this.weight) * (1 - Math.exp(-NOTICE_EASE * delta));
    if (this.idle) {
      this.weight = 0;
      return;
    }

    this.parent.getWorldQuaternion(this.parentWorld);
    this.parentInverse.copy(this.parentWorld).invert();

    // P⁻¹ R P — the same rotation, read in the parent's frame
    this.delta.copy(this.parentInverse).multiply(this.turn).multiply(this.parentWorld);
    this.blended.copy(HeadLook.IDENTITY).slerp(this.delta, this.weight);
    this.head.quaternion.premultiply(this.blended);
  }

  private aim(target: THREE.Vector3, bodyYaw: number): number {
    this.head.getWorldPosition(this.headWorld);

    const dx = target.x - this.headWorld.x;
    const dz = target.z - this.headWorld.z;
    const dy = target.y - this.headWorld.y;
    const flat = Math.hypot(dx, dz);
    if (flat < 1e-4) return 0;

    const distance = Math.hypot(flat, dy);
    // Beyond NOTICE_FAR nobody looks up; inside NOTICE_NEAR everybody does
    const byDistance = 1 - smoothstep(NOTICE_NEAR, NOTICE_FAR, distance);
    if (byDistance <= 0) return 0;

    // Where the player stands relative to the way this villager faces
    let yaw = Math.atan2(dx, dz) - bodyYaw;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));

    // Past the cone the look fades out rather than staying pinned at the
    // limit: a head cranked hard sideways and held there reads as a stare
    const byCone = 1 - smoothstep(NOTICE_YAW_LIMIT, NOTICE_YAW_FADE, Math.abs(yaw));
    if (byCone <= 0) return 0;

    // The direction to aim, in world space, after the cone has had its
    // say. Built from angles rather than from the raw vector so the clamp
    // is expressed in the terms it was written in.
    const aimYaw = bodyYaw + clamp(yaw, -NOTICE_YAW_LIMIT, NOTICE_YAW_LIMIT);
    const aimPitch = clamp(Math.atan2(dy, flat), -NOTICE_PITCH_LIMIT, NOTICE_PITCH_LIMIT);
    this.wanted.set(
      Math.sin(aimYaw) * Math.cos(aimPitch),
      Math.sin(aimPitch),
      Math.cos(aimYaw) * Math.cos(aimPitch),
    );

    // Where the head points right now, clip and all. Measuring the turn
    // from here rather than from the body's facing is the whole fix: the
    // clip has already moved the head, and that movement must be taken
    // off, not added to.
    this.head.getWorldQuaternion(this.headQuaternion);
    this.facing.copy(this.restForward).applyQuaternion(this.headQuaternion).normalize();
    this.turn.setFromUnitVectors(this.facing, this.wanted);

    return byDistance * byCone;
  }
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
