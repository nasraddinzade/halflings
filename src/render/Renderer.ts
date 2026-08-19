import * as THREE from 'three';

import { FREE_CAMERA } from '../config/constants';

import { PIXEL_RATIO_CAP, SHADOW_MAP_SIZE } from '../config/constants';
import { PALETTE } from '../config/palette';

/** WebGLRenderer plus a resize subscription. Colours come from the palette. */
export class Renderer {
  readonly webgl: THREE.WebGLRenderer;
  private onResize?: (width: number, height: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.webgl = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      // Only while the developer camera is compiled in. Keeping the last
      // frame around lets the canvas be read back at any moment, which is
      // what makes `fly.shot()` possible — and looking is the only check
      // in this project that has ever caught the faults that mattered, so
      // it has to work even when nothing is watching the window.
      preserveDrawingBuffer: FREE_CAMERA,
    });
    this.webgl.setClearColor(PALETTE.sky);
    this.webgl.shadowMap.enabled = true;
    // PCFSoftShadowMap is deprecated in three 0.185 and gets swapped for
    // PCFShadowMap anyway — so set it explicitly
    this.webgl.shadowMap.type = THREE.PCFShadowMap;
    this.applySize();

    window.addEventListener('resize', this.handleResize);
  }

  /** Registers a listener — the camera needs to recompute its aspect. */
  setResizeHandler(handler: (width: number, height: number) => void): void {
    this.onResize = handler;
    handler(window.innerWidth, window.innerHeight);
  }

  get shadowMapSize(): number {
    return SHADOW_MAP_SIZE;
  }

  /**
   * Counters for the last frame. three resets them itself on every
   * render(), so they have to be read after drawing, not before.
   */
  get frameStats(): { calls: number; triangles: number } {
    const { render } = this.webgl.info;
    return { calls: render.calls, triangles: render.triangles };
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.webgl.render(scene, camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.handleResize);
    this.webgl.dispose();
  }

  private applySize(): void {
    // A 3x retina display eats frames for nothing: never go above two
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
    this.webgl.setSize(window.innerWidth, window.innerHeight, false);
  }

  private readonly handleResize = (): void => {
    this.applySize();
    this.onResize?.(window.innerWidth, window.innerHeight);
  };
}
