import * as THREE from 'three';

import { FREE_CAMERA, PIXEL_RATIO_CAP, SHADOW_MAP_SIZE } from '../config/constants';
import { PALETTE } from '../config/palette';

/**
 * WebGLRenderer plus a resize subscription. Colours come from the palette.
 *
 * The size comes from the CANVAS, not from the window, and it is watched
 * with a ResizeObserver rather than a window `resize` event. Those two
 * choices are the same bug fixed twice: a page laid out in a hidden pane
 * reports `window.innerWidth` of 0 while the canvas element still measures
 * 1280 by 720, so the renderer sized its drawing buffer to nothing and
 * never heard a resize event to correct itself. The result was a canvas
 * that stayed blank until something happened to resize the window — and
 * for anyone opening the page in a background tab, that was for ever.
 */
export class Renderer {
  readonly webgl: THREE.WebGLRenderer;
  private onResize?: (width: number, height: number) => void;
  private readonly canvas: HTMLCanvasElement;
  private readonly watcher: ResizeObserver;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
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

    this.watcher = new ResizeObserver(this.handleResize);
    this.watcher.observe(canvas);
    // Belt as well as braces: an observer fires on the element's box, and
    // a device-pixel-ratio change moves none of the boxes
    window.addEventListener('resize', this.handleResize);
  }

  /** Registers a listener — the camera needs to recompute its aspect. */
  setResizeHandler(handler: (width: number, height: number) => void): void {
    this.onResize = handler;
    const { width, height } = this.measure();
    handler(width, height);
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
    this.watcher.disconnect();
    window.removeEventListener('resize', this.handleResize);
    this.webgl.dispose();
  }

  /**
   * The canvas's own box, never smaller than one pixel.
   *
   * Falls back to the window only while the element has not been laid out
   * at all, which is the one case where the window is the better guess.
   */
  private measure(): { width: number; height: number } {
    const width = this.canvas.clientWidth || window.innerWidth || 1;
    const height = this.canvas.clientHeight || window.innerHeight || 1;
    return { width: Math.max(1, width), height: Math.max(1, height) };
  }

  private applySize(): void {
    // A 3x retina display eats frames for nothing: never go above two
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
    const { width, height } = this.measure();
    this.webgl.setSize(width, height, false);
  }

  private readonly handleResize = (): void => {
    this.applySize();
    const { width, height } = this.measure();
    this.onResize?.(width, height);
  };
}
