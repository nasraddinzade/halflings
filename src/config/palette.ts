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
  /** Самый тёмный тон: глаза, зрачки, глухие детали. */
  ink: 0x241f1c,
  /** Тёмный металл: пряжки, оковка. */
  steel: 0x5b636a,
} as const;

export type PaletteKey = keyof typeof PALETTE;

/**
 * Семейство говорит, можно ли перекрашивать зону от жителя к жителю.
 * Одежда — можно и нужно, кожа и волосы — нет: иначе получится не
 * разнообразие, а зелёные лица.
 */
export type ColorFamily = 'skin' | 'hair' | 'cloth' | 'leather' | 'metal' | 'light' | 'dark';

export interface Tone {
  color: number;
  family: ColorFamily;
}

/**
 * Тона, которыми красятся персонажи. Каждая ячейка пакового атласа
 * подтягивается к ближайшему из них — так цвет художника пака заменяется
 * цветом проекта, но разбиение на зоны сохраняется.
 */
export const CHARACTER_TONES: readonly Tone[] = [
  { color: PALETTE.skin, family: 'skin' },
  { color: PALETTE.hair, family: 'hair' },
  { color: PALETTE.shirt, family: 'cloth' },
  { color: PALETTE.shirtCool, family: 'cloth' },
  { color: PALETTE.trousers, family: 'cloth' },
  { color: PALETTE.door, family: 'cloth' },
  { color: PALETTE.bloom, family: 'cloth' },
  { color: PALETTE.thatch, family: 'cloth' },
  { color: PALETTE.boots, family: 'leather' },
  { color: PALETTE.wood, family: 'leather' },
  { color: PALETTE.woodDark, family: 'leather' },
  { color: PALETTE.rock, family: 'metal' },
  { color: PALETTE.steel, family: 'metal' },
  { color: PALETTE.plaster, family: 'light' },
  // Без почти чёрного глаза персонажей уезжали в коричневый: ближайшим
  // к #13191b оказывался цвет сапог
  { color: PALETTE.ink, family: 'dark' },
];

/** Варианты одежды: чем житель отличается от соседа. */
export const CLOTH_VARIANTS: readonly number[] = [
  PALETTE.shirt,
  PALETTE.shirtCool,
  PALETTE.trousers,
  PALETTE.door,
  PALETTE.bloom,
  PALETTE.thatch,
];

/**
 * Ближайший тон проекта к произвольному цвету.
 *
 * Расстояние считаем по «redmean» — дешёвой поправке к евклидову
 * расстоянию в RGB, которая заметно ближе к человеческому восприятию:
 * без неё тёмно-синий и тёмно-зелёный кажутся алгоритму соседями.
 */
export function nearestTone(color: number): Tone {
  const r1 = (color >> 16) & 0xff;
  const g1 = (color >> 8) & 0xff;
  const b1 = color & 0xff;

  let best = CHARACTER_TONES[0];
  if (best === undefined) throw new Error('[palette] CHARACTER_TONES пуст');
  let bestDistance = Infinity;

  for (const tone of CHARACTER_TONES) {
    const r2 = (tone.color >> 16) & 0xff;
    const g2 = (tone.color >> 8) & 0xff;
    const b2 = tone.color & 0xff;
    const rMean = (r1 + r2) / 2;
    const dr = r1 - r2;
    const dg = g1 - g2;
    const db = b1 - b2;
    const distance =
      (2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = tone;
    }
  }
  return best;
}

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
