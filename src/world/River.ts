import * as THREE from 'three';

import {
  RIVER_FADE_END,
  RIVER_SEGMENTS_ACROSS,
  RIVER_SEGMENTS_ALONG,
  RIVER_WATER_DEPTH,
  RIVER_WAVE_HEIGHT,
  RIVER_WAVE_SPEED,
  RIVER_WIDTH,
  VALLEY_RADIUS,
} from '../config/constants';
import { PALETTE } from '../config/palette';
import { toonSurface } from '../render/style';
import { groundHeight, riverCenterZ } from './heightfield';

/**
 * Water in the channel: a ribbon along the river axis.
 *
 * The surface is not horizontal — it follows the surrounding ground with
 * a downward offset. A real river does not behave that way, but the
 * valley floor is flat to within a meter and a half per hundred, and to
 * the eye it reads as water, not as a tilted plane. In exchange we have
 * to neither flatten the terrain to a water level nor compute drainage.
 *
 * The channel is cut into the terrain itself (heightfield.ts), so the bed
 * is part of the collision: you can wade into the river, and the BVH
 * honestly stands you on the bottom. The depth is picked so that it comes
 * up to a halfling's knees.
 */
export class River {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = { uTime: { value: 0 } };

  constructor() {
    const geometry = buildRibbon();

    const material = toonSurface(PALETTE.water).clone();
    material.onBeforeCompile = (shader) => {
      shader.uniforms['uTime'] = this.uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           // Two waves at an angle to each other: one alone gives
           // stripes, two give ripples with no visible repeat
           transformed.y += ${RIVER_WAVE_HEIGHT.toFixed(4)} * (
             sin(position.x * 1.7 + uTime * ${RIVER_WAVE_SPEED.toFixed(3)}) +
             sin(position.z * 2.3 - uTime * ${(RIVER_WAVE_SPEED * 0.8).toFixed(3)})
           );`,
        );
    };
    // three caches shader programs by material parameters, and
    // onBeforeCompile is not part of that key: without a key of its own
    // the water could be handed the program of a plain toon material —
    // or hand its own program to one, and the whole scene would ripple
    material.customProgramCacheKey = () => 'river-waves';
    material.needsUpdate = true;

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'river';
    // Water casts no shadow but receives one: otherwise it glows
    // wherever the bank is in shadow
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
  }

  update(delta: number): void {
    this.uniforms.uTime.value += delta;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/**
 * A ribbon along the channel axis. Built in world coordinates, so the
 * mesh sits at the origin with an identity matrix.
 */
function buildRibbon(): THREE.BufferGeometry {
  const limit = VALLEY_RADIUS * RIVER_FADE_END;
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];

  // A bit wider than the channel: the water edge has to tuck under the
  // bank, otherwise a gap shows at the seam
  const halfWidth = RIVER_WIDTH * 1.15;

  for (let i = 0; i <= RIVER_SEGMENTS_ALONG; i++) {
    const t = i / RIVER_SEGMENTS_ALONG;
    const x = -limit + t * limit * 2;
    const centerZ = riverCenterZ(x);

    for (let j = 0; j <= RIVER_SEGMENTS_ACROSS; j++) {
      const s = j / RIVER_SEGMENTS_ACROSS;
      const z = centerZ - halfWidth + s * halfWidth * 2;
      positions.push(x, groundHeight(x, z) - RIVER_WATER_DEPTH, z);
      uvs.push(t * 20, s);
    }
  }

  const stride = RIVER_SEGMENTS_ACROSS + 1;
  for (let i = 0; i < RIVER_SEGMENTS_ALONG; i++) {
    for (let j = 0; j < RIVER_SEGMENTS_ACROSS; j++) {
      const a = i * stride + j;
      const b = a + stride;
      // Vertex order decides which way a face points. The neighboring
      // index runs across the channel (+Z), the next row runs along it
      // (+X), and the winding a -> a+1 -> b gives an upward normal:
      // ẑ × x̂ = +ŷ. With the reverse order the normals point down and
      // the water is only visible from below — from above FrontSide
      // culls its faces
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
