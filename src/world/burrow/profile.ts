import {
  DOOR_CENTER_HEIGHT,
  DOOR_FRAME_RADIUS,
  DOOR_FRAME_TUBE,
  FACE_CLEARANCE,
  FACE_CUT_BLEND,
  type Burrow,
} from '../../config/burrows';

/**
 * Геометрия норы, посчитанная из параметров.
 *
 * Здесь только математика: и рельеф, и меши строятся из одних и тех же
 * функций, поэтому фасад не может разойтись с холмом. Раньше они жили
 * порознь — рельеф гнул купол, дверь стояла плоской плитой, и совпадение
 * достигалось подбором констант. Совпадения не получалось: сбоку дверь
 * тонула в склоне, а по краям оставались щели.
 *
 * Идея, которая всё чинит: холм срезан вертикальной плоскостью, и весь
 * срез закрыт одним куском геометрии с дырой под дверь. Тогда
 *
 *   — дверь не может быть перекрыта: она дыра в фасаде, а не предмет
 *     перед ним, и всё, что перед плоскостью среза, из рельефа убрано;
 *   — фасад не может не сойтись с холмом: его силуэт считается той же
 *     функцией купола, что и рельеф, только с шагом мельче;
 *   — по бокам нет обрыва: у края среза высота купола ровно ноль.
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
  /** Высота земли у порога. */
  base: number;
  /** Полуширина среза: там купол сходит на нет. */
  halfWidth: number;
  /** Высота купола посередине среза. */
  height: number;
}

/** Купол норы над окрестной землёй в точке. */
export function moundHeight(burrow: Burrow, x: number, z: number): number {
  const distance = Math.hypot(x - burrow.x, z - burrow.z);
  if (distance >= burrow.radius) return 0;
  return burrow.height * 0.5 * (1 + Math.cos((Math.PI * distance) / burrow.radius));
}

/** Высота купола на срезе, на боковом смещении s от двери. */
export function faceHeightAt(burrow: Burrow, distance: number, s: number): number {
  const r = Math.hypot(s, distance);
  if (r >= burrow.radius) return 0;
  return burrow.height * 0.5 * (1 + Math.cos((Math.PI * r) / burrow.radius));
}

/**
 * Насколько глубоко в холм уходит плоскость среза.
 *
 * Не константа и не доля радиуса: считается так, чтобы над дверью
 * осталось ровно FACE_CLEARANCE земли. При доле радиуса запас зависел
 * от размеров холма, и на маленьких норах дверь вылезала макушкой.
 */
export function faceDistance(burrow: Burrow): number {
  const wanted = DOOR_TOP + FACE_CLEARANCE;
  // Обращаем профиль купола: h = H/2 * (1 + cos(pi r / R))
  const ratio = (2 * wanted) / burrow.height - 1;
  if (ratio <= -1) return burrow.radius * 0.95;
  if (ratio >= 1) return 0;
  return (burrow.radius * Math.acos(ratio)) / Math.PI;
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
  const x = burrow.x + Math.sin(yaw) * distance;
  const z = burrow.z + Math.cos(yaw) * distance;

  return {
    yaw,
    x,
    z,
    distance,
    base: valleyFloorAt(x, z),
    halfWidth: Math.sqrt(Math.max(0, burrow.radius ** 2 - distance ** 2)),
    height: faceHeightAt(burrow, distance, 0),
  };
}

/**
 * Вклад норы в высоту земли.
 *
 * Позади плоскости среза — купол, перед ней его нет. Переход короткий,
 * но не мгновенный: на метровой сетке рельефа вертикальную стенку всё
 * равно не выразить, её рисует фасад, а рельефу довольно не торчать
 * из-под него.
 */
export function moundContribution(burrow: Burrow, face: BurrowFace, x: number, z: number): number {
  const mound = moundHeight(burrow, x, z);
  if (mound <= 0) return 0;

  // Насколько точка впереди плоскости среза
  const forward = (x - face.x) * Math.sin(face.yaw) + (z - face.z) * Math.cos(face.yaw);
  if (forward <= -FACE_CUT_BLEND) return mound;
  if (forward >= 0) return 0;

  const t = -forward / FACE_CUT_BLEND;
  return mound * t * t * (3 - 2 * t);
}

export interface SilhouettePoint {
  /** Боковое смещение от двери. */
  s: number;
  /** Низ фасада: земля под ним, в системе порога. */
  bottom: number;
  /** Верх фасада: та же земля плюс купол. */
  top: number;
}

/**
 * Силуэт среза. По нему строится контур фасада, и он же гарантирует,
 * что фасад накрывает рельеф.
 *
 * Низ идёт не по прямой, а по земле: долина волнистая, и на одиннадцати
 * метрах ширины плоское основание успевает и повиснуть в воздухе,
 * и уйти в грунт. Это поймала проверка — на глаз такое видно только
 * с определённой точки.
 */
export function faceSilhouette(
  burrow: Burrow,
  face: BurrowFace,
  steps: number,
  valleyFloorAt: (x: number, z: number) => number,
  sink: number,
): SilhouettePoint[] {
  const points: SilhouettePoint[] = [];
  const left = Math.cos(face.yaw);
  const leftZ = -Math.sin(face.yaw);

  for (let i = 0; i <= steps; i++) {
    const s = -face.halfWidth + (i / steps) * face.halfWidth * 2;
    const floor = valleyFloorAt(face.x + left * s, face.z + leftZ * s) - face.base;
    points.push({
      s,
      // Заглубляем низ: иначе на стыке с землёй остаётся щель
      bottom: floor - sink,
      top: floor + faceHeightAt(burrow, face.distance, s),
    });
  }
  return points;
}
