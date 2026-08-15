// Единая палитра проекта (решение №6). Ни один ассет не приносит свои
// цвета: всё, что попадает в сцену, красится отсюда через render/style.ts.
//
// Настроение: поздний летний день в закрытой долине. Тёплая земля,
// приглушённая зелень, холодное небо для контраста.

export const PALETTE = {
  // --- атмосфера ---
  sky: 0x9dc0d4,
  /** Туман держим близко к небу, чтобы даль растворялась, а не мутнела. */
  fog: 0xa8c6d6,
  sunlight: 0xfff1d4,
  /** Подсветка сверху: небо. */
  skyBounce: 0xa8c4d6,
  /** Подсветка снизу: отражение от травы. */
  groundBounce: 0x6b7a4e,

  // --- земля ---
  grass: 0x7d9e55,
  grassDry: 0x9aa85c,
  earth: 0x8a6a49,
  rock: 0x9098a0,

  // --- постройки ---
  wood: 0xa9794f,
  woodDark: 0x74502f,
  thatch: 0xc7a262,
  plaster: 0xe2d6bd,
  roofTile: 0xb35a43,
  door: 0x4f7f6b,

  // --- полурослики ---
  skin: 0xe9bb92,
  hair: 0x7c4a2c,
  shirt: 0xc4653f,
  shirtCool: 0x51798c,
  trousers: 0x6d6a58,
  boots: 0x5c4230,

  // --- вода и акценты ---
  water: 0x5b93a8,
  bloom: 0xd9705f,
} as const;

export type PaletteKey = keyof typeof PALETTE;

/**
 * Затемнение цвета для обводки. Обводка не чёрная, а тёмная версия
 * самого объекта (решение №5) — так она читается как форма, а не как
 * наклеенный сверху контур.
 *
 * Умножаем каналы, а не вычитаем: вычитание уводит насыщенные цвета
 * в грязь, умножение сохраняет тон.
 */
export function darken(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
