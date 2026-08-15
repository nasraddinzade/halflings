import * as THREE from 'three';

import {
  BUSH_COUNT,
  BUSH_RADIUS,
  GRASS_COUNT,
  GRASS_HEIGHT,
  VALLEY_RADIUS,
  VEGETATION_CHUNKS,
  VEGETATION_MAX_SLOPE,
  VEGETATION_SEED,
} from '../config/constants';
import { PALETTE, darken } from '../config/palette';
import { makeRandom } from '../core/random';
import { toonSurface } from '../render/style';
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

  constructor(scene: THREE.Scene, ground: Ground) {
    const random = makeRandom(VEGETATION_SEED);

    const grass = grassGeometry();
    const bush = bushGeometry();

    // Раскладываем по чанкам заранее, чтобы знать размер каждого
    const grassByChunk = scatter(GRASS_COUNT, ground, random);
    const bushByChunk = scatter(BUSH_COUNT, ground, random);

    this.addChunks(scene, grass, grassByChunk, PALETTE.grass, PALETTE.grassDry, 'grass');
    // Кусты темнее травы, иначе на её фоне они не читаются
    this.addChunks(scene, bush, bushByChunk, darken(PALETTE.grass, 0.78), PALETTE.groundBounce, 'bush');
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

/** Куст: гранёный шар, полусферой над землёй. */
function bushGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(BUSH_RADIUS, 0);
  geometry.scale(1, 0.75, 1);
  geometry.translate(0, BUSH_RADIUS * 0.5, 0);
  return geometry;
}
