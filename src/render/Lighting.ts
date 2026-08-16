import * as THREE from 'three';

import { SHADOW_EXTENT, SHADOW_MAP_SIZE } from '../config/constants';
import { PALETTE } from '../config/palette';

/**
 * Lighting tuned for the toon shader.
 *
 * The ramp steps come from the directional light: its contribution is what
 * MeshToonMaterial splits into three levels. The fill light is kept
 * noticeably weaker — raise it and everything lands on the top step, the
 * image goes flat and the steps stop being visible at all.
 */
export class Lighting {
  private readonly sun: THREE.DirectionalLight;
  private readonly sunOffset = new THREE.Vector3(18, 26, 12);

  constructor(scene: THREE.Scene) {
    scene.add(new THREE.HemisphereLight(PALETTE.skyBounce, PALETTE.groundBounce, 0.9));

    this.sun = new THREE.DirectionalLight(PALETTE.sunlight, 2.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(SHADOW_MAP_SIZE);

    // The shadow map covers a box around the player, not the whole valley:
    // over 256 metres the resolution would not be enough and the shadow
    // would turn to mush
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -SHADOW_EXTENT;
    shadowCamera.right = SHADOW_EXTENT;
    shadowCamera.top = SHADOW_EXTENT;
    shadowCamera.bottom = -SHADOW_EXTENT;
    shadowCamera.near = 1;
    shadowCamera.far = 90;
    shadowCamera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0006;
    // 2 cm was needed against character self-shadowing; they no longer
    // receive shadows, and a large offset would only tear the shadow away
    // from their feet
    this.sun.shadow.normalBias = 0.008;

    scene.add(this.sun);
    scene.add(this.sun.target);
  }

  /** The shadow box travels with the player, or he walks out of it. */
  update(focus: THREE.Vector3): void {
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
    this.sun.position.copy(focus).add(this.sunOffset);
  }
}
