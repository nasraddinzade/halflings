import * as THREE from 'three';

import {
  POND_SEGMENTS_ACROSS,
  POND_SEGMENTS_ROUND,
  POND_WAVE_HEIGHT,
  RIVER_FADE_END,
  RIVER_SEGMENTS_ACROSS,
  RIVER_SEGMENTS_ALONG,
  RIVER_WATER_DEPTH,
  RIVER_WAVE_HEIGHT,
  RIVER_WAVE_SPEED,
  RIVER_WIDTH,
  VALLEY_RADIUS,
} from '../config/constants';
import { POND, POND_REACH } from '../config/green';
import { PALETTE } from '../config/palette';
import { toonSurface } from '../render/style';
import { groundHeight, pondWaterY, riverCenterZ } from './heightfield';

/**
 * Every water surface in the valley, in one mesh.
 *
 * The channel is a ribbon along the river axis; the pond is a disc on the
 * green. They are one object because they are one material, and giving
 * the pond a module of its own would have cost a second draw call, a
 * second material and — the expensive one — a second shader program: the
 * wave amplitude used to be baked into the GLSL as a literal, so water
 * that rippled less compiled a different shader. Worse, three keys its
 * program cache on customProgramCacheKey, and under the river's key the
 * pond would silently have been handed the river's program. The amplitude
 * is a per-vertex attribute instead. One program, one draw call, and
 * still water and running water still tell themselves apart.
 *
 * The channel's surface is not horizontal — it follows the surrounding
 * ground with a downward offset. A real river does not behave that way,
 * but the valley floor is flat to within a metre and a half per hundred,
 * and to the eye it reads as water rather than a tilted plane. The pond's
 * surface IS horizontal, because a pond has no such excuse: it is one
 * height, taken from the ground at its own centre.
 *
 * Both beds are cut into the terrain itself (heightfield.ts), so the
 * bottom is part of the collision mesh: you wade in, and the BVH honestly
 * stands you on it. Where the ground rises above the pond's plane the
 * terrain simply hides the disc — which is why the pool you see has an
 * irregular edge that nobody drew.
 */
export class Water {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = { uTime: { value: 0 } };

  constructor() {
    const geometry = buildSurfaces();

    const material = toonSurface(PALETTE.water).clone();
    material.onBeforeCompile = (shader) => {
      shader.uniforms['uTime'] = this.uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nuniform float uTime;\nattribute float aWave;',
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           // Two waves at an angle to each other: one alone gives
           // stripes, two give ripples with no visible repeat. The
           // amplitude rides on the vertex, so the pond can lie calm
           // while the channel runs
           transformed.y += aWave * (
             sin(position.x * 1.7 + uTime * ${RIVER_WAVE_SPEED.toFixed(3)}) +
             sin(position.z * 2.3 - uTime * ${(RIVER_WAVE_SPEED * 0.8).toFixed(3)})
           );`,
        );
    };
    // three caches shader programs by material parameters, and
    // onBeforeCompile is not part of that key: without a key of its own
    // the water could be handed the program of a plain toon material —
    // or hand its own program to one, and the whole scene would ripple
    material.customProgramCacheKey = () => 'water-waves';
    material.needsUpdate = true;

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'water';
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

interface Buffers {
  positions: number[];
  indices: number[];
  uvs: number[];
  waves: number[];
}

/** Both surfaces, built in world coordinates into one buffer. */
function buildSurfaces(): THREE.BufferGeometry {
  const buffers: Buffers = { positions: [], indices: [], uvs: [], waves: [] };

  addChannel(buffers);
  addPond(buffers);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(buffers.positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(buffers.uvs, 2));
  geometry.setAttribute('aWave', new THREE.Float32BufferAttribute(buffers.waves, 1));
  geometry.setIndex(buffers.indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

/** A ribbon along the channel axis, its surface parallel to the ground. */
function addChannel(buffers: Buffers): void {
  const limit = VALLEY_RADIUS * RIVER_FADE_END;
  // A bit wider than the channel: the water edge has to tuck under the
  // bank, otherwise a gap shows at the seam
  const halfWidth = RIVER_WIDTH * 1.15;
  const first = buffers.positions.length / 3;

  for (let i = 0; i <= RIVER_SEGMENTS_ALONG; i++) {
    const t = i / RIVER_SEGMENTS_ALONG;
    const x = -limit + t * limit * 2;
    const centerZ = riverCenterZ(x);

    for (let j = 0; j <= RIVER_SEGMENTS_ACROSS; j++) {
      const s = j / RIVER_SEGMENTS_ACROSS;
      const z = centerZ - halfWidth + s * halfWidth * 2;
      buffers.positions.push(x, groundHeight(x, z) - RIVER_WATER_DEPTH, z);
      buffers.uvs.push(t * 20, s);
      buffers.waves.push(RIVER_WAVE_HEIGHT);
    }
  }

  const stride = RIVER_SEGMENTS_ACROSS + 1;
  for (let i = 0; i < RIVER_SEGMENTS_ALONG; i++) {
    for (let j = 0; j < RIVER_SEGMENTS_ACROSS; j++) {
      const a = first + i * stride + j;
      const b = a + stride;
      // Vertex order decides which way a face points. The neighbouring
      // index runs across the channel (+Z), the next row runs along it
      // (+X), and the winding a -> a+1 -> b gives an upward normal.
      // With the reverse order the normals point down and the water is
      // only visible from below — from above FrontSide culls its faces
      buffers.indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }
}

/**
 * A level disc over the pond dish, drawn out to the widest the shoreline
 * ever reaches. Most of its rim is underground, and that is the point:
 * the terrain cuts the pool to shape, so the waterline follows the
 * ground rather than a circle somebody drew.
 */
function addPond(buffers: Buffers): void {
  const y = pondWaterY();
  const first = buffers.positions.length / 3;

  for (let ring = 0; ring <= POND_SEGMENTS_ACROSS; ring++) {
    const radius = (ring / POND_SEGMENTS_ACROSS) * POND_REACH;
    for (let step = 0; step <= POND_SEGMENTS_ROUND; step++) {
      const angle = (step / POND_SEGMENTS_ROUND) * Math.PI * 2;
      buffers.positions.push(
        POND.x + Math.cos(angle) * radius,
        y,
        POND.z + Math.sin(angle) * radius,
      );
      buffers.uvs.push((step / POND_SEGMENTS_ROUND) * 6, ring / POND_SEGMENTS_ACROSS);
      buffers.waves.push(POND_WAVE_HEIGHT);
    }
  }

  const stride = POND_SEGMENTS_ROUND + 1;
  for (let ring = 0; ring < POND_SEGMENTS_ACROSS; ring++) {
    for (let step = 0; step < POND_SEGMENTS_ROUND; step++) {
      const a = first + ring * stride + step;
      const b = a + stride;
      // Rings run outward, steps run anticlockwise, so this winding
      // faces up for the same reason the channel's does
      buffers.indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
}
