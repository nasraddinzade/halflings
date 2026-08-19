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
 *
 * It also hangs a handle on `window.fly` so a viewpoint can be asked for
 * by name rather than flown to by holding a key for a guessed number of
 * seconds. Looking is the only check that has ever caught the defects
 * that mattered here, so the cost of taking one more look has to stay
 * near zero — `fly.to(50, -12, 1.8, 250)` puts the eye in a named field
 * facing a named way, every time, and the bearing it takes is the same
 * number the readout prints.
 */

/** What `window.fly` offers. Heights are metres above the ground. */
export interface FlyHandle {
  on(): void;
  off(): void;
  /** Bearing and pitch in degrees, as printed by the readout. */
  to(x: number, z: number, height: number, bearing?: number, pitch?: number): void;
  /** Straight down from map height over a point. */
  map(x?: number, z?: number): void;
  where(): { x: number; z: number; y: number; bearing: number; pitch: number };
  /** The last drawn frame, as a JPEG data URL, scaled to `width`. */
  shot(width?: number, quality?: number): string;
  /** The same frame, written to `.shots/<name>.jpg` by the dev server. */
  save(name?: string, width?: number): Promise<string>;
}

declare global {
  // eslint-disable-next-line no-var
  var fly: FlyHandle | undefined;
}
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

    globalThis.fly = {
      on: () => { this.active = true; this.readout.style.display = 'block'; },
      off: () => { this.active = false; this.readout.style.display = 'none'; },
      to: (x, z, height, bearing = 180, pitch = 0) => {
        globalThis.fly?.on();
        this.position.set(x, heightAt(x, z) + height, z);
        // The readout prints a bearing, so the handle has to take one:
        // passing a yaw in and reading a bearing out is how the camera
        // was once pointed at the empty half of the valley
        this.yaw = ((bearing - 180) * Math.PI) / 180;
        this.pitch = (pitch * Math.PI) / 180;
      },
      map: (x = this.position.x, z = this.position.z) => {
        globalThis.fly?.on();
        this.position.set(x, MAP_HEIGHT, z);
        this.pitch = -Math.PI / 2 + 0.001;
      },
      shot: (width = 640, quality = 0.55) => {
        const canvas = document.querySelector('canvas');
        if (canvas === null) return '';
        const scaled = document.createElement('canvas');
        scaled.width = width;
        scaled.height = Math.round((width * canvas.height) / canvas.width);
        const ctx = scaled.getContext('2d');
        if (ctx === null) return '';
        ctx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
        return scaled.toDataURL('image/jpeg', quality);
      },
      save: async (name = 'latest', width = 1100) => {
        const url = globalThis.fly?.shot(width, 0.72) ?? '';
        if (url === '') return '';
        const response = await fetch(`/__shot/${name}`, { method: 'POST', body: url });
        return response.text();
      },
      where: () => ({
        x: this.position.x,
        z: this.position.z,
        y: this.position.y,
        bearing: ((this.yaw * 180) / Math.PI + 180 + 360) % 360,
        pitch: (this.pitch * 180) / Math.PI,
      }),
    };
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
    globalThis.fly = undefined;
  }
}
