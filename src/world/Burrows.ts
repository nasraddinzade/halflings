import * as THREE from 'three';

import { PALETTE } from '../config/palette';
import { applyStyle } from '../render/style';
import { buildBurrows } from './burrow/build';
import { valleyFloor } from './heightfield';
import type { Circle } from './Obstacles';

/**
 * Burrows: the mound gives the landform, the facade and the joinery come
 * from the generator in burrow/.
 *
 * The burrow casts no shadow, and that is deliberate. The facade sits
 * flush with the mound, the sun grazes along it, and at 1.4 cm per texel
 * the shadow map smeared dirty blotches from the door casing all over the
 * slope. A shadow on the ground adds nothing here, and dropping it gets
 * rid of the artifacts entirely.
 */
export class Burrows {
  readonly group = new THREE.Group();
  readonly blockers: Circle[];
  /** Where the smoke comes out. */
  readonly chimneys: THREE.Vector3[];

  constructor() {
    this.group.name = 'burrows';

    const built = buildBurrows(valleyFloor);
    this.blockers = built.blockers;
    this.chimneys = built.chimneys;

    const mounds = new THREE.Mesh(built.mounds);
    mounds.name = 'burrow_mounds';
    this.group.add(mounds);
    // The mound is part of the landscape, so no outline, same as the ground.
    // It casts shadows but does not receive them: the door niche is
    // recessed, the dome shadows itself, and at 1.4 cm per texel that is
    // not soft shading but a hard dark arc across the whole facade.
    applyStyle(mounds, {
      color: PALETTE.grass,
      vertexColors: true,
      outline: false,
      castShadow: true,
      receiveShadow: false,
    });

    for (const [color, geometry] of built.parts) {
      const mesh = new THREE.Mesh(geometry);
      mesh.name = `burrow_part_${color.toString(16)}`;
      this.group.add(mesh);
      // Joinery sits in the niche: a shadow on it would come from its own edges
      applyStyle(mesh, { color, outline: true, castShadow: false, receiveShadow: false });
    }
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
  }
}
