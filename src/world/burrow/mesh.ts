import * as THREE from 'three';

import {
  DIMPLE_INNER,
  DIMPLE_OUTER,
  DOOR_CENTER_HEIGHT,
  MOUND_RINGS,
  MOUND_SEGMENTS,
  type Burrow,
} from '../../config/burrows';
import { PALETTE, darken } from '../../config/palette';
import { faceDistance, type BurrowFace } from './profile';

/**
 * The burrow mound as a single mesh — facade included.
 *
 * The mound used to live in the terrain, and the cut was covered by a
 * separate flat panel. As long as those are two different things, the
 * panel has to be flat, and from any angle but head-on it reads as a
 * board propped against the hill. No amount of trim fixes that.
 *
 * Now the mound is a surface of its own, and the "facade" is just a
 * patch of it pressed inwards to take the door. What stays flat is a
 * circle a little over a meter in radius, everything else is a curved
 * dome blending smoothly into it. There is no separate facade left, so
 * nothing is there to look like a propped board.
 *
 * The geometry is parametric: rings up the height, segments around the
 * circle. Vertices that land near the door are pulled towards the door
 * plane, the more strongly the closer they are to its center.
 */
export function buildMoundMesh(burrow: Burrow, face: BurrowFace): THREE.BufferGeometry {
  const distance = faceDistance(burrow);
  const outX = Math.sin(face.yaw);
  const outZ = Math.cos(face.yaw);
  const leftX = Math.cos(face.yaw);
  const leftZ = -Math.sin(face.yaw);

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const grass = new THREE.Color(PALETTE.grass);
  const dry = new THREE.Color(darken(PALETTE.grass, 0.88));
  const earth = new THREE.Color(PALETTE.earth);
  const color = new THREE.Color();

  for (let ring = 0; ring <= MOUND_RINGS; ring++) {
    // v from 0 at the ground to pi/2 at the crown
    const v = (ring / MOUND_RINGS) * (Math.PI / 2);
    const radius = burrow.radius * Math.cos(v);
    const y = burrow.height * Math.sin(v);

    for (let segment = 0; segment <= MOUND_SEGMENTS; segment++) {
      const u = (segment / MOUND_SEGMENTS) * Math.PI * 2;
      let x = radius * Math.cos(u);
      let z = radius * Math.sin(u);

      // Into the door's frame: forward points out, side across
      let forward = x * outX + z * outZ;
      const side = x * leftX + z * leftZ;

      // How far this vertex lands within the doorway's neighborhood
      const fromDoor = Math.hypot(side, y - DOOR_CENTER_HEIGHT);
      const t = Math.min(1, Math.max(0, (fromDoor - DIMPLE_INNER) / (DIMPLE_OUTER - DIMPLE_INNER)));
      const pull = 1 - t * t * (3 - 2 * t);

      if (pull > 0 && forward > distance) {
        // Press towards the door plane instead of slicing it off at once
        const flattened = distance + (forward - distance) * (1 - pull);
        const shift = flattened - forward;
        x += outX * shift;
        z += outZ * shift;
        forward = flattened;
      }

      positions.push(x, y, z);

      // Bare earth at the opening, turf beyond; lighter towards the crown
      const groundTint = grass.clone().lerp(dry, 1 - y / Math.max(0.001, burrow.height));
      color.copy(groundTint).lerp(earth, pull * 0.85);
      colors.push(color.r, color.g, color.b);
    }
  }

  const stride = MOUND_SEGMENTS + 1;
  for (let ring = 0; ring < MOUND_RINGS; ring++) {
    for (let segment = 0; segment < MOUND_SEGMENTS; segment++) {
      const a = ring * stride + segment;
      const b = a + stride;
      // Vertex order sets which way a face points. The neighbor index
      // runs around the circle, the next row up, so winding a -> b -> a+1
      // gives a normal out of the dome. Reversed, the normals point
      // inwards, front faces end up on the back side, and the mound looks
      // transparent: through the near wall you see the far wall's inside.
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.translate(burrow.x, face.base, burrow.z);
  geometry.computeBoundingSphere();
  return geometry;
}
