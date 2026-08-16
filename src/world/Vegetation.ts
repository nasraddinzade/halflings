import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  BUSH_COUNT,
  BUSH_RADIUS,
  GRASS_COUNT,
  GRASS_HEIGHT,
  VALLEY_RADIUS,
  VEGETATION_CHUNKS,
  VEGETATION_MAX_SLOPE,
  VEGETATION_SEED,
  TREE_CLEARING_RADIUS,
  TREE_COUNT,
  TREE_DOOR_CLEARANCE,
  TREE_MAX_SLOPE,
  TREE_TRUNK_RADIUS,
} from '../config/constants';
import { BURROWS } from '../config/burrows';
import { facePoint } from './burrow/profile';
import { PALETTE, darken } from '../config/palette';
import { makeRandom } from '../core/random';
import { toonSurface, toonVertexColored } from '../render/style';
import type { Circle } from './Obstacles';
import { riverCarve } from './heightfield';
import type { Ground } from './Ground';

/**
 * Трава и кусты инстансингом.
 *
 * InstancedMesh рисует тысячи копий одной геометрии за один draw call:
 * видеокарте отдаётся геометрия плюс массив матриц, а не тысяча объектов.
 * Двенадцать тысяч пучков травы обычными мешами стоили бы двенадцать
 * тысяч вызовов и убили бы кадр; здесь их считанные десятки.
 *
 * Разбиение на чанки нужно именно ради отсечения. Один InstancedMesh на
 * всю долину имел бы сферу отсечения размером с долину — то есть был бы
 * виден всегда и рисовался целиком, даже когда в кадре пара кустов.
 * Чанк накрывает свой кусок карты, и три четверти долины за спиной
 * камеры отсекаются бесплатно.
 *
 * Обводки у растительности нет намеренно: контур на пучке в тридцать
 * сантиметров не читается, а draw call'ы удвоил бы.
 */
export class Vegetation {
  private readonly chunks: THREE.InstancedMesh[] = [];
  /** Стволы как препятствия: сквозь дерево ходить нельзя. */
  readonly treeTrunks: Circle[] = [];

  constructor(scene: THREE.Scene, ground: Ground) {
    const random = makeRandom(VEGETATION_SEED);

    const grass = grassGeometry();
    const bush = bushGeometry();

    // Раскладываем по чанкам заранее, чтобы знать размер каждого
    const grassByChunk = scatter(GRASS_COUNT, ground, random);
    const bushByChunk = scatter(BUSH_COUNT, ground, random);

    this.addTrees(scene, ground, random);

    this.addChunks(scene, grass, grassByChunk, PALETTE.grass, PALETTE.grassDry, 'grass');
    // Кусты темнее и зеленее травы. С оливково-серым они читались
    // как валуны, особенно приплюснутые
    this.addChunks(scene, bush, bushByChunk, darken(PALETTE.grass, 0.85), PALETTE.door, 'bush');
  }

  get drawCallCount(): number {
    return this.chunks.length;
  }

  dispose(): void {
    for (const chunk of this.chunks) {
      chunk.geometry.dispose();
      chunk.dispose();
    }
  }

  private addTrees(scene: THREE.Scene, ground: Ground, random: () => number): void {
    addTreesTo(scene, ground, random, this.treeTrunks, this.chunks);
  }

  private addChunks(
    scene: THREE.Scene,
    geometry: THREE.BufferGeometry,
    byChunk: Map<number, Placement[]>,
    colorA: number,
    colorB: number,
    name: string,
  ): void {
    const material = toonSurface(0xffffff);
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const tint = new THREE.Color();

    for (const [key, placements] of byChunk) {
      if (placements.length === 0) continue;

      // Геометрия общая на все чанки: клонируем ссылку, не данные
      const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
      mesh.name = `${name}_chunk_${key}`;
      mesh.castShadow = false;
      // Тень трава принимает: без этого она светится на затенённой земле
      mesh.receiveShadow = true;

      placements.forEach((placement, index) => {
        matrix.compose(placement.position, placement.rotation, placement.scale);
        mesh.setMatrixAt(index, matrix);
        // Цвет инстанса разводит однотонное поле на два оттенка
        color.set(colorA).lerp(tint.set(colorB), placement.tint);
        mesh.setColorAt(index, color);
      });

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
      // Сфера считается по инстансам чанка и потому тесная — ради этого
      // всё и затевалось
      mesh.computeBoundingSphere();

      scene.add(mesh);
      this.chunks.push(mesh);
    }
  }
}

/**
 * Деревья. Ствол и крона разного цвета, но это один инстансовый меш:
 * цвет запечён в вершины, а не задан материалом. Иначе на каждый чанк
 * приходилось бы по два InstancedMesh ради двух цветов.
 */
function addTreesTo(
  scene: THREE.Scene,
  ground: Ground,
  random: () => number,
  trunks: Circle[],
  chunks: THREE.InstancedMesh[],
): void {
  const doors = BURROWS.map((burrow) => facePoint(burrow));
  const geometry = treeGeometry();
  const material = toonVertexColored();
  const chunkSize = (VALLEY_RADIUS * 2) / VEGETATION_CHUNKS;
  const byChunk = new Map<number, Placement[]>();

  for (let i = 0; i < TREE_COUNT; i++) {
    const radius = Math.sqrt(random()) * VALLEY_RADIUS * 0.92;
    const angle = random() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    // Середина долины остаётся открытой: там деревня и площадь
    if (radius < TREE_CLEARING_RADIUS) continue;

    const sample = ground.sample(x, z);
    if (sample === null || sample.slope > TREE_MAX_SLOPE) continue;
    if (riverCarve(x, z) > 0.05) continue;
    if (doors.some((d) => Math.hypot(x - d.x, z - d.z) < TREE_DOOR_CLEARANCE)) continue;

    const scale = 0.75 + random() * 0.65;
    byChunk.set(0, byChunk.get(0) ?? []);
    const placement: Placement = {
      position: new THREE.Vector3(x, sample.height, z),
      rotation: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        random() * Math.PI * 2,
      ),
      scale: new THREE.Vector3(scale, scale * (0.85 + random() * 0.4), scale),
      tint: random(),
    };

    const key = Math.floor((z + VALLEY_RADIUS) / chunkSize) * VEGETATION_CHUNKS
      + Math.floor((x + VALLEY_RADIUS) / chunkSize);
    const bucket = byChunk.get(key);
    if (bucket === undefined) byChunk.set(key, [placement]);
    else bucket.push(placement);

    trunks.push({ x, z, radius: TREE_TRUNK_RADIUS * scale });
  }
  byChunk.delete(0);

  const matrix = new THREE.Matrix4();
  for (const [key, placements] of byChunk) {
    if (placements.length === 0) continue;
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    mesh.name = `tree_chunk_${key}`;
    // Тень от деревьев держит долину вместе; коробка теней невелика,
    // так что в проход попадают только ближние чанки
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    placements.forEach((placement, index) => {
      matrix.compose(placement.position, placement.rotation, placement.scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();

    scene.add(mesh);
    chunks.push(mesh);
  }
}

/** Ствол и две кроны, цвет — в атрибут вершин. */
function treeGeometry(): THREE.BufferGeometry {
  const paint = (geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
    const color = new THREE.Color(hex);
    const count = geometry.getAttribute('position').count;
    const data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      data[i * 3] = color.r;
      data[i * 3 + 1] = color.g;
      data[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
    return geometry;
  };

  // Цилиндр индексированный, а икосаэдр нет: mergeGeometries требует,
  // чтобы индекс был либо у всех, либо ни у кого. Сводим к «ни у кого» —
  // обратный путь через mergeVertices сварил бы гранёные кроны в гладкие
  const trunk = new THREE.CylinderGeometry(0.17, 0.26, 2.3, 6).toNonIndexed();
  trunk.translate(0, 1.15, 0);

  const lower = new THREE.IcosahedronGeometry(1.5, 0);
  lower.scale(1, 1.1, 1);
  lower.translate(0, 3.1, 0);

  const upper = new THREE.IcosahedronGeometry(1.05, 0);
  upper.translate(0.22, 4.35, -0.12);

  const merged = mergeGeometries([
    paint(trunk, PALETTE.woodDark),
    paint(lower, darken(PALETTE.grass, 0.82)),
    paint(upper, darken(PALETTE.grass, 0.95)),
  ], false);
  if (merged === null) throw new Error('[vegetation] не удалось склеить дерево');
  return merged;
}

interface Placement {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: THREE.Vector3;
  tint: number;
}

/** Раскладывает точки по долине и группирует их по чанкам. */
function scatter(count: number, ground: Ground, random: () => number): Map<number, Placement[]> {
  const byChunk = new Map<number, Placement[]>();
  const axis = new THREE.Vector3(0, 1, 0);
  const chunkSize = (VALLEY_RADIUS * 2) / VEGETATION_CHUNKS;

  for (let i = 0; i < count; i++) {
    // Корень от радиуса даёт равномерную плотность по площади: без него
    // всё сбилось бы к центру
    const radius = Math.sqrt(random()) * VALLEY_RADIUS * 0.95;
    const angle = random() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const sample = ground.sample(x, z);
    if (sample === null) continue;
    // На круче трава не держится — и заодно борт долины остаётся голым
    if (sample.slope > VEGETATION_MAX_SLOPE) continue;
    // И в реке тоже: пучки, торчащие из воды, сразу выдают подделку
    if (riverCarve(x, z) > 0.05) continue;

    const scale = 0.7 + random() * 0.6;
    const placement: Placement = {
      position: new THREE.Vector3(x, sample.height, z),
      rotation: new THREE.Quaternion().setFromAxisAngle(axis, random() * Math.PI * 2),
      scale: new THREE.Vector3(scale, scale * (0.8 + random() * 0.5), scale),
      tint: random(),
    };

    const cx = Math.floor((x + VALLEY_RADIUS) / chunkSize);
    const cz = Math.floor((z + VALLEY_RADIUS) / chunkSize);
    const key = cz * VEGETATION_CHUNKS + cx;

    const bucket = byChunk.get(key);
    if (bucket === undefined) byChunk.set(key, [placement]);
    else bucket.push(placement);
  }

  return byChunk;
}

/**
 * Пучок травы: четырёхгранная пирамидка без донышка — четыре треугольника.
 * Донышко всё равно прижато к земле, а на тридцати тысячах инстансов
 * это вдвое меньше геометрии.
 */
function grassGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(GRASS_HEIGHT * 0.3, GRASS_HEIGHT, 4, 1, true);
  // Конус строится вокруг центра, а сажать его надо основанием на землю
  geometry.translate(0, GRASS_HEIGHT / 2, 0);
  return geometry;
}

/**
 * Куст: гранёный шар чуть выше своей ширины. Приплюснутый читался
 * как камень — форма важнее цвета.
 */
function bushGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(BUSH_RADIUS, 0);
  geometry.scale(1, 1.15, 1);
  geometry.translate(0, BUSH_RADIUS * 0.8, 0);
  return geometry;
}
