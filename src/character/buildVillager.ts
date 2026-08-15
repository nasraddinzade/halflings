import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { CHARACTER_SCALE, CHARACTERS_RECEIVE_SHADOW } from '../config/constants';
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
import { cloneArmature, mergeParts, preparePart } from './mergeSkinned';

export interface Villager {
  readonly config: VillagerConfig;
  /** Двигают его; масштаб уже применён. */
  readonly root: THREE.Group;
  readonly mixer: THREE.AnimationMixer;
  readonly triangles: number;
}

/**
 * Библиотека частей: шесть файлов пака, разобранные по мешам.
 * Геометрия из неё только читается — на сборке всегда делается копия.
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
      // Скелет берём из одного файла: у всех он идентичен, но опираться
      // надо на что-то одно, иначе порядок костей поплывёт между жителями
      if (name === 'Rogue') library.template = gltf.scene;

      const image = findTextureImage(gltf.scene);
      if (image === null) throw new Error(`[villagers] в ${name}.glb нет текстуры`);
      sources.push({ file: name, image });
    }

    if (library.template === null) throw new Error('[villagers] не загрузился шаблон скелета');
    library.zoneAtlas = ZoneAtlas.build(sources);
    return library;
  }

  require(name: string): THREE.SkinnedMesh {
    const mesh = this.meshes.get(name);
    if (mesh === undefined) {
      throw new Error(`[villagers] нет меша "${name}"`);
    }
    return mesh;
  }

  get skeletonTemplate(): THREE.Object3D {
    if (this.template === null) throw new Error('[villagers] шаблон скелета не готов');
    return this.template;
  }

  get atlas(): ZoneAtlas {
    if (this.zoneAtlas === null) throw new Error('[villagers] атлас не собран');
    return this.zoneAtlas;
  }
}

/** Паковая текстура нужна, чтобы прочитать цвета её 32 ячеек. */
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

/** Хэш строки в 32 бита. Одно имя — всегда один и тот же житель. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: маленький детерминированный генератор. */
function makeRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('[villagers] пустой список для выбора');
  return item;
}

/**
 * Конфиг жителя выводится из имени детерминированно: один и тот же
 * житель выглядит одинаково между сессиями, и хранить его негде не надо.
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

/** Собирает жителя: части из разных файлов -> один SkinnedMesh. */
export function buildVillager(library: PartLibrary, config: VillagerConfig): Villager {
  const armature = cloneArmature(library.skeletonTemplate);

  // Каждой группе — свой вариант одежды. Руки красятся заодно с телом:
  // рукав и торс должны совпадать по цвету.
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

  const geometry = mergeParts(pieces);
  // Копии больше не нужны: их данные скопированы в общий буфер
  for (const piece of pieces) piece.dispose();

  const mesh = new THREE.SkinnedMesh(geometry);
  mesh.name = `villager_${config.id}`;
  // Скиннинг сбивает bounding sphere: она считается по рест-позе
  mesh.frustumCulled = false;

  const root = new THREE.Group();
  root.name = `villager_${config.id}_root`;
  root.add(armature.root);
  root.add(mesh);
  // Привязку делаем после добавления в граф, иначе bindMatrixInverse
  // посчитается от ещё не обновлённого matrixWorld
  mesh.bind(armature.skeleton, armature.bindMatrix);

  applyStyle(mesh, {
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

  return { config, root, mixer: new THREE.AnimationMixer(root), triangles };
}

function requirePart(
  catalogue: Readonly<Record<string, PartSource>>,
  key: string,
  group: string,
): PartSource {
  const source = catalogue[key];
  if (source === undefined) throw new Error(`[villagers] нет части ${group}="${key}"`);
  return source;
}
