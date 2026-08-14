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
  TERRAIN_SEED,
  VALLEY_RADIUS,
} from '../config/constants';

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

/** Высота земли в мировой точке (x, z). */
export function heightAt(x: number, z: number): number {
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
