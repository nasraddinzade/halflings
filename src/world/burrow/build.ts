import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  BURROWS,
  DOOR_CENTER_HEIGHT,
  DOOR_FRAME_RADIUS,
  DOOR_FRAME_TUBE,
  DOOR_RADIUS,
  COLLAR_DEPTH,
  COLLAR_FLARE,
  COLLAR_RADIUS,
  FACE_OFFSET,
  type Burrow,
} from '../../config/burrows';
import { PALETTE } from '../../config/palette';
import { hashSeed, makeRandom } from '../../core/random';
import { DOOR_TOP, faceOf, type BurrowFace } from './profile';

/**
 * Построитель нор. Из четырёх чисел на нору получает готовый фасад.
 *
 * Ключевое место — фасад строится как ФИГУРА С ДЫРОЙ: контур повторяет
 * силуэт среза холма, дыра приходится ровно на проём. Поэтому дверь
 * физически не может быть перекрыта землёй, а фасад не может не сойтись
 * с холмом: и то и другое считается из одной функции купола.
 *
 * Цвет запечён в вершины: у проёма земля, дальше трава, так что фасад
 * сливается с холмом, не требуя второго меша и второго draw call.
 */

export interface BurrowBuild {
  /** Меши по назначению: фасад отдельно, столярка отдельно. */
  face: THREE.BufferGeometry;
  woodwork: Map<number, THREE.BufferGeometry>;
  /** Куда игрок не должен проходить. */
  blockers: Array<{ x: number; z: number; radius: number }>;
}

export function buildBurrows(valleyFloorAt: (x: number, z: number) => number): BurrowBuild {
  const faces: THREE.BufferGeometry[] = [];
  const byColor = new Map<number, THREE.BufferGeometry[]>();
  const blockers: BurrowBuild['blockers'] = [];

  const add = (color: number, geometry: THREE.BufferGeometry): void => {
    const bucket = byColor.get(color);
    if (bucket === undefined) byColor.set(color, [geometry]);
    else bucket.push(geometry);
  };

  for (const burrow of BURROWS) {
    const face = faceOf(burrow, valleyFloorAt);
    checkFits(burrow, face);

    const random = makeRandom(hashSeed(burrow.id));
    const place = (geometry: THREE.BufferGeometry, forward: number): THREE.BufferGeometry => {
      geometry.translate(0, 0, forward);
      geometry.rotateY(face.yaw);
      geometry.translate(face.x, face.base, face.z);
      return geometry;
    };

    // Задник закрывает рваный край ниши, раструб — её бока и верх
    faces.push(place(backing(), FACE_OFFSET));
    faces.push(place(collar(), FACE_OFFSET));

    // Тёмная глубина за створкой
    const recess = new THREE.CircleGeometry(DOOR_FRAME_RADIUS, 20);
    recess.translate(0, DOOR_CENTER_HEIGHT, 0);
    add(PALETTE.ink, place(recess, FACE_OFFSET + 0.01));

    const panel = new THREE.CircleGeometry(DOOR_RADIUS, 20);
    panel.translate(0, DOOR_CENTER_HEIGHT, 0);
    add(PALETTE.wood, place(panel, FACE_OFFSET + 0.06));

    const frame = new THREE.TorusGeometry(DOOR_FRAME_RADIUS, DOOR_FRAME_TUBE, 8, 22);
    frame.translate(0, DOOR_CENTER_HEIGHT, 0);
    add(PALETTE.woodDark, place(frame, FACE_OFFSET + 0.05));

    const knob = new THREE.SphereGeometry(0.06, 8, 6);
    knob.translate(0, DOOR_CENTER_HEIGHT, 0);
    add(PALETTE.thatch, place(knob, FACE_OFFSET + 0.12));

    const step = new THREE.BoxGeometry(1.5, 0.12, 0.6);
    step.translate(0, 0.06, 0);
    add(PALETTE.rock, place(step, FACE_OFFSET + 0.36));

    // Круглое окно сбоку — не у каждой норы, чтобы они не были близнецами
    if (random() > 0.35) {
      const side = random() > 0.5 ? 1 : -1;
      const offset = side * (DOOR_FRAME_RADIUS + 0.85);
      const height = DOOR_CENTER_HEIGHT + 0.28;

      const glass = new THREE.CircleGeometry(0.26, 14);
      glass.translate(offset, height, 0);
      add(PALETTE.water, place(glass, FACE_OFFSET + 0.04));

      const rim = new THREE.TorusGeometry(0.29, 0.05, 6, 16);
      rim.translate(offset, height, 0);
      add(PALETTE.woodDark, place(rim, FACE_OFFSET + 0.04));
    }

    // Труба на макушке холма
    const pipe = new THREE.CylinderGeometry(0.14, 0.17, 0.62, 8);
    pipe.translate(0, burrow.height + 0.18, 0);
    const pipeGeometry = pipe.clone();
    pipeGeometry.translate(burrow.x, face.base, burrow.z);
    add(PALETTE.rock, pipeGeometry);
    pipe.dispose();

    blockers.push({ x: face.x, z: face.z, radius: DOOR_FRAME_RADIUS + 0.35 });
  }

  const face = mergeGeometries(faces, false);
  for (const geometry of faces) geometry.dispose();
  if (face === null) throw new Error('[burrow] не удалось склеить фасады');

  const woodwork = new Map<number, THREE.BufferGeometry>();
  for (const [color, geometries] of byColor) {
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (merged === null) throw new Error('[burrow] не удалось склеить столярку');
    merged.computeBoundingSphere();
    woodwork.set(color, merged);
  }

  face.computeBoundingSphere();
  return { face, woodwork, blockers };
}

/**
 * Задник проёма: плоский диск земли в дверной плоскости.
 *
 * Он закрывает рваный край ниши, но сам по себе плоский, поэтому его
 * видно только внутри раструба — снаружи раструб его загораживает.
 * Именно поэтому нора больше не читается щитом: плоского в ней остаётся
 * полтора метра в поперечнике, а не одиннадцать.
 */
function backing(): THREE.BufferGeometry {
  const geometry = new THREE.CircleGeometry(COLLAR_RADIUS, 24);
  geometry.translate(0, DOOR_CENTER_HEIGHT, 0);
  paintFace(geometry);
  return geometry;
}

/**
 * Раструб: усечённый конус, надетый на проём и чуть выступающий из
 * склона. Он объёмный, и с любой стороны читается как проём в холме,
 * а не как приставленная плоскость.
 */
function collar(): THREE.BufferGeometry {
  const geometry = new THREE.CylinderGeometry(
    COLLAR_RADIUS + COLLAR_FLARE, COLLAR_RADIUS, COLLAR_DEPTH, 24, 1, true,
  );
  // Ось конуса вдоль взгляда двери
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, DOOR_CENTER_HEIGHT, COLLAR_DEPTH * 0.5);
  paintFace(geometry);
  return geometry;
}

/** Земля у проёма, трава дальше — цвет прямо в вершины. */
function paintFace(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const earth = new THREE.Color(PALETTE.earth);
  const grass = new THREE.Color(PALETTE.grass);
  const color = new THREE.Color();
  const data = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i++) {
    const s = position.getX(i);
    const y = position.getY(i);
    const distance = Math.hypot(s, y - DOOR_CENTER_HEIGHT);
    // К краю раструба земля переходит в дёрн, чтобы он врастал в холм
    const t = Math.min(1, Math.max(0, (distance - DOOR_FRAME_RADIUS) / (COLLAR_RADIUS - DOOR_FRAME_RADIUS)));
    color.copy(earth).lerp(grass, (t * t * (3 - 2 * t)) * 0.55);
    data[i * 3] = color.r;
    data[i * 3 + 1] = color.g;
    data[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
}

/**
 * Проверка, которую раньше делал я глазами и дважды ошибся: помещается
 * ли дверь в срез. Генератор обязан ловить это сам, иначе добавленная
 * в данные нора молча выйдет кривой.
 */
function checkFits(burrow: Burrow, face: BurrowFace): void {
  if (face.height < DOOR_TOP) {
    console.error(
      `[burrow] ${burrow.id}: срез высотой ${face.height.toFixed(2)} м, ` +
      `а наличник ${DOOR_TOP.toFixed(2)} м — холм низковат, поднимите height`,
    );
  }
  if (face.halfWidth < DOOR_FRAME_RADIUS + 0.6) {
    console.error(
      `[burrow] ${burrow.id}: срез шириной ${(face.halfWidth * 2).toFixed(2)} м — ` +
      'дверь не обрамить, увеличьте radius',
    );
  }
}
