// The project's single palette (decision #6). No asset brings colors of
// its own: everything entering the scene is painted from here through
// render/style.ts.
//
// Mood: a late summer day in a closed valley. Warm earth, muted greens,
// a cool sky for contrast.

export const PALETTE = {
  // --- atmosphere ---
  sky: 0x9dc0d4,
  /** Keep the fog close to the sky so distance dissolves, not muddies. */
  fog: 0xa8c6d6,
  /**
   * The sky dome's lowest band. It is the fog colour on purpose, not a
   * shade near it: distant hills dissolve into the fog and then meet the
   * sky right above themselves, so any difference between the two draws
   * a line along the horizon exactly where nothing should be drawn.
   */
  skyHorizon: 0xa8c6d6,
  /** Straight up. The band the gradient climbs to. */
  skyZenith: 0x5f95c1,
  /** The sun's own disc, brighter than the light it casts. */
  sunDisc: 0xfff8e4,
  sunlight: 0xfff1d4,
  /** Fill light from above: the sky. */
  skyBounce: 0xa8c4d6,
  /** Fill light from below: bounce off the grass. */
  groundBounce: 0x6b7a4e,

  // --- ground ---
  grass: 0x7d9e55,
  grassDry: 0x9aa85c,
  earth: 0x8a6a49,
  rock: 0x9098a0,

  // --- buildings ---
  wood: 0xa9794f,
  woodDark: 0x74502f,
  thatch: 0xc7a262,
  plaster: 0xe2d6bd,
  roofTile: 0xb35a43,
  door: 0x4f7f6b,

  // --- halflings ---
  skin: 0xe9bb92,
  hair: 0x7c4a2c,
  shirt: 0xc4653f,
  shirtCool: 0x51798c,
  trousers: 0x6d6a58,
  boots: 0x5c4230,

  // --- water and accents ---
  water: 0x5b93a8,
  bloom: 0xd9705f,
  /** The darkest tone: eyes, pupils, solid dark details. */
  ink: 0x241f1c,
  /** Dark metal: buckles, fittings. */
  steel: 0x5b636a,
} as const;

export type PaletteKey = keyof typeof PALETTE;

/**
 * The family says whether a zone may be recolored from one villager to
 * the next. Clothing — yes, and it should be; skin and hair — no, or what
 * you get is not variety but green faces.
 */
export type ColorFamily = 'skin' | 'hair' | 'cloth' | 'leather' | 'metal' | 'light' | 'dark';

export interface Tone {
  color: number;
  family: ColorFamily;
}

/**
 * The tones characters are painted with. Every cell of the pack atlas is
 * pulled to the nearest one — that way the pack artist's color is
 * replaced by the project's, while the split into zones is preserved.
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
  // Without a near-black the characters' eyes drifted to brown: the tone
  // nearest to #13191b turned out to be the boot color
  { color: PALETTE.ink, family: 'dark' },
];

/** Clothing variants: what makes one villager differ from a neighbor. */
export const CLOTH_VARIANTS: readonly number[] = [
  PALETTE.shirt,
  PALETTE.shirtCool,
  PALETTE.trousers,
  PALETTE.door,
  PALETTE.bloom,
  PALETTE.thatch,
];

/**
 * The project tone nearest to an arbitrary color.
 *
 * Distance is measured with "redmean" — a cheap correction to Euclidean
 * distance in RGB that is noticeably closer to human perception: without
 * it the algorithm thinks dark blue and dark green are neighbors.
 */
export function nearestTone(color: number): Tone {
  const r1 = (color >> 16) & 0xff;
  const g1 = (color >> 8) & 0xff;
  const b1 = color & 0xff;

  let best = CHARACTER_TONES[0];
  if (best === undefined) throw new Error('[palette] CHARACTER_TONES is empty');
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
 * Darkening a color for the outline. The outline is not black but a dark
 * version of the object itself (decision #5) — that way it reads as form
 * rather than a contour pasted on top.
 *
 * Multiply the channels instead of subtracting: subtraction drags
 * saturated colors into mud, multiplication keeps the hue.
 */
export function darken(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}
