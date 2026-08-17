import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  CHARACTER_BOUNDS_MARGIN,
  CHARACTER_SCALE,
  CHARACTERS_RECEIVE_SHADOW,
} from '../config/constants';
import { PART_URLS } from '../config/assets';
import {
  ARMS,
  BODIES,
  HEADS,
  LEGS,
  PART_FILES,
  ROLES,
  type PartSource,
  type VillagerConfig,
} from '../config/villagers';
import { CLOTH_VARIANT_COUNT } from '../config/constants';
import { ZoneAtlas, type AtlasSource } from '../render/atlas';
import { applyStyle } from '../render/style';
import { hashSeed, makeRandom, pick } from '../core/random';
import { toolForRole } from '../config/tools';
import { cloneArmature, mergeParts, prepareAttachment, preparePart } from './mergeSkinned';

/**
 * Empty attachment bone at the end of the hand (docs/ASSETS.md, section 3).
 *
 * The name is run through three's sanitiser: in the glTF the bone is called
 * `handslot.r`, but for three a dot is a property-path separator and gets
 * stripped at load time. In the skeleton the bone sits under `handslotr`.
 */
const HAND_SLOT_BONE = THREE.PropertyBinding.sanitizeNodeName('handslot.r');

export interface Villager {
  readonly config: VillagerConfig;
  /** This is what you move; the scale is already applied. */
  readonly root: THREE.Group;
  readonly mesh: THREE.SkinnedMesh;
  /** Outlines: switched off at long distances (step 6). */
  readonly outlines: readonly THREE.Mesh[];
  readonly mixer: THREE.AnimationMixer;
  readonly triangles: number;
}

/**
 * Part library: the pack's six files, taken apart into meshes.
 * Its geometry is only ever read — assembly always works on a copy.
 */
export class PartLibrary {
  private readonly meshes = new Map<string, THREE.SkinnedMesh>();
  private template: THREE.Object3D | null = null;
  private zoneAtlas: ZoneAtlas | null = null;

  static async load(loader: GLTFLoader): Promise<PartLibrary> {
    const library = new PartLibrary();
    const files = await Promise.all(
      PART_FILES.map(async (name) => ({ name, gltf: await loader.loadAsync(PART_URLS[name]) })),
    );

    const sources: AtlasSource[] = [];

    for (const { name, gltf } of files) {
      gltf.scene.traverse((child) => {
        if (child instanceof THREE.SkinnedMesh) library.meshes.set(child.name, child);
      });
      // Take the skeleton from a single file: it is identical everywhere,
      // but we need one fixed reference, or bone order drifts per villager
      if (name === 'Rogue') library.template = gltf.scene;

      const image = findTextureImage(gltf.scene);
      if (image === null) throw new Error(`[villagers] no texture in ${name}.glb`);
      sources.push({ file: name, image });
    }

    if (library.template === null) throw new Error('[villagers] skeleton template did not load');
    library.zoneAtlas = ZoneAtlas.build(sources);
    return library;
  }

  require(name: string): THREE.SkinnedMesh {
    const mesh = this.meshes.get(name);
    if (mesh === undefined) {
      throw new Error(`[villagers] no mesh "${name}"`);
    }
    return mesh;
  }

  get skeletonTemplate(): THREE.Object3D {
    if (this.template === null) throw new Error('[villagers] skeleton template is not ready');
    return this.template;
  }

  get atlas(): ZoneAtlas {
    if (this.zoneAtlas === null) throw new Error('[villagers] atlas is not built');
    return this.zoneAtlas;
  }
}

/** The pack texture is needed to read the colours of its 32 cells. */
function findTextureImage(root: THREE.Object3D): AtlasSource['image'] | null {
  let found: AtlasSource['image'] | null = null;
  root.traverse((child) => {
    if (found !== null || !(child instanceof THREE.Mesh)) return;
    const material = child.material;
    if (Array.isArray(material) || !('map' in material)) return;
    const image: unknown = material.map?.image;
    if (image !== null && typeof image === 'object' && 'width' in image && 'height' in image) {
      found = image as AtlasSource['image'];
    }
  });
  return found;
}

/**
 * A villager's config is derived from the name deterministically: the same
 * villager looks the same between sessions, and nothing has to be stored.
 */
export function configFromSeed(name: string): VillagerConfig {
  const random = makeRandom(hashSeed(name));

  return {
    id: name,
    head: pick(Object.keys(HEADS), random),
    body: pick(Object.keys(BODIES), random),
    arms: pick(Object.keys(ARMS), random),
    legs: pick(Object.keys(LEGS), random),
    palette: {
      head: Math.floor(random() * CLOTH_VARIANT_COUNT),
      body: Math.floor(random() * CLOTH_VARIANT_COUNT),
      legs: Math.floor(random() * CLOTH_VARIANT_COUNT),
    },
    role: pick(ROLES, random),
  };
}

/** Assembles a villager: parts from different files -> one SkinnedMesh. */
export function buildVillager(library: PartLibrary, config: VillagerConfig): Villager {
  const armature = cloneArmature(library.skeletonTemplate);

  // Each group gets its own clothing variant. The arms are coloured along
  // with the body: sleeve and torso have to match in colour.
  const atlas = library.atlas;
  const groups: Array<{ source: PartSource; variant: number }> = [
    { source: requirePart(HEADS, config.head, 'head'), variant: config.palette.head },
    { source: requirePart(BODIES, config.body, 'body'), variant: config.palette.body },
    { source: requirePart(ARMS, config.arms, 'arms'), variant: config.palette.body },
    { source: requirePart(LEGS, config.legs, 'legs'), variant: config.palette.legs },
  ];

  const pieces: THREE.BufferGeometry[] = [];
  for (const { source, variant } of groups) {
    for (const meshName of source.meshes) {
      pieces.push(preparePart(
        library.require(meshName),
        armature.boneNames,
        (u, v) => atlas.remap(source.file, variant, u, v),
      ));
    }
  }

  addTool(pieces, library, armature, config);

  const geometry = mergeParts(pieces);
  // The copies are no longer needed: their data went into the shared buffer
  for (const piece of pieces) piece.dispose();

  const mesh = new THREE.SkinnedMesh(geometry);
  mesh.name = `villager_${config.id}`;
  // The culling sphere is computed from the rest pose and is a bit tight
  // once the character moves: we widen it with margin and leave culling on.
  // Turning culling off would be easier, but then all thirty villagers are
  // drawn every frame, even the ones behind the camera.
  if (geometry.boundingSphere !== null) {
    geometry.boundingSphere.radius *= CHARACTER_BOUNDS_MARGIN;
  }
  mesh.frustumCulled = true;

  const root = new THREE.Group();
  root.name = `villager_${config.id}_root`;
  root.add(armature.root);
  root.add(mesh);
  // Bind after adding to the graph, otherwise bindMatrixInverse gets
  // computed from a matrixWorld that hasn't been updated yet
  mesh.bind(armature.skeleton, armature.bindMatrix);

  const outlines = applyStyle(mesh, {
    color: 0xffffff,
    map: library.atlas.texture,
    outline: true,
    receiveShadow: CHARACTERS_RECEIVE_SHADOW,
  });

  root.scale.setScalar(CHARACTER_SCALE);

  const index = geometry.getIndex();
  const triangles = index === null
    ? geometry.getAttribute('position').count / 3
    : index.count / 3;

  return { config, root, mesh, outlines, mixer: new THREE.AnimationMixer(root), triangles };
}

/** Puts the tool for the role into the right hand. */
function addTool(
  pieces: THREE.BufferGeometry[],
  library: PartLibrary,
  armature: ReturnType<typeof cloneArmature>,
  config: VillagerConfig,
): void {
  const parts = toolForRole(config.role);
  if (parts.length === 0) return;

  const boneIndex = armature.boneNames.indexOf(HAND_SLOT_BONE);
  if (boneIndex === -1) throw new Error(`[villagers] skeleton has no bone ${HAND_SLOT_BONE}`);

  const boneInverse = armature.skeleton.boneInverses[boneIndex];
  if (boneInverse === undefined) throw new Error('[villagers] no inverse matrix for the bone');
  // The item goes wherever the bone was pointing at bind time
  const bindMatrix = boneInverse.clone().invert();

  for (const part of parts) {
    pieces.push(prepareAttachment(
      part.geometry,
      boneIndex,
      bindMatrix,
      library.atlas.propUv(part.zone, config.palette.body),
    ));
  }
}

function requirePart(
  catalogue: Readonly<Record<string, PartSource>>,
  key: string,
  group: string,
): PartSource {
  const source = catalogue[key];
  if (source === undefined) throw new Error(`[villagers] no part ${group}="${key}"`);
  return source;
}
