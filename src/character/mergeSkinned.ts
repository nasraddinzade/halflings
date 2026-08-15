import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clone as cloneSkeletonHierarchy } from 'three/examples/jsm/utils/SkeletonUtils.js';

/**
 * Склейка частей персонажа в один SkinnedMesh (решение №1).
 *
 * Без склейки каждый житель стоил бы шесть draw calls; на двадцати
 * жителях это сто двадцать вызовов вместо двадцати.
 *
 * Главная тонкость — перенумерация костей. Атрибут skinIndex хранит не
 * имена костей, а их номера в массиве skin.joints своего файла. Порядок
 * там у каждого файла свой (проверено в docs/ASSETS.md, раздел 3: имена
 * и рест-поза совпадают, а порядок — нет). Если склеить как есть, рука
 * от Мага будет слушаться костей ноги — модель вывернет наизнанку.
 * Поэтому индексы переводятся через имена в порядок целевого скелета.
 */

/** Атрибуты, которые должны быть у всех кусков, иначе merge их не сложит. */
const REQUIRED_ATTRIBUTES = ['position', 'normal', 'uv', 'skinIndex', 'skinWeight'] as const;

export interface Armature {
  /** Узел с иерархией костей, его надо добавить в сцену рядом с мешем. */
  root: THREE.Object3D;
  skeleton: THREE.Skeleton;
  bindMatrix: THREE.Matrix4;
  /** Имена костей в порядке скелета — цель для перенумерации. */
  boneNames: readonly string[];
}

/**
 * Свежий скелет из шаблонного GLB. Каждому жителю нужен свой: они
 * анимируются независимо, общий скелет заставил бы всех двигаться синхронно.
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

  // Меши шаблона выбрасываем — нужны только кости
  for (const mesh of meshes) mesh.removeFromParent();

  return armature;
}

/**
 * Готовит геометрию одной части: копия, перенумерация костей и сдвиг UV.
 *
 * Сдвиг запекается прямо в вершины, а не ставится через map.offset:
 * после склейки на весь меш один материал, и одним offset нельзя
 * покрасить голову иначе, чем ноги (решение №3).
 */
export function preparePart(
  mesh: THREE.SkinnedMesh,
  targetBoneNames: readonly string[],
  uShift: number,
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
  shiftUv(geometry, uShift);

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

function shiftUv(geometry: THREE.BufferGeometry, uShift: number): void {
  if (uShift === 0) return;
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) {
    uv.setX(i, uv.getX(i) + uShift);
  }
  uv.needsUpdate = true;
}

/** Складывает подготовленные куски в одну геометрию. */
export function mergeParts(geometries: readonly THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries([...geometries], false);
  if (merged === null) throw new Error('[merge] не удалось склеить геометрии');
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}
