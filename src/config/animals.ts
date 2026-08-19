import { PALETTE, darken } from './palette';

/**
 * The animals that stand in the fields, and how the project's palette is
 * laid over an asset that came with colours of its own.
 *
 * The models are from Quaternius' "Ultimate Animated Animal Pack" (CC0
 * 1.0). They were chosen over anything built out of primitives because a
 * convincing quadruped is not a shape that can be assembled from a capsule
 * and four boxes — three attempts at that produced, in order, a periscope,
 * a hammer, and a boulder on sticks. They were chosen over other packs
 * because they are rigged, carry a grazing clip, and — the part that
 * matters most here — ship no textures at all: every surface is a named
 * flat material, which is exactly the shape decision #6 wants. Nothing of
 * the asset's own colour survives the load.
 *
 * `SLOTS` maps the pack's material names onto palette entries. A name the
 * pack uses and this table does not know is a load-time error rather than
 * a silent fall-through to some default: a new animal with an unmapped
 * material would otherwise arrive wearing whatever colour it was authored
 * in, which is the one thing the palette rule exists to prevent.
 */

/** A coat, and everything on the animal that is not the coat. */
export interface AnimalDress {
  /** Palette colour for the animal's main hide. */
  coat: number;
  /** The paler markings — belly, muzzle band, socks. */
  pale: number;
  /** Mane and tail hair, on the animals that have it as its own material. */
  mane: number;
}

export type AnimalKind = 'cow' | 'bull';

/**
 * The three coats a herd is drawn from. Deterministic per head, so the
 * same beast is the same colour every session.
 */
export const COATS: readonly AnimalDress[] = [
  { coat: PALETTE.hideRed, pale: PALETTE.hidePale, mane: PALETTE.mane },
  { coat: PALETTE.hideDun, pale: PALETTE.hidePale, mane: PALETTE.mane },
  { coat: PALETTE.hideDark, pale: PALETTE.hidePale, mane: PALETTE.mane },
];

/**
 * Pack material name to the part of the dress it wears.
 *
 * `Main_Light` is the pale marking and `Main_Dark` a shaded variant of the
 * coat; both exist so an animal reads as two-tone rather than as one
 * silhouette in one colour, which is what a three-step toon shader needs
 * to keep a shape legible at forty metres.
 */
export type DressSlot = 'coat' | 'coatDark' | 'pale' | 'hoof' | 'muzzle' | 'horn' | 'mane' | 'eyeDark' | 'eyeWhite';

export const SLOTS: Readonly<Record<string, DressSlot>> = {
  Main: 'coat',
  Main_Dark: 'coatDark',
  Main_Light: 'pale',
  Hooves: 'hoof',
  Muzzle: 'muzzle',
  Horns: 'horn',
  Hair: 'mane',
  Eye_Black: 'eyeDark',
  Eye_Dark: 'eyeDark',
  Eye_White: 'eyeWhite',
};

/** Resolves one material name to one colour, for one dressed animal. */
export function slotColor(slot: DressSlot, dress: AnimalDress): number {
  switch (slot) {
    case 'coat': return dress.coat;
    case 'coatDark': return darken(dress.coat, COAT_SHADE);
    case 'pale': return dress.pale;
    case 'hoof': return PALETTE.hoof;
    case 'muzzle': return PALETTE.muzzle;
    case 'horn': return PALETTE.horn;
    case 'mane': return dress.mane;
    case 'eyeDark': return PALETTE.eyeDark;
    case 'eyeWhite': return PALETTE.eyeWhite;
  }
}

/** How far the shaded flank of a coat sits below the coat itself. */
const COAT_SHADE = 0.72;

/**
 * The clips the pack ships that this game plays, and how often each is
 * chosen. tools/prepare-animals.mjs keeps exactly these five in the file;
 * the other eight are for a game with fighting in it.
 *
 * Grazing dominates because grazing is what a beast in a field is doing
 * nearly all the time — but not entirely, because a field where every head
 * is in the same pose is the still flock this replaces.
 *
 * Walk is prepared in the file and deliberately NOT played. The clip has
 * no root motion and nothing here moves the animal, so a walking beast
 * would tread a treadmill in the middle of a field — the most conspicuous
 * kind of wrong there is. It stays in the GLB because giving the herd
 * somewhere to walk to is a later job, not because it is unused by
 * accident.
 */
export const ANIMAL_CLIPS: ReadonlyArray<{ name: string; weight: number }> = [
  { name: 'Eating', weight: 0.46 },
  { name: 'Idle_Headlow', weight: 0.24 },
  { name: 'Idle', weight: 0.19 },
  { name: 'Idle_2', weight: 0.11 },
];

/** Picks a clip from the table above by a number in [0, 1). */
export function clipFor(draw: number): string {
  let seen = 0;
  for (const entry of ANIMAL_CLIPS) {
    seen += entry.weight;
    if (draw < seen) return entry.name;
  }
  return 'Eating';
}
