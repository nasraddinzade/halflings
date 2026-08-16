import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  BURROWS,
  DOOR_CENTER_HEIGHT,
  DOOR_FRAME_RADIUS,
  DOOR_FRAME_TUBE,
  DOOR_RADIUS,
  FACE_OFFSET,
  FACE_SILHOUETTE_STEPS,
  FACE_SINK,
  PATH_STONES,
  type Burrow,
} from '../../config/burrows';
import { PALETTE, darken } from '../../config/palette';
import { hashSeed, makeRandom } from '../../core/random';
import { DOOR_TOP, faceOf, faceSilhouette, type BurrowFace } from './profile';

/**
 * Построитель нор. Из четырёх чисел на нору собирает готовый дом.
 *
 * Состав взят с натуры (двери Хоббитона): срез холма забран каменной
 * стенкой, в ней круглый проём, проём обрамлён толстой деревянной аркой
 * со спицами, перед дверью плитняк. Прежний фасад был земляным пятном,
 * и дом читался как дыра в пригорке.
 *
 * Фасад строится как фигура с дырой: контур повторяет силуэт среза,
 * отверстие приходится ровно на проём. Поэтому дверь не может быть
 * перекрыта землёй, а фасад не может разойтись с холмом.
 */

export interface BurrowBuild {
  /** Каменная стенка фасада, с цветом в вершинах. */
  face: THREE.BufferGeometry;
  /** Столярка и камень дорожки, по цветам. */
  parts: Map<number, THREE.BufferGeometry>;
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

    faces.push(place(facePanel(burrow, face), FACE_OFFSET));

    // Тёмная глубина за створкой
    const recess = new THREE.CircleGeometry(DOOR_FRAME_RADIUS, 22);
    recess.translate(0, DOOR_CENTER_HEIGHT, 0);
    add(PALETTE.ink, place(recess, FACE_OFFSET + 0.01));

    const leaf = new THREE.CircleGeometry(DOOR_RADIUS, 22);
    leaf.translate(0, DOOR_CENTER_HEIGHT, 0);
    add(PALETTE.wood, place(leaf, FACE_OFFSET + 0.07));

    for (const part of doorFrame()) add(part.color, place(part.geometry, FACE_OFFSET + 0.06));

    const knob = new THREE.SphereGeometry(0.07, 8, 6);
    knob.translate(0, DOOR_CENTER_HEIGHT, 0);
    add(PALETTE.thatch, place(knob, FACE_OFFSET + 0.14));

    for (const stone of pathStones(random)) add(PALETTE.rock, place(stone, FACE_OFFSET));

    // Труба на макушке холма
    const pipe = new THREE.CylinderGeometry(0.13, 0.16, 0.6, 8);
    pipe.translate(burrow.x, face.base + burrow.height - 0.15, burrow.z);
    add(PALETTE.rock, pipe);

    blockers.push({ x: face.x, z: face.z, radius: DOOR_FRAME_RADIUS + 0.4 });
  }

  const face = mergeGeometries(faces, false);
  for (const geometry of faces) geometry.dispose();
  if (face === null) throw new Error('[burrow] не удалось склеить фасады');
  face.computeBoundingSphere();

  const parts = new Map<number, THREE.BufferGeometry>();
  for (const [color, geometries] of byColor) {
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (merged === null) throw new Error('[burrow] не удалось склеить детали');
    merged.computeBoundingSphere();
    parts.set(color, merged);
  }

  return { face, parts, blockers };
}

/** Каменная стенка среза с круглым проёмом. */
function facePanel(burrow: Burrow, face: BurrowFace): THREE.BufferGeometry {
  const silhouette = faceSilhouette(burrow, face, FACE_SILHOUETTE_STEPS, FACE_SINK);
  const first = silhouette[0];
  if (first === undefined) throw new Error('[burrow] пустой силуэт среза');

  const shape = new THREE.Shape();
  shape.moveTo(first.s, first.bottom);
  for (const point of silhouette) shape.lineTo(point.s, point.top);
  for (let i = silhouette.length - 1; i >= 0; i--) {
    const point = silhouette[i];
    if (point !== undefined) shape.lineTo(point.s, point.bottom);
  }
  shape.closePath();

  // Дыра чуть шире наличника: иначе на стыке видна щель в холм
  const hole = new THREE.Path();
  hole.absarc(0, DOOR_CENTER_HEIGHT, DOOR_FRAME_RADIUS + 0.02, 0, Math.PI * 2, true);
  shape.holes.push(hole);

  const geometry = new THREE.ShapeGeometry(shape, 22);
  paintStonework(geometry);
  return geometry;
}

/**
 * Кладка: светлый камень, местами темнее. Рисунок задаётся положением
 * вершины, поэтому не требует ни текстуры, ни лишнего материала.
 */
function paintStonework(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const stone = new THREE.Color(PALETTE.plaster);
  const shade = new THREE.Color(darken(PALETTE.rock, 0.85));
  const color = new THREE.Color();
  const data = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i++) {
    const s = position.getX(i);
    const y = position.getY(i);
    const course = 0.5 + 0.5 * Math.sin(y * 7.3) * Math.cos(s * 5.1 + y * 2.7);
    color.copy(stone).lerp(shade, 0.25 + course * 0.35);
    data[i * 3] = color.r;
    data[i * 3 + 1] = color.g;
    data[i * 3 + 2] = color.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
}

/** Толстая деревянная арка со спицами — примета круглой двери. */
function doorFrame(): Array<{ geometry: THREE.BufferGeometry; color: number }> {
  const parts: Array<{ geometry: THREE.BufferGeometry; color: number }> = [];

  const ring = new THREE.TorusGeometry(DOOR_FRAME_RADIUS, DOOR_FRAME_TUBE, 8, 24);
  ring.translate(0, DOOR_CENTER_HEIGHT, 0);
  parts.push({ geometry: ring, color: PALETTE.wood });

  // Спицы веером, как у колеса
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * i) / 5;
    const spoke = new THREE.BoxGeometry(DOOR_FRAME_RADIUS * 1.9, 0.055, 0.05);
    spoke.rotateZ(angle);
    spoke.translate(0, DOOR_CENTER_HEIGHT, 0);
    parts.push({ geometry: spoke, color: PALETTE.woodDark });
  }

  return parts;
}

/** Плитняк перед дверью. */
function pathStones(random: () => number): THREE.BufferGeometry[] {
  const stones: THREE.BufferGeometry[] = [];
  for (let i = 0; i < PATH_STONES; i++) {
    const size = 0.5 + random() * 0.25;
    const stone = new THREE.BoxGeometry(size, 0.08, size * 0.7);
    stone.rotateY((random() - 0.5) * 0.6);
    stone.translate((random() - 0.5) * 0.5, 0.04, 0.75 + i * 0.72);
    stones.push(stone);
  }
  return stones;
}

/**
 * Проверка, которую раньше делал я глазами и трижды ошибся: помещается
 * ли дверь в срез. Генератор обязан ловить это сам.
 */
function checkFits(burrow: Burrow, face: BurrowFace): void {
  if (face.height < DOOR_TOP) {
    console.error(
      `[burrow] ${burrow.id}: арка высотой ${face.height.toFixed(2)} м, ` +
      `а наличник ${DOOR_TOP.toFixed(2)} м — поднимите height`,
    );
  }
  if (face.halfWidth < DOOR_FRAME_RADIUS + 0.45) {
    console.error(
      `[burrow] ${burrow.id}: срез шириной ${(face.halfWidth * 2).toFixed(2)} м — ` +
      'дверь не обрамить, увеличьте radius',
    );
  }
}
