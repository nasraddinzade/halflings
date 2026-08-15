// Норы полуросликов — данные, как и точки работы.
// Каждая нора: холм в рельефе плюс круглая дверь в его склоне.

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
 * Дверь стоит не в центре холма, а на этой доле радиуса от него —
 * там склон уже поднялся выше двери, но ещё не спрятал её целиком.
 */
export const DOOR_OFFSET_RATIO = 0.42;

/** Ровная площадка перед дверью: жителю надо где-то стоять. */
export const PORCH_LENGTH = 3.2;
export const PORCH_WIDTH = 2.4;
export const PORCH_BLEND = 1.5;

/**
 * Норы кольцом вокруг деревенской площади. Юг оставлен реке, поэтому
 * их там нет. Двери смотрят к центру долины — угол выводится из
 * координат, дублировать его в данных незачем.
 */
export const BURROWS: readonly Burrow[] = [
  { id: 'burrow-1', x: -25, z: 4, radius: 7, height: 2.8 },
  { id: 'burrow-2', x: -19, z: 21, radius: 6.5, height: 2.6 },
  { id: 'burrow-3', x: -3, z: 27, radius: 7.5, height: 3 },
  { id: 'burrow-4', x: 15, z: 24, radius: 6.5, height: 2.6 },
  { id: 'burrow-5', x: 27, z: 10, radius: 7, height: 2.8 },
  { id: 'burrow-6', x: 24, z: -7, radius: 6, height: 2.4 },
];

/** Куда смотрит дверь: всегда к центру долины. */
export function doorFacing(burrow: Burrow): number {
  return Math.atan2(-burrow.x, -burrow.z);
}

/**
 * Где стоит дверь: на обращённой к центру стороне холма, на
 * DOOR_OFFSET_RATIO радиуса от его середины.
 */
export function doorPosition(burrow: Burrow): { x: number; z: number } {
  const yaw = doorFacing(burrow);
  const distance = burrow.radius * DOOR_OFFSET_RATIO;
  return {
    x: burrow.x + Math.sin(yaw) * distance,
    z: burrow.z + Math.cos(yaw) * distance,
  };
}
