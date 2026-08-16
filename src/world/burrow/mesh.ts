import * as THREE from 'three';

import {
  DIMPLE_INNER,
  DIMPLE_OUTER,
  DOOR_CENTER_HEIGHT,
  MOUND_RINGS,
  MOUND_SEGMENTS,
  type Burrow,
} from '../../config/burrows';
import { PALETTE, darken } from '../../config/palette';
import { faceDistance, type BurrowFace } from './profile';

/**
 * Холм норы одним мешем — вместе с фасадом.
 *
 * Раньше холм жил в рельефе, а срез закрывался отдельной плоской
 * панелью. Пока это две разные вещи, панель обязана быть плоской, и с
 * любого ракурса, кроме фронтального, она читается как приставленный
 * щит. Никакая отделка этого не лечит.
 *
 * Теперь холм — своя поверхность, а «фасад» это просто её участок,
 * вдавленный внутрь под дверь. Плоским остаётся круг радиусом чуть
 * больше метра, всё остальное — кривой купол, который плавно в него
 * переходит. Отдельного фасада больше нет, и выглядеть щитом нечему.
 *
 * Геометрия параметрическая: кольца по высоте, сегменты по кругу.
 * Вершины, попавшие в окрестность двери, притягиваются к дверной
 * плоскости тем сильнее, чем ближе они к её середине.
 */
export function buildMoundMesh(burrow: Burrow, face: BurrowFace): THREE.BufferGeometry {
  const distance = faceDistance(burrow);
  const outX = Math.sin(face.yaw);
  const outZ = Math.cos(face.yaw);
  const leftX = Math.cos(face.yaw);
  const leftZ = -Math.sin(face.yaw);

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const grass = new THREE.Color(PALETTE.grass);
  const dry = new THREE.Color(darken(PALETTE.grass, 0.88));
  const earth = new THREE.Color(PALETTE.earth);
  const color = new THREE.Color();

  for (let ring = 0; ring <= MOUND_RINGS; ring++) {
    // v от 0 у земли до pi/2 на макушке
    const v = (ring / MOUND_RINGS) * (Math.PI / 2);
    const radius = burrow.radius * Math.cos(v);
    const y = burrow.height * Math.sin(v);

    for (let segment = 0; segment <= MOUND_SEGMENTS; segment++) {
      const u = (segment / MOUND_SEGMENTS) * Math.PI * 2;
      let x = radius * Math.cos(u);
      let z = radius * Math.sin(u);

      // В систему двери: forward наружу, side поперёк
      let forward = x * outX + z * outZ;
      const side = x * leftX + z * leftZ;

      // Насколько эта вершина попадает в окрестность проёма
      const fromDoor = Math.hypot(side, y - DOOR_CENTER_HEIGHT);
      const t = Math.min(1, Math.max(0, (fromDoor - DIMPLE_INNER) / (DIMPLE_OUTER - DIMPLE_INNER)));
      const pull = 1 - t * t * (3 - 2 * t);

      if (pull > 0 && forward > distance) {
        // Вдавливаем к дверной плоскости, а не срезаем всё разом
        const flattened = distance + (forward - distance) * (1 - pull);
        const shift = flattened - forward;
        x += outX * shift;
        z += outZ * shift;
        forward = flattened;
      }

      positions.push(x, y, z);

      // У проёма земля, дальше дёрн; к макушке чуть светлее
      const groundTint = grass.clone().lerp(dry, 1 - y / Math.max(0.001, burrow.height));
      color.copy(groundTint).lerp(earth, pull * 0.85);
      colors.push(color.r, color.g, color.b);
    }
  }

  const stride = MOUND_SEGMENTS + 1;
  for (let ring = 0; ring < MOUND_RINGS; ring++) {
    for (let segment = 0; segment < MOUND_SEGMENTS; segment++) {
      const a = ring * stride + segment;
      const b = a + stride;
      // Порядок вершин задаёт сторону грани. Соседний индекс идёт по
      // кругу, следующий ряд — вверх, и обход a -> b -> a+1 даёт нормаль
      // наружу купола. При обратном порядке нормали смотрят внутрь,
      // передние грани оказываются с изнанки, и холм выглядит прозрачным:
      // сквозь ближнюю стенку видно внутреннюю сторону дальней.
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.translate(burrow.x, face.base, burrow.z);
  geometry.computeBoundingSphere();
  return geometry;
}
