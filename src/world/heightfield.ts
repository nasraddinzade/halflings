// Детерминированное поле высот долины: одна и та же точка всегда даёт
// одну и ту же высоту, без Math.random и без внешних зависимостей.
//
// Форма — чаша: спокойная середина под деревню, холмы вокруг, крутой борт
// по краю. Борт и есть граница мира (решение №4: границы диегетические).

import {
  CENTER_CALM_INNER,
  CENTER_CALM_OUTER,
  DETAIL_FREQUENCY,
  DETAIL_HEIGHT,
  HILL_FREQUENCY,
  HILL_HEIGHT,
  RIM_CURVE,
  RIM_HEIGHT,
  RIM_START,
  RIVER_AMPLITUDE,
  RIVER_DEPTH,
  RIVER_ENABLED,
  RIVER_FADE_END,
  RIVER_FADE_START,
  RIVER_OFFSET_Z,
  RIVER_WAVINESS,
  RIVER_WIDTH,
  TERRAIN_SEED,
  VALLEY_RADIUS,
} from '../config/constants';
import {
  BURROWS,
  PORCH_BACK_BLEND,
  PORCH_BLEND,
  PORCH_LENGTH,
  PORCH_WIDTH,
  doorFacing,
  doorPosition,
} from '../config/burrows';

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Плавная ступенька: 0 до edge0, 1 после edge1, сглаженный переход между. */
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Целочисленный хэш решётки -> [0, 1). Math.imul держит арифметику в 32 битах. */
function hash(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(TERRAIN_SEED, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise в диапазоне [-1, 1]: билинейная интерполяция хэшей решётки. */
function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const sx = smoothstep(0, 1, x - ix);
  const sz = smoothstep(0, 1, z - iz);
  const top = lerp(hash(ix, iz), hash(ix + 1, iz), sx);
  const bottom = lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), sx);
  return lerp(top, bottom, sz) * 2 - 1;
}

/** Сумма октав: крупная форма плюс всё более мелкие детали. */
function fbm(x: number, z: number, octaves: number): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * frequency, z * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

/** Ось русла: где проходит середина реки на данной долготе. */
export function riverCenterZ(x: number): number {
  return RIVER_OFFSET_Z + RIVER_AMPLITUDE * Math.sin(x * RIVER_WAVINESS);
}

/**
 * Насколько глубоко врезано русло в точке. Ноль — река сюда не доходит.
 *
 * К борту долины врез сходит на нет: если прорезать борт насквозь,
 * в замкнутом кольце появится проход, и игрок уйдёт из долины по руслу.
 * Кольцо проверялось численно (docs/ASSETS.md не про это, но тест на
 * замкнутость гоняется по 3600 направлениям) — ломать его нельзя.
 */
export function riverCarve(x: number, z: number): number {
  if (!RIVER_ENABLED) return 0;

  const across = Math.abs(z - riverCenterZ(x));
  // Плавные берега: у кромки склон, к середине ровное дно
  const profile = 1 - smoothstep(RIVER_WIDTH * 0.55, RIVER_WIDTH * 1.5, across);
  if (profile <= 0) return 0;

  const distance = Math.hypot(x, z) / VALLEY_RADIUS;
  const taper = 1 - smoothstep(RIVER_FADE_START, RIVER_FADE_END, distance);

  return RIVER_DEPTH * profile * taper;
}

/**
 * Холмы под норы: гладкие купола по данным из config/burrows.ts.
 * Косинусный профиль, а не линейный — у линейного на кромке излом,
 * и по нему через весь холм идёт заметное ребро.
 */
function burrowMounds(x: number, z: number): number {
  let total = 0;
  for (const burrow of BURROWS) {
    const distance = Math.hypot(x - burrow.x, z - burrow.z) / burrow.radius;
    if (distance >= 1) continue;
    total += burrow.height * 0.5 * (1 + Math.cos(Math.PI * distance));
  }
  return total;
}

/**
 * Ровная площадка перед дверью. Без неё дверь стоит на склоне: снизу
 * порог висит в воздухе, сверху утоплен в землю, и жителю негде встать.
 *
 * Возвращает 0..1 — насколько сильно тянуть высоту к уровню порога.
 */
function porchBlend(x: number, z: number): { weight: number; level: number } {
  let weight = 0;
  let level = 0;

  for (const burrow of BURROWS) {
    const door = doorPosition(burrow);
    const yaw = doorFacing(burrow);
    // В систему двери: forward — куда она смотрит, side — поперёк
    const dx = x - door.x;
    const dz = z - door.z;
    const forward = dx * Math.sin(yaw) + dz * Math.cos(yaw);
    const side = dx * Math.cos(yaw) - dz * Math.sin(yaw);

    // Площадка лежит перед дверью и чуть заходит за её плоскость,
    // чтобы порог не оказался на переломе
    const alongEdge = 1 - smoothstep(PORCH_LENGTH, PORCH_LENGTH + PORCH_BLEND, forward);
    // Назад срез обрывается коротко: за дверью должна встать стенка
    const behindEdge = smoothstep(-0.25 - PORCH_BACK_BLEND, -0.25, forward);
    const acrossEdge = 1 - smoothstep(PORCH_WIDTH, PORCH_WIDTH + PORCH_BLEND, Math.abs(side));
    const local = alongEdge * behindEdge * acrossEdge;
    if (local <= weight) continue;

    weight = local;
    // Уровень порога — земля под дверью без холма и без соседних площадок
    level = valleyFloor(door.x, door.z);
  }

  return { weight, level };
}

/** Рельеф долины без нор и без русла. */
function valleyFloor(x: number, z: number): number {
  // 0 в центре долины, 1 на краю
  const distance = Math.hypot(x, z) / VALLEY_RADIUS;

  // Борт: степень >1 делает верх круче подножия, и полоса выше
  // MAX_SLOPE получается достаточно широкой, чтобы надёжно останавливать
  const rim = smoothstep(RIM_START, 1.05, distance) ** RIM_CURVE * RIM_HEIGHT;

  // Ближе к центру холмы приглушены — там ровное место под деревню
  const calm = 1 - smoothstep(CENTER_CALM_INNER, CENTER_CALM_OUTER, distance);
  const hills = fbm(x * HILL_FREQUENCY, z * HILL_FREQUENCY, 4) * HILL_HEIGHT * (1 - calm * 0.8);

  const detail = fbm(x * DETAIL_FREQUENCY, z * DETAIL_FREQUENCY, 3) * DETAIL_HEIGHT;

  return rim + hills + detail;
}

/** Высота земли без русла — по ней стоит вода. */
export function groundHeight(x: number, z: number): number {
  const base = valleyFloor(x, z) + burrowMounds(x, z);
  const porch = porchBlend(x, z);
  // Площадка перетягивает высоту к уровню порога — и срезает край
  // холма, образуя ту самую стенку, в которую врезана дверь
  return lerp(base, porch.level, porch.weight);
}

/** Высота земли в мировой точке (x, z), с прорезанным руслом. */
export function heightAt(x: number, z: number): number {
  return groundHeight(x, z) - riverCarve(x, z);
}
