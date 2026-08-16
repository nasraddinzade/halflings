import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkeletonHierarchy } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Merging character parts into a single SkinnedMesh (decision #1).
 *
 * Without merging every villager would cost six draw calls; across twenty
 * villagers that is a hundred and twenty calls instead of twenty.
 *
 * The main subtlety is renumbering the bones. The skinIndex attribute holds
 * not bone names but their positions in its own file's skin.joints array.
 * That order differs from file to file (verified in docs/ASSETS.md,
 * section 3: names and rest pose match, the order does not). Merge as-is
 * and the Mage's arm will obey leg bones — the model turns inside out. So
 * indices are translated through names into the target skeleton's order.
 */

/** Attributes every piece must have, or merge won't combine them. */
const REQUIRED_ATTRIBUTES = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'] as const;

export interface Armature {
  /** Node with the bone hierarchy; add it to the scene next to the mesh. */
  root: THREE.Object3D;
  skeleton: THREE.Skeleton;
  bindMatrix: THREE.Matrix4;
  /** Bone names in skeleton order — the target for renumbering. */
  boneNames: readonly string[];
}

/**
 * A fresh skeleton from the template GLB. Every villager needs its own:
 * they animate independently, a shared skeleton would move them all in sync.
 */
export function cloneArmature(template: THREE.Object3D): Armature {
  const copy = cloneSkeletonHierarchy(template);

  let source: THREE.SkinnedMesh | null = null;
  const meshes: THREE.Mesh[] = [];
  copy.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh && source === null) source = child;
    if (child instanceof THREE.Mesh) meshes.push(child);
  });

  if (source === null) throw new Error('[merge] в шаблоне нет SkinnedMesh');
  const skinned: THREE.SkinnedMesh = source;

  const armature: Armature = {
    root: copy,
    skeleton: skinned.skeleton,
    bindMatrix: skinned.bindMatrix.clone(),
    boneNames: skinned.skeleton.bones.map((bone) => bone.name),
  };

  // Throw the template's meshes away — only the bones are needed
  for (const mesh of meshes) mesh.removeFromParent();

  return armature;
}

/** How to rewrite a vertex's UV. Returns the new (u, v). */
export type UvRemap = (u: number, v: number) => readonly [number, number];

/**
 * Prepares one part's geometry: a copy, bone renumbering and a UV remap.
 *
 * The new UVs are baked straight into the vertices instead of being set
 * through map.offset: after merging the whole mesh has one material, and a
 * single offset can't colour the head differently from the legs
 * (decision #3).
 */
export function preparePart(
  mesh: THREE.SkinnedMesh,
  targetBoneNames: readonly string[],
  remapUv: UvRemap,
): THREE.BufferGeometry {
  const geometry = mesh.geometry.clone();

  for (const name of Object.keys(geometry.attributes)) {
    if (!(REQUIRED_ATTRIBUTES as readonly string[]).includes(name)) {
      geometry.deleteAttribute(name);
    }
  }
  for (const name of REQUIRED_ATTRIBUTES) {
    if (geometry.getAttribute(name) === undefined) {
      throw new Error(`[merge] у меша "${mesh.name}" нет атрибута ${name}`);
    }
  }

  remapSkinIndices(geometry, mesh.skeleton.bones.map((bone) => bone.name), targetBoneNames);
  applyUvRemap(geometry, remapUv);

  return geometry;
}

function remapSkinIndices(
  geometry: THREE.BufferGeometry,
  sourceBoneNames: readonly string[],
  targetBoneNames: readonly string[],
): void {
  const lookup = sourceBoneNames.map((name) => targetBoneNames.indexOf(name));
  const missing = sourceBoneNames.filter((_, i) => lookup[i] === -1);
  if (missing.length > 0) {
    throw new Error(`[merge] в целевом скелете нет костей: ${missing.join(', ')}`);
  }

  const skinIndex = geometry.getAttribute('skinIndex');
  for (let i = 0; i < skinIndex.count; i++) {
    for (let component = 0; component < skinIndex.itemSize; component++) {
      const source = skinIndex.getComponent(i, component);
      const target = lookup[source];
      if (target === undefined) {
        throw new Error(`[merge] индекс кости ${source} вне диапазона`);
      }
      skinIndex.setComponent(i, component, target);
    }
  }
  skinIndex.needsUpdate = true;
}

function applyUvRemap(geometry: THREE.BufferGeometry, remapUv: UvRemap): void {
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    const [u, v] = remapUv(uv.getX(i), uv.getY(i));
    uv.setXY(i, u, v);
  }
  uv.needsUpdate = true;
}

/**
 * Prepares an attached item — the tool in the hand.
 *
 * The item is not a separate object in the scene graph but part of the same
 * skinned geometry: all its vertices are bound to a single bone with
 * weight 1. The animation moves the bone, the item rides along, and no draw
 * calls are added at all — that is the whole point, there are thirty
 * villagers.
 *
 * The author's geometry sits in the bone's own space, so it has to be moved
 * to where the bone stood at bind time. That matrix is the inverse of the
 * corresponding bone's boneInverses entry.
 */
export function prepareAttachment(
  geometry: THREE.BufferGeometry,
  boneIndex: number,
  boneBindMatrix: THREE.Matrix4,
  uv: readonly [number, number],
): THREE.BufferGeometry {
  for (const name of Object.keys(geometry.attributes)) {
    if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
  }

  const count = geometry.getAttribute('position').count;

  // The whole item points at one atlas texel: the colour is flat, like the
  // rest of the village, and we need no UV unwrap for the primitives
  const uvs = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    uvs[i * 2] = uv[0];
    uvs[i * 2 + 1] = uv[1];
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

  // Attribute types must match the pack's, otherwise mergeGeometries
  // refuses to combine: there JOINTS_0 is Uint8, WEIGHTS_0 is float
  const indices = new Uint8Array(count * 4);
  const weights = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    indices[i * 4] = boneIndex;
    weights[i * 4] = 1;
  }
  geometry.setAttribute('skinIndex', new THREE.BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(weights, 4));

  geometry.applyMatrix4(boneBindMatrix);
  return geometry;
}

/** Combines the prepared pieces into a single geometry. */
export function mergeParts(geometries: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries([...geometries], false);
  if (merged === null) throw new Error('[merge] не удалось склеить геометрии');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
