import * as THREE from 'three';

import {
  CAMERA_COLLISION_PADDING,
  CAMERA_DISTANCE,
  CAMERA_DISTANCE_MAX,
  CAMERA_DISTANCE_MIN,
  CAMERA_FAR,
  CAMERA_FOV,
  CAMERA_FOV_EASE,
  CAMERA_FOV_RUN,
  CAMERA_LAG,
  CAMERA_LAND_DIP,
  CAMERA_LAND_RECOVER,
  CAMERA_MAX_PITCH,
  CAMERA_MIN_PITCH,
  CAMERA_COLLISION_MIN,
  CAMERA_NEAR,
  CAMERA_RECOVER,
  CAMERA_SHOULDER_NDC,
  CAMERA_TARGET_HEIGHT,
  CAMERA_ZOOM_EASE,
  CAMERA_ZOOM_STEP,
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
 *
 * Everything the owner will ever film is composed here, so the rig owns
 * the small things that decide whether footage looks shot or dumped out
 * of an engine: a boom the wheel can move, the character off centre
 * rather than plumb in the middle, a field of view that opens a little at
 * a run, and a dip on landing.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  /**
   * Facing the village, not away from it.
   *
   * At zero the camera sits south of the character and looks north-to-
   * south, which puts the whole settlement behind the player's shoulders
   * on the loading frame: measured against the six burrows, zero of them
   * fall inside the 42.8-degree half-field, the nearest being 74 degrees
   * off axis. Turned round, three are in frame and the middle one sits
   * six degrees off centre.
   */
  private yaw = Math.PI;
  private pitch = 0.18;

  /** Where the wheel has put the boom, and where it has eased to. */
  private wantedDistance = CAMERA_DISTANCE;
  private smoothDistance = CAMERA_DISTANCE;
  /** The boom after the hills have had their say. */
  private appliedDistance = CAMERA_DISTANCE;
  /** Metres the aim point is currently dropped by, from a landing. */
  private dip = 0;

  private readonly smoothTarget = new THREE.Vector3();
  private readonly desiredTarget = new THREE.Vector3();
  private readonly aimPoint = new THREE.Vector3();
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

  /** One wheel notch. Positive pushes the camera away. */
  zoom(notches: number): void {
    if (notches === 0) return;
    this.wantedDistance = THREE.MathUtils.clamp(
      this.wantedDistance + notches * CAMERA_ZOOM_STEP,
      CAMERA_DISTANCE_MIN,
      CAMERA_DISTANCE_MAX,
    );
  }

  /** The character has just hit the ground: drop the aim point briefly. */
  land(): void {
    this.dip = CAMERA_LAND_DIP;
  }

  /**
   * `runFraction` is 0 while walking and 1 at a full run — it widens the
   * field of view a touch.
   */
  update(
    playerPosition: THREE.Vector3,
    ground: Ground,
    delta: number,
    runFraction = 0,
  ): void {
    this.dip *= Math.exp(-CAMERA_LAND_RECOVER * delta);

    this.desiredTarget.set(
      playerPosition.x,
      playerPosition.y + CAMERA_TARGET_HEIGHT - this.dip,
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

    this.smoothDistance += (this.wantedDistance - this.smoothDistance)
      * (1 - Math.exp(-CAMERA_ZOOM_EASE * delta));

    // A point on the sphere around the target: up by pitch, around by yaw
    const horizontal = Math.cos(this.pitch) * this.smoothDistance;
    this.offset.set(
      Math.sin(this.yaw) * horizontal,
      Math.sin(this.pitch) * this.smoothDistance,
      Math.cos(this.yaw) * horizontal,
    );

    // Do not let the camera slide inside a hill. The ray reaches past the
    // boom on purpose: stopping it exactly at the boom makes `room` drop
    // by the whole padding the instant a surface crosses the far end, and
    // the snap-in branch below applies that step with no easing at all —
    // a pop that comes from the ray's length, not from the world
    this.direction.copy(this.offset).normalize();
    const blocked = ground.raycastDistance(
      this.smoothTarget,
      this.direction,
      this.smoothDistance + CAMERA_COLLISION_PADDING,
    );
    const room = blocked === null
      ? this.smoothDistance
      : Math.min(
        this.smoothDistance,
        Math.max(blocked - CAMERA_COLLISION_PADDING, CAMERA_COLLISION_MIN),
      );

    // Asymmetric on purpose. Coming in there is nothing to negotiate — the
    // hillside is already between camera and character — but easing back
    // out stops the picture popping every time a tree clears the boom
    if (room < this.appliedDistance) {
      this.appliedDistance = room;
    } else {
      this.appliedDistance += (room - this.appliedDistance)
        * (1 - Math.exp(-CAMERA_RECOVER * delta));
    }

    this.camera.position.copy(this.smoothTarget)
      .addScaledVector(this.direction, this.appliedDistance);

    // Aim a little to the side of the character rather than straight at
    // him. Right = forward x up, and forward here is -direction.
    //
    // The offset is perpendicular to the boom, so in metres it would be a
    // fixed angle at exactly one boom length. Converting from a screen
    // fraction through the current distance, field of view and aspect
    // keeps the character in the same place in frame whatever the zoom,
    // whatever the hills do, and whatever shape the window is.
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)
      * this.camera.aspect;
    const shoulder = CAMERA_SHOULDER_NDC * this.appliedDistance * halfWidth;
    this.aimPoint.copy(this.smoothTarget);
    this.aimPoint.x += Math.cos(this.yaw) * shoulder;
    this.aimPoint.z += -Math.sin(this.yaw) * shoulder;
    this.camera.lookAt(this.aimPoint);

    const wantedFov = CAMERA_FOV + CAMERA_FOV_RUN * THREE.MathUtils.clamp(runFraction, 0, 1);
    if (Math.abs(this.camera.fov - wantedFov) > 1e-3) {
      this.camera.fov += (wantedFov - this.camera.fov)
        * (1 - Math.exp(-CAMERA_FOV_EASE * delta));
      this.camera.updateProjectionMatrix();
    }
  }
}
