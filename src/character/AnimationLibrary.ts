import type * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { ANIMATION_URLS, IGNORED_CLIPS } from '../config/assets';

/**
 * Реестр клипов из нескольких GLB.
 *
 * Ретаргет не нужен: имена костей у всех файлов пака совпадают
 * с базовой моделью — 23 из 23, одинаковая иерархия и рест-поза
 * (сверено в docs/ASSETS.md, раздел 3). Микшер связывает треки
 * с костями по имени, а не по индексу, поэтому клип из одного файла
 * спокойно играется на скелете из другого.
 */
export class AnimationLibrary {
  private readonly clips = new Map<string, THREE.AnimationClip>();

  static async load(loader: GLTFLoader): Promise<AnimationLibrary> {
    const library = new AnimationLibrary();
    // Файлы независимы — грузим разом, а не по очереди
    const files = await Promise.all(ANIMATION_URLS.map((url) => loader.loadAsync(url)));

    for (const file of files) {
      for (const clip of file.animations) {
        if (IGNORED_CLIPS.includes(clip.name)) continue;
        // T-Pose отсеян выше, но столкнуться могут и другие имена —
        // молча перетирать клип хуже, чем сказать об этом
        if (library.clips.has(clip.name)) {
          console.warn(`[animations] клип "${clip.name}" встречается дважды, взят первый`);
          continue;
        }
        library.clips.set(clip.name, clip);
      }
    }
    return library;
  }

  /** Клип по имени. Отсутствие клипа — ошибка сборки ассетов, не рантайма. */
  require(name: string): THREE.AnimationClip {
    const clip = this.clips.get(name);
    if (clip === undefined) {
      throw new Error(
        `[animations] нет клипа "${name}". Доступны: ${[...this.clips.keys()].join(', ')}`,
      );
    }
    return clip;
  }

  get size(): number {
    return this.clips.size;
  }
}
