import * as THREE from 'three';

import { FLY_FAST, FLY_LOOK_RATE, FLY_SPEED, MAP_HEIGHT } from '../config/constants';
import type { Input } from '../core/Input';
import { heightAt } from '../world/heightfield';

/**
 * A developer's free camera: fly anywhere, look anywhere, and read your
 * own coordinates off the screen.
 *
 * This exists because the whole village was laid out, measured and shipped
 * without anybody ever looking at it from above. Numbers said the rim was
 * closed and the dwellings were dug in; only looking showed a hedge that
 * read as a slab, two buildings facing backwards and a wheel hanging over
 * dry ground. A tool that makes looking cheap pays for itself the first
 * time it is used.
 *
 * Keyboard only, and deliberately so. Mouse-look needs pointer lock, which
 * cannot be driven from a script — and half the point is that this can be
 * flown from outside the page as well as from inside it.
 *
 *   F        fly on and off
 *   WASD     move, level with the horizon
 *   Q / E    down and up
 *   I J K L  look up, left, down, right
 *   Shift    faster
 *   T        jump to map height, looking straight down
 *   G        drop to the ground under the camera
 */
export class FreeCamera {
  active = false;

  private readonly position = new THREE.Vector3();
  private yaw = 0;
  private pitch = -0.2;
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private readonly readout: HTMLElement;

  constructor() {
    this.readout = document.createElement('div');
    this.readout.style.cssText = [
      'position:fixed', 'left:12px', 'top:12px', 'z-index:20',
      'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#e6e0d4', 'background:rgba(20,18,16,.72)', 'padding:8px 10px',
      'border-radius:6px', 'white-space:pre', 'pointer-events:none', 'display:none',
    ].join(';');
    document.body.appendChild(this.readout);
  }

  /** Returns true while it owns the camera. */
  update(input: Input, camera: THREE.PerspectiveCamera, playerAt: THREE.Vector3, delta: number): boolean {
    if (input.tookPress('KeyF')) {
      this.active = !this.active;
      if (this.active) {
        // Start where the player is standing, so the first frame is not a
        // teleport to somewhere unrecognisable
        this.position.copy(camera.position);
        this.readout.style.display = 'block';
      } else {
        this.readout.style.display = 'none';
      }
    }
    if (!this.active) return false;

    if (input.tookPress('KeyT')) {
      this.position.set(playerAt.x, MAP_HEIGHT, playerAt.z);
      this.pitch = -Math.PI / 2 + 0.001;
    }
    if (input.tookPress('KeyG')) {
      this.position.y = heightAt(this.position.x, this.position.z) + 1.6;
    }

    const look = FLY_LOOK_RATE * delta;
    if (input.isDown('KeyJ')) this.yaw += look;
    if (input.isDown('KeyL')) this.yaw -= look;
    if (input.isDown('KeyI')) this.pitch += look;
    if (input.isDown('KeyK')) this.pitch -= look;
    const limit = Math.PI / 2 - 0.001;
    this.pitch = Math.max(-limit, Math.min(limit, this.pitch));

    // Movement is level with the horizon whatever the pitch: flying by
    // where you are looking makes it impossible to hold a height
    this.forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    this.right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const speed = (input.isDown('ShiftLeft') || input.isDown('ShiftRight') ? FLY_FAST : FLY_SPEED) * delta;
    if (input.isDown('KeyW')) this.position.addScaledVector(this.forward, speed);
    if (input.isDown('KeyS')) this.position.addScaledVector(this.forward, -speed);
    if (input.isDown('KeyD')) this.position.addScaledVector(this.right, speed);
    if (input.isDown('KeyA')) this.position.addScaledVector(this.right, -speed);
    if (input.isDown('KeyE')) this.position.y += speed;
    if (input.isDown('KeyQ')) this.position.y -= speed;

    camera.position.copy(this.position);
    const cp = Math.cos(this.pitch);
    camera.lookAt(
      this.position.x + this.forward.x * cp,
      this.position.y + Math.sin(this.pitch),
      this.position.z + this.forward.z * cp,
    );

    const ground = heightAt(this.position.x, this.position.z);
    // Bearing, not yaw: the number a map is read in
    const bearing = ((Math.atan2(-this.forward.x, -this.forward.z) * 180) / Math.PI + 180 + 360) % 360;
    this.readout.textContent =
      `FLY   x ${this.position.x.toFixed(1)}  z ${this.position.z.toFixed(1)}  y ${this.position.y.toFixed(1)}\n`
      + `      ground ${ground.toFixed(2)}   above ${(this.position.y - ground).toFixed(1)} m\n`
      + `      looking ${bearing.toFixed(0)}°   pitch ${((this.pitch * 180) / Math.PI).toFixed(0)}°\n`
      + `WASD move  QE down/up  IJKL look  Shift fast  T map  G ground  F off`;
    return true;
  }

  dispose(): void {
    this.readout.remove();
  }
}
