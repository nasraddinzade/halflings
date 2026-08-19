// The project's single palette (decision #6). No asset brings colors of
// its own: everything entering the scene is painted from here through
// render/style.ts.
//
// Mood: a late summer day in a closed valley. Warm earth, muted greens,
// a cool sky for contrast.

export const PALETTE = {
  // --- atmosphere ---
  /** Clear colour. Only seen with SKY_ENABLED off; kept honest anyway. */
  sky: 0xb9d3da,
  /** Distance dissolves into the sky's lowest stop, and into nothing else. */
  fog: 0xb9d3da,
  /**
   * The sky dome's lowest stop, held perfectly flat from straight down to
   * the first stop angle. It is the fog colour on purpose, not a shade
   * near it: distant hills dissolve into the fog and then meet the sky
   * right above themselves, so any difference between the two draws a
   * line along the horizon exactly where nothing should be drawn.
   *
   * This is the most important line in the file. Change fog, change this.
   */
  skyHorizon: 0xb9d3da,
  /**
   * The ramp above it. Hue, saturation and lightness all move in one
   * direction across the four stops — H 193 -> 197 -> 206 -> 215,
   * S 31 -> 47 -> 61 -> 66, L 79 -> 74 -> 68 -> 62. A ramp that sags on
   * any of the three in the middle is what makes a sky read as one colour
   * getting dimmer rather than as air.
   */
  skyLow: 0x9fcbdc,
  skyMid: 0x7cb4df,
  skyZenith: 0x6095de,
  /** The sun's own disc, brighter than the light it casts. */
  sunDisc: 0xfff8e4,
  /** The air around the sun. Added to the sky, never mixed into it. */
  sunGlow: 0xffd9a3,
  /**
   * Chimney smoke, lit side and shaded side. Warm rather than grey: it
   * sits against a cool sky, and a neutral grey there reads as dirt on
   * the lens. Two tones only, like everything else in the frame.
   */
  smoke: 0xe6e0d4,
  smokeShade: 0xc0bcb4,
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

  /**
   * The three field uses. From the air an English parish is a patchwork,
   * and a patchwork needs three clearly separate values, not three shades
   * of one: grazed turf reads green, ripe corn reads gold, a hay meadow
   * sits between them. Hedged parcels all painted `grass` read as a net
   * thrown over a lawn, which is exactly how the first cut of the fields
   * looked from map height.
   *
   * They also have to clear the ground they sit in, not just each other.
   * The open valley is not one colour: it runs from `grass` to nearly
   * halfway to `grassDry` under the patch wave, so a pasture picked as a
   * near neighbour of `grass` lands inside that range and vanishes. These
   * three sit outside it — the pasture greener and darker than any rough
   * ground gets, the meadow paler than any of it does.
   */
  fieldPasture: 0x6f9a4a,
  fieldArable: 0xc4ab6b,
  fieldMeadow: 0xb4b76a,
  /** The furrow bottoms of ploughland, a shade off the crop above them. */
  fieldFurrow: 0xa98f52,
  /**
   * Standing corn, lit and shaded. Warmer and lighter than the ground it
   * grows out of: a crop painted the same gold as the field it stands in
   * is a carpet with a texture, not a crop.
   */
  corn: 0xdcc078,
  cornShade: 0xb08f4e,
  /**
   * Cut hay, paler and yellower than thatch. Thatch is what a roof does
   * after years of weather; a cock built last week is still the colour of
   * the grass it was, and in thatch it read as a traffic cone.
   */
  hay: 0xd9bd7d,
  /** Fleece. Warm, not grey — in grey a beast in a green field is a rock. */
  fleece: 0xe8e1cd,
  fleeceDark: 0x9a8b74,

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
