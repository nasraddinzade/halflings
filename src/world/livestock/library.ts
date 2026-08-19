import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { ANIMAL_URLS } from '../../config/assets';
import { SLOTS, slotColor, type AnimalDress, type AnimalKind } from '../../config/animals';
import { ANIMAL_LENGTH } from '../../config/constants';

/**
 * Loads the field animals and turns each one into a single mesh.
 *
 * The pack ships one mesh in seven primitives — coat, pale markings,
 * hooves, muzzle, horns and two for the eyes — which arrives as seven
 * separate SkinnedMeshes and would cost seven draw calls plus seven
 * outlines for every animal in the valley. They are merged into one, and
 * the colour that distinguished them is baked into a vertex attribute on
 * the way in. That is the same trick the villagers use (decision #1 and
 * #3): one material, one draw call, and the parts still differ.
 *
 * A merged animal cannot be recoloured afterwards, so the merge happens
 * once per COAT rather than once per kind: three templates for a cow, and
 * a head picks one. Three geometries of 2,450 triangles is 7,350
 * triangles held once for the whole herd.
 */

export interface AnimalTemplate {
  /** Ready to clone: armature plus one merged SkinnedMesh. */
  root: THREE.Object3D;
  clips: THREE.AnimationClip[];
  /** Multiplier that brings the pack's own units to the valley's metres. */
  scale: number;
}

export class AnimalLibrary {
  private readonly templates = new Map<string, AnimalTemplate>();

  private constructor() {}

  static async load(loader: GLTFLoader, coats: readonly AnimalDress[]): Promise<AnimalLibrary> {
    const library = new AnimalLibrary();
    const kinds = Object.keys(ANIMAL_URLS) as AnimalKind[];

    const loaded = await Promise.all(
      kinds.map(async (kind) => ({ kind, gltf: await loader.loadAsync(ANIMAL_URLS[kind]) })),
    );

    for (const { kind, gltf } of loaded) {
      for (let c = 0; c < coats.length; c++) {
        const dress = coats[c];
        if (dress === undefined) continue;
        library.templates.set(key(kind, c), build(gltf, dress));
      }
    }
    return library;
  }

  /** A fresh, independently posable animal. */
  spawn(kind: AnimalKind, coat: number): { root: THREE.Object3D; clips: THREE.AnimationClip[]; scale: number } {
    const template = this.templates.get(key(kind, coat));
    if (template === undefined) throw new Error(`[livestock] no template for ${kind}/${coat}`);
    return { root: cloneSkinned(template.root), clips: template.clips, scale: template.scale };
  }
}

const key = (kind: AnimalKind, coat: number): string => `${kind}:${coat}`;

/**
 * One dressed template out of a loaded file.
 *
 * The seven primitives share a skeleton, so the merged mesh binds to the
 * skeleton the first of them was already using — there is nothing to
 * retarget and no bone to rename.
 */
function build(
  gltf: { scene: THREE.Group; animations: THREE.AnimationClip[] },
  dress: AnimalDress,
): AnimalTemplate {
  // clone first: three templates are built from one loaded file, and each
  // needs its own armature to clone from later
  const root = cloneSkinned(gltf.scene);

  const parts: THREE.SkinnedMesh[] = [];
  root.traverse((child) => {
    if (child instanceof THREE.SkinnedMesh) parts.push(child);
  });
  const first = parts[0];
  if (first === undefined) throw new Error('[livestock] the file has no skinned mesh');

  const pieces: THREE.BufferGeometry[] = [];
  for (const part of parts) {
    const material = Array.isArray(part.material) ? part.material[0] : part.material;
    const name = material?.name ?? '';
    const slot = SLOTS[name];
    // Deliberately fatal. An unmapped material means an animal would be
    // wearing a colour the palette never chose, which is the exact failure
    // decision #6 exists to prevent — and a silent default would hide it
    if (slot === undefined) throw new Error(`[livestock] material "${name}" is not in config/animals.ts SLOTS`);
    pieces.push(paint(part.geometry.clone(), slotColor(slot, dress)));
  }

  const merged = mergeGeometries(pieces, false);
  for (const piece of pieces) piece.dispose();
  if (merged === null) throw new Error('[livestock] could not merge the animal parts');

  const mesh = new THREE.SkinnedMesh(merged);
  mesh.name = 'animal';
  // Same parent as the parts it replaces, so the armature's transform
  // still applies to it
  const parent = first.parent ?? root;
  for (const part of parts) part.removeFromParent();
  parent.add(mesh);
  mesh.bind(first.skeleton, first.bindMatrix);
  mesh.bindMode = first.bindMode;

  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  const box = merged.boundingBox;
  // Scaled by its own length rather than by a number written down here:
  // the pack's animals are modelled at different sizes, and a single
  // multiplier would make the donkey the size of the horse
  const length = box === null ? 1 : Math.max(box.max.z - box.min.z, box.max.x - box.min.x);
  const scale = length > 1e-6 ? ANIMAL_LENGTH / length : 1;

  return { root, clips: gltf.animations, scale };
}

/** Fills a geometry's `color` attribute with one palette tone. */
function paint(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  const color = new THREE.Color(hex);
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    data[i * 3] = color.r;
    data[i * 3 + 1] = color.g;
    data[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
  // The pack's primitives disagree about how wide a joint index is —
  // mergeGeometries needs one type across the whole batch, and the widest
  // is the only one that cannot lose a joint
  const skinIndex = geometry.getAttribute('skinIndex');
  if (skinIndex instanceof THREE.BufferAttribute && !(skinIndex.array instanceof Uint16Array)) {
    const widened = new Uint16Array(skinIndex.array.length);
    widened.set(skinIndex.array as ArrayLike<number>);
    geometry.setAttribute('skinIndex', new THREE.BufferAttribute(widened, skinIndex.itemSize));
  }
  return geometry;
}
