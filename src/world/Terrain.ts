import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

import { VALLEY_SEGMENTS, VALLEY_SIZE } from '../config/constants';
import { PALETTE } from '../config/palette';
import { paintGround } from './groundColor';
import { applyStyle } from '../render/style';
import { heightAt } from './heightfield';

/**
 * The valley mesh plus the BVH built over it.
 *
 * A BVH (bounding volume hierarchy) is a tree of nested boxes over the
 * triangles. Without it a ray would be tested against all 131k
 * triangles; with it, against a dozen boxes and a handful of triangles.
 * Built once at startup.
 */
export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly bvh: MeshBVH;

  constructor() {
    const geometry = new THREE.PlaneGeometry(
      VALLEY_SIZE,
      VALLEY_SIZE,
      VALLEY_SEGMENTS,
      VALLEY_SEGMENTS,
    );

    // The rotation is baked into the geometry itself, not into the
    // object. That way the mesh's local coordinates match world ones and
    // rays can go into the BVH with no change of basis.
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      position.setY(i, heightAt(position.getX(i), position.getZ(i)));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    // Per-vertex color: paths, slopes, banks. Computed after the heights
    // are displaced, because it looks at the finished terrain
    paintGround(geometry);
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    this.bvh = new MeshBVH(geometry);

    this.mesh = new THREE.Mesh(geometry);
    this.mesh.name = 'terrain';
    // The ground gets no outline: an inverted hull makes sense for
    // objects with a silhouette, not for the surface everything stands on
    applyStyle(this.mesh, {
      color: PALETTE.grass,
      vertexColors: true,
      outline: false,
      castShadow: false,
      receiveShadow: true,
    });
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
  }

  dispose(): void {
    // Leave the material alone: it is shared, lives in the render/style.ts
    // cache, and may still be in use by other objects in the scene
    this.mesh.geometry.dispose();
  }
}
