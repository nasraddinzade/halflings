import {
  DOOR_CENTER_HEIGHT,
  DOOR_FRAME_RADIUS,
  DOOR_FRAME_TUBE,
  FACE_CLEARANCE,
  FACE_CUT_BLEND,
  PAD_FADE,
  PAD_MARGIN,
  type Burrow,
} from '../../config/burrows';

/**
 * Геометрия норы, посчитанная из параметров.
 *
 * Здесь только математика: и рельеф, и меши строятся из одних и тех же
 * функций, поэтому фасад не может разойтись с холмом.
 *
 * Устройство: холм срезан вертикальной плоскостью, срез закрыт куском
 * геометрии с дырой под дверь. Отсюда две гарантии — дверь не может быть
 * перекрыта землёй (она дыра в фасаде, а не предмет перед ним), и фасад
 * не может не сойтись с холмом (силуэт считается той же функцией).
 *
 * Профиль купола — половина эллипсоида, а не косинус. Косинусный купол
 * подходит к земле полого: чтобы вместить дверь, его приходится делать
 * широким, и срез такого блина даёт стену в одиннадцать метров, которая
 * сбоку читается фанерным щитом. У эллипсоида бока крутые, радиус можно
 * взять почти равным высоте, и срез выходит аркой чуть шире двери —
 * как у настоящих нор.
 */

/** Верх наличника над порогом. */
export const DOOR_TOP = DOOR_CENTER_HEIGHT + DOOR_FRAME_RADIUS + DOOR_FRAME_TUBE;

export interface BurrowFace {
  /** Куда смотрит фасад, радианы. */
  yaw: number;
  /** Центр среза в мировых координатах. */
  x: number;
  z: number;
  /** Насколько плоскость среза отстоит от середины холма. */
  distance: number;
  /** Уровень площадки, на которой стоит нора. */
  base: number;
  /** Полуширина среза. */
  halfWidth: number;
  /** Высота арки посередине среза. */
  height: number;
}

/** Купол норы над площадкой: половина эллипсоида. */
export function moundHeight(burrow: Burrow, x: number, z: number): number {
  const distance = Math.hypot(x - burrow.x, z - burrow.z);
  if (distance >= burrow.radius) return 0;
  return burrow.height * Math.sqrt(1 - (distance / burrow.radius) ** 2);
}

/** Высота арки на срезе, на боковом смещении s от двери. */
export function faceHeightAt(burrow: Burrow, distance: number, s: number): number {
  const r = Math.hypot(s, distance);
  if (r >= burrow.radius) return 0;
  return burrow.height * Math.sqrt(1 - (r / burrow.radius) ** 2);
}

/**
 * Насколько глубоко в холм уходит плоскость среза.
 *
 * Считается так, чтобы над наличником осталось ровно FACE_CLEARANCE
 * земли, а не задаётся долей радиуса: при доле запас плавал бы вместе
 * с размером холма.
 */
export function faceDistance(burrow: Burrow): number {
  const wanted = DOOR_TOP + FACE_CLEARANCE;
  if (wanted >= burrow.height) return 0;
  return burrow.radius * Math.sqrt(1 - (wanted / burrow.height) ** 2);
}

/**
 * Точка фасада на плоскости. Отдельно от faceOf, потому что нужна там,
 * где рельефа ещё нет: растительность и раскраска земли обходят двери,
 * а высота им для этого не требуется.
 */
export function facePoint(burrow: Burrow): { x: number; z: number } {
  const yaw = Math.atan2(-burrow.x, -burrow.z);
  const distance = faceDistance(burrow);
  return {
    x: burrow.x + Math.sin(yaw) * distance,
    z: burrow.z + Math.cos(yaw) * distance,
  };
}

/** Всё, что нужно и рельефу, и построителю мешей. */
export function faceOf(burrow: Burrow, valleyFloorAt: (x: number, z: number) => number): BurrowFace {
  const yaw = Math.atan2(-burrow.x, -burrow.z);
  const distance = faceDistance(burrow);

  return {
    yaw,
    x: burrow.x + Math.sin(yaw) * distance,
    z: burrow.z + Math.cos(yaw) * distance,
    distance,
    // Уровень площадки берём в середине холма: на него равняется
    // и рельеф, и низ фасада, поэтому он должен быть один
    base: valleyFloorAt(burrow.x, burrow.z),
    halfWidth: Math.sqrt(Math.max(0, burrow.radius ** 2 - distance ** 2)),
    height: faceHeightAt(burrow, distance, 0),
  };
}

/**
 * Насколько рельеф под норой подтянут к уровню площадки.
 * Без выравнивания волны долины лезут перед фасадом и топят низ двери.
 */
export function padWeight(burrow: Burrow, x: number, z: number): number {
  const distance = Math.hypot(x - burrow.x, z - burrow.z);
  const inner = burrow.radius + PAD_MARGIN;
  if (distance <= inner) return 1;
  if (distance >= inner + PAD_FADE) return 0;
  const t = (distance - inner) / PAD_FADE;
  return 1 - t * t * (3 - 2 * t);
}

/** Купол позади плоскости среза; перед ней его нет. */
export function moundContribution(burrow: Burrow, face: BurrowFace, x: number, z: number): number {
  const mound = moundHeight(burrow, x, z);
  if (mound <= 0) return 0;

  const forward = (x - face.x) * Math.sin(face.yaw) + (z - face.z) * Math.cos(face.yaw);
  if (forward <= -FACE_CUT_BLEND) return mound;
  if (forward >= 0) return 0;

  const t = -forward / FACE_CUT_BLEND;
  return mound * t * t * (3 - 2 * t);
}

export interface SilhouettePoint {
  s: number;
  bottom: number;
  top: number;
}

/**
 * Силуэт среза: по нему строится контур фасада, и он же гарантирует,
 * что фасад накрывает рельеф. Низ ровный, потому что земля под норой
 * выровнена площадкой.
 */
export function faceSilhouette(
  burrow: Burrow,
  face: BurrowFace,
  steps: number,
  sink: number,
): SilhouettePoint[] {
  const points: SilhouettePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = -face.halfWidth + (i / steps) * face.halfWidth * 2;
    points.push({ s, bottom: -sink, top: faceHeightAt(burrow, face.distance, s) });
  }
  return points;
}
