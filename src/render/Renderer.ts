import * as THREE from 'three';

import { NEUTRAL_BACKGROUND, PIXEL_RATIO_CAP, SHADOW_MAP_SIZE } from '../config/constants';

/** WebGLRenderer плюс подписка на resize. Стилизации здесь нет — это шаг 3. */
export class Renderer {
  readonly webgl: THREE.WebGLRenderer;
  private onResize?: (width: number, height: number) => void;

  constructor(canvas: HTMLCanvasElement) {
    this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.webgl.setClearColor(NEUTRAL_BACKGROUND);
    this.webgl.shadowMap.enabled = true;
    // PCFSoftShadowMap в three 0.185 объявлен устаревшим и всё равно
    // подменяется на PCFShadowMap — ставим его явно
    this.webgl.shadowMap.type = THREE.PCFShadowMap;
    this.applySize();

    window.addEventListener('resize', this.handleResize);
  }

  /** Регистрирует слушателя — камере нужно пересчитать aspect. */
  setResizeHandler(handler: (width: number, height: number) => void): void {
    this.onResize = handler;
    handler(window.innerWidth, window.innerHeight);
  }

  get shadowMapSize(): number {
    return SHADOW_MAP_SIZE;
  }

  /**
   * Счётчики последнего кадра. three сбрасывает их сам на каждом render(),
   * поэтому читать надо после отрисовки, а не до.
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
    // Ретина на 3x съедает кадры ни за что: выше двух не поднимаемся
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, PIXEL_RATIO_CAP));
    this.webgl.setSize(window.innerWidth, window.innerHeight, false);
  }

  private readonly handleResize = (): void => {
    this.applySize();
    this.onResize?.(window.innerWidth, window.innerHeight);
  };
}
