import * as THREE from 'three';

import {
  CAMERA_COLLISION_PADDING,
  CAMERA_DISTANCE,
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_LAG,
  CAMERA_MAX_PITCH,
  CAMERA_MIN_PITCH,
  CAMERA_NEAR,
  CAMERA_TARGET_HEIGHT,
  MOUSE_SENSITIVITY,
} from '../config/constants';
import type { Ground } from '../world/Ground';

/**
 * Third-person camera on a "spring rig".
 *
 * What gets smoothed is not the camera position but the point it follows:
 * if the camera itself lags, mouse rotation makes the picture drift behind
 * the input and the controls feel sluggish. This way turning responds
 * instantly, while catching up with a running character stays soft.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private yaw = 0;
  private pitch = 0.18;

  private readonly smoothTarget = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private initialised = false;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(
      CAMERA_FOV,
      window.innerWidth / window.innerHeight,
      CAMERA_NEAR,
      CAMERA_FAR,
    );
  }

  /** Camera heading in the horizontal plane: movement is measured from it. */
  get yawAngle(): number {
    return this.yaw;
  }

  setAspect(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  rotate(deltaX: number, deltaY: number): void {
    this.yaw -= deltaX * MOUSE_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(
      this.pitch + deltaY * MOUSE_SENSITIVITY,
      CAMERA_MIN_PITCH,
      CAMERA_MAX_PITCH,
    );
  }

  update(playerPosition: THREE.Vector3, ground: Ground, delta: number): void {
    this.desiredTarget.set(
      playerPosition.x,
      playerPosition.y + CAMERA_TARGET_HEIGHT,
      playerPosition.z,
    );

    if (!this.initialised) {
      this.smoothTarget.copy(this.desiredTarget);
      this.initialised = true;
    } else {
      // Frame-rate independent exponential smoothing: with a plain
      // lerp(t) the camera would catch up twice as fast at 144 Hz as at
      // 60, and the feel of the controls would depend on the monitor
      const alpha = 1 - Math.exp(-CAMERA_LAG * delta);
      this.smoothTarget.lerp(this.desiredTarget, alpha);
    }

    // A point on the sphere around the target: up by pitch, around by yaw
    const horizontal = Math.cos(this.pitch) * CAMERA_DISTANCE;
    this.offset.set(
      Math.sin(this.yaw) * horizontal,
      Math.sin(this.pitch) * CAMERA_DISTANCE,
      Math.cos(this.yaw) * horizontal,
    );

    // Do not let the camera slide inside a hill
    this.direction.copy(this.offset).normalize();
    const blocked = ground.raycastDistance(this.smoothTarget, this.direction, CAMERA_DISTANCE);
    const distance = blocked === null
      ? CAMERA_DISTANCE
      : Math.max(blocked - CAMERA_COLLISION_PADDING, CAMERA_NEAR * 2);

    this.camera.position.copy(this.smoothTarget).addScaledVector(this.direction, distance);
    this.camera.lookAt(this.smoothTarget);
  }
}
