import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { applyStyle } from '../../render/style';

/**
 * One merge for every prop in the village, not one per module.
 *
 * Work sites and green furniture use the same five or six colours. Merged
 * per module they cost a mesh, an outline and a shadow draw for each
 * colour in each module — fifteen calls to draw a thousand triangles.
 * Contributed into one batch they cost three of everything, and the count
 * falls out of the data instead of being asserted in a comment.
 *
 * The bucket key is the whole style, not just the colour: a pound wall in
 * open grass has to cast a shadow, and a flagstone in a doorway does not,
 * so those cannot share a mesh even where they share a tone.
 */
export interface PropStyle {
  color: number;
  castShadow: boolean;
  receiveShadow: boolean;
}

const DEFAULT: Omit<PropStyle, 'color'> = { castShadow: true, receiveShadow: true };

interface Bucket {
  style: PropStyle;
  parts: THREE.BufferGeometry[];
}

export class PropBatch {
  private readonly buckets = new Map<string, Bucket>();

  /**
   * Hands a finished, world-placed part to the batch.
   *
   * Everything is stripped of its index on the way in. mergeGeometries
   * requires every input to be uniformly indexed or uniformly not, and
   * three's primitives disagree: boxes and cylinders carry an index,
   * icosahedra never do. Mixing them returns null, and the caller throws
   * — a blank screen from one stone. treeGeometry() has always done this
   * for the same reason; here it is done once for everybody.
   */
  add(geometry: THREE.BufferGeometry, color: number, style?: Partial<PropStyle>): void {
    const full: PropStyle = { color, ...DEFAULT, ...style };
    const key = `${full.color}:${full.castShadow ? 1 : 0}${full.receiveShadow ? 1 : 0}`;

    const flat = geometry.index === null ? geometry : geometry.toNonIndexed();
    if (flat !== geometry) geometry.dispose();

    const bucket = this.buckets.get(key);
    if (bucket === undefined) this.buckets.set(key, { style: full, parts: [flat] });
    else bucket.parts.push(flat);
  }

  /** Merges every bucket and hangs the meshes under `parent`. */
  build(parent: THREE.Object3D): void {
    for (const [key, bucket] of this.buckets) {
      const merged = mergeGeometries(bucket.parts, false);
      for (const part of bucket.parts) part.dispose();
      if (merged === null) throw new Error(`[props] could not merge the ${key} bucket`);

      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged);
      mesh.name = `props_${key}`;
      // Built in world coordinates and never moved again, so the matrix
      // is composed once rather than every frame
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      // Into the graph first, styling second: applyStyle hangs the
      // outline next to the mesh, so the parent has to exist by then
      parent.add(mesh);
      applyStyle(mesh, {
        color: bucket.style.color,
        outline: true,
        castShadow: bucket.style.castShadow,
        receiveShadow: bucket.style.receiveShadow,
      });
    }
    this.buckets.clear();
  }
}
