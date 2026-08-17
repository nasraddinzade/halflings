import type * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { ANIMATION_URLS, IGNORED_CLIPS } from '../config/assets';

/**
 * Registry of clips gathered from several GLB files.
 *
 * No retargeting needed: bone names in every file of the pack match
 * the base model — 23 out of 23, same hierarchy and same rest pose
 * (verified in docs/ASSETS.md, section 3). The mixer binds tracks to
 * bones by name, not by index, so a clip from one file plays happily
 * on a skeleton from another.
 */
export class AnimationLibrary {
  private readonly clips = new Map<string, THREE.AnimationClip>();

  static async load(loader: GLTFLoader): Promise<AnimationLibrary> {
    const library = new AnimationLibrary();
    // The files are independent — load them all at once, not in turn
    const files = await Promise.all(ANIMATION_URLS.map((url) => loader.loadAsync(url)));

    for (const file of files) {
      for (const clip of file.animations) {
        if (IGNORED_CLIPS.includes(clip.name)) continue;
        // T-Pose is filtered out above, but other names can collide
        // too — silently overwriting a clip is worse than saying so
        if (library.clips.has(clip.name)) {
          console.warn(`[animations] clip "${clip.name}" occurs twice, keeping the first`);
          continue;
        }
        library.clips.set(clip.name, clip);
      }
    }
    return library;
  }

  /** Clip by name. A missing clip is an asset build error, not runtime. */
  require(name: string): THREE.AnimationClip {
    const clip = this.clips.get(name);
    if (clip === undefined) {
      throw new Error(
        `[animations] no clip "${name}". available: ${[...this.clips.keys()].join(', ')}`,
      );
    }
    return clip;
  }

  get size(): number {
    return this.clips.size;
  }
}
