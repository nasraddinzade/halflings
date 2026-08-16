import * as THREE from 'three';

import {
  BANK_WIDTH,
  GROUND_DIRT_SLOPE,
  GROUND_PATCH_FREQUENCY,
  GROUND_ROCK_SLOPE,
  PATH_BLEND,
  PATH_WIDTH,
  SPAWN_X,
  SPAWN_Z,
} from '../config/constants';
import { PALETTE } from '../config/palette';
import { BURROWS, doorPosition } from '../config/burrows';
import { WORK_POINTS, propPosition } from '../config/work';
import { hashSeed, makeRandom } from '../core/random';
import { heightAt, riverCarve } from './heightfield';

/**
 * Цвет земли по вершинам террейна.
 *
 * До этого вся долина была одного ровного зелёного тона, и это выдавало
 * дешевизну сильнее, чем любая недостающая модель: настоящая земля не
 * бывает однородной. Здесь она темнеет на откосах, оголяется у воды,
 * седеет на борту и вытаптывается там, где ходят.
 *
 * Цвет ложится в атрибут вершин, поэтому не стоит ни одного лишнего
 * draw call и ни одного байта текстуры. Считается один раз на старте.
 */

/** Отрезок тропы: от площади к двери или к рабочему месту. */
interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

function buildPaths(): Segment[] {
  const segments: Segment[] = [];

  // От площади к каждой двери
  for (const burrow of BURROWS) {
    const door = doorPosition(burrow);
    segments.push({ ax: SPAWN_X, az: SPAWN_Z, bx: door.x, bz: door.z });
  }

  // И к середине каждого скопления рабочих мест: тропа к огородам одна,
  // а не пять — иначе от площади расходилась бы звезда
  const byRole = new Map<string, { x: number; z: number; count: number }>();
  for (const point of WORK_POINTS) {
    const spot = propPosition(point);
    const acc = byRole.get(point.role) ?? { x: 0, z: 0, count: 0 };
    acc.x += spot.x;
    acc.z += spot.z;
    acc.count++;
    byRole.set(point.role, acc);
  }
  for (const acc of byRole.values()) {
    segments.push({ ax: SPAWN_X, az: SPAWN_Z, bx: acc.x / acc.count, bz: acc.z / acc.count });
  }

  return segments;
}

/** Расстояние от точки до отрезка на плоскости. */
function distanceToSegment(x: number, z: number, s: Segment): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-8) return Math.hypot(x - s.ax, z - s.az);

  let t = ((x - s.ax) * dx + (z - s.az) * dz) / lengthSquared;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Наклон поверхности в точке, по конечной разности. */
function slopeAt(x: number, z: number): number {
  const h = heightAt(x, z);
  const step = 0.5;
  return Math.atan(Math.hypot(heightAt(x + step, z) - h, heightAt(x, z + step) - h) / step);
}

/**
 * Досчитывает атрибут `color` для геометрии террейна.
 * Геометрия должна быть уже смещена по высоте.
 */
export function paintGround(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const paths = buildPaths();
  const random = makeRandom(hashSeed('ground'));
  // Сдвиг узора пятен: без него пятна цеплялись бы к сетке рельефа
  const patchOffset = random() * 1000;

  const grass = new THREE.Color(PALETTE.grass);
  const dry = new THREE.Color(PALETTE.grassDry);
  const earth = new THREE.Color(PALETTE.earth);
  const rock = new THREE.Color(PALETTE.rock);
  const current = new THREE.Color();

  const data = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);

    // Крупные пятна сухой травы: две синусоиды вместо шума — дёшево
    // и не даёт видимого повтора на таком масштабе
    const patch = 0.5 + 0.5 * Math.sin(
      (x + patchOffset) * GROUND_PATCH_FREQUENCY,
    ) * Math.cos((z - patchOffset) * GROUND_PATCH_FREQUENCY * 1.3);
    current.copy(grass).lerp(dry, patch * 0.45);

    // Откосы: чем круче, тем больше земли сквозь дёрн, а на самом
    // крутом — камень борта
    const slope = slopeAt(x, z);
    current.lerp(earth, smoothstep(GROUND_DIRT_SLOPE, GROUND_ROCK_SLOPE, slope) * 0.85);
    current.lerp(rock, smoothstep(GROUND_ROCK_SLOPE, GROUND_ROCK_SLOPE + 0.25, slope) * 0.7);

    // Берег: у воды трава не растёт
    const carve = riverCarve(x, z);
    if (carve > 0.01) {
      current.lerp(earth, 1 - smoothstep(0, BANK_WIDTH, Math.abs(carve - 0.75)));
    }

    // Тропы. Считаем по ближайшему отрезку: перекрывающиеся тропы
    // не должны складываться в пятно у площади
    let nearest = Infinity;
    for (const segment of paths) {
      const d = distanceToSegment(x, z, segment);
      if (d < nearest) nearest = d;
    }
    current.lerp(earth, (1 - smoothstep(PATH_WIDTH, PATH_WIDTH + PATH_BLEND, nearest)) * 0.8);

    data[i * 3] = current.r;
    data[i * 3 + 1] = current.g;
    data[i * 3 + 2] = current.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
}
