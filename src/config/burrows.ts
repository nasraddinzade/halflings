// Норы полуросликов — данные, как и точки работы.
// Нора описывается четырьмя числами; всё остальное считает генератор
// в world/burrow/. Добавить нору — добавить строку.

export interface Burrow {
  id: string;
  /** Центр холма. */
  x: number;
  z: number;
  /** Радиус и высота холма в метрах. */
  radius: number;
  height: number;
}

/** Дверь ~1.3 м при росте полурослика 1.1 м (CLAUDE.md, ключевые константы). */
export const DOOR_RADIUS = 0.55;
export const DOOR_FRAME_RADIUS = 0.6;
export const DOOR_FRAME_TUBE = 0.07;
/** Центр двери над землёй: створка получается от 0.03 до 1.37 м. */
export const DOOR_CENTER_HEIGHT = 0.7;

/**
 * Сколько земли остаётся над наличником. Глубина, на которую фасад
 * уходит в холм, считается из этого числа, а не задаётся долей радиуса:
 * при доле запас плавал вместе с размером холма, и на маленьких норах
 * дверь вылезала макушкой наружу.
 */
export const FACE_CLEARANCE = 0.55;
/** Длина перехода от купола к срезу. На метровой сетке это один квад. */
export const FACE_CUT_BLEND = 0.9;
/** Радиус земляной каймы вокруг проёма; дальше фасад зарастает травой. */
export const FACE_EARTH_RADIUS = 1.3;
/** Насколько фасад вынесен перед плоскостью среза, чтобы не мерцать. */
export const FACE_OFFSET = 0.03;
/** Сколько точек берётся на силуэт среза. */
export const FACE_SILHOUETTE_STEPS = 48;
/** На сколько низ фасада уходит в грунт, чтобы на стыке не было щели. */
export const FACE_SINK = 0.25;

/**
 * Норы кольцом вокруг деревенской площади. Юг оставлен реке, поэтому
 * их там нет. Двери смотрят к центру долины — угол выводится из
 * координат, дублировать его в данных незачем.
 */
export const BURROWS: readonly Burrow[] = [
  { id: 'burrow-1', x: -25, z: 4, radius: 6.5, height: 3.1 },
  { id: 'burrow-2', x: -19, z: 21, radius: 6, height: 2.9 },
  { id: 'burrow-3', x: -3, z: 27, radius: 7, height: 3.4 },
  { id: 'burrow-4', x: 15, z: 24, radius: 6, height: 2.9 },
  { id: 'burrow-5', x: 27, z: 10, radius: 6.5, height: 3.1 },
  { id: 'burrow-6', x: 24, z: -7, radius: 5.5, height: 2.7 },
];

/** Куда смотрит дверь: всегда к центру долины. */
export function doorFacing(burrow: Burrow): number {
  return Math.atan2(-burrow.x, -burrow.z);
}
