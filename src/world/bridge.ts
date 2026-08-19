import {
  BRIDGE_DECK_WIDTH,
  BRIDGE_HUMP,
  BRIDGE_LANDING,
  BRIDGE_X,
  BRIDGE_Z_NORTH,
  BRIDGE_Z_SOUTH,
} from '../config/constants';
import { heightAt } from './heightfield';

/**
 * The footbridge's deck, as a function.
 *
 * It exists because the bridge was not a floor. The deck was drawn as
 * batched props and the player's ground query raycasts the terrain BVH
 * alone, so at the bridge line he walked down the bank and waded the
 * channel with his own planks a metre and a half over his head. The one
 * dry crossing in the valley was a decoration.
 *
 * A function rather than a term inside `heightAt`, and that distinction is
 * the whole design. `heightAt` is what displaces the terrain mesh, and the
 * mesh samples every 0.667 m: a 1.1 m deck is 1.6 cells wide, so folding
 * it in would alias into a wandering earth causeway — drawn as ground,
 * painted as ground, planted as ground, with the river's own ribbon
 * passing straight through it. The deck is not ground. It is a surface
 * over the ground, and only the things that walk need to know.
 *
 * `Crossing` lays its planks from this same function, so the deck that is
 * drawn and the deck that is walked cannot drift apart.
 */

/** Where the deck would be, level, before the hump and the landings. */
export function deckLevel(): number {
  return Math.max(heightAt(BRIDGE_X, BRIDGE_Z_NORTH), heightAt(BRIDGE_X, BRIDGE_Z_SOUTH)) + 0.12;
}

/** The hump. A flat plank over nine metres sags in the eye. */
export function deckRise(t: number): number {
  return BRIDGE_HUMP * Math.sin(t * Math.PI);
}

/**
 * The top of the planks at a point, or null off the deck.
 *
 * The last stretch at each end ramps down to the bank it lands on. Without
 * it the north end is a 0.41 m wall against a STEP_HEIGHT of 0.15 — a
 * bridge the player cannot get onto is no better than one he falls
 * through.
 */
export function deckHeightAt(x: number, z: number): number | null {
  if (Math.abs(x - BRIDGE_X) > BRIDGE_DECK_WIDTH / 2) return null;
  const span = BRIDGE_Z_NORTH - BRIDGE_Z_SOUTH;
  const t = (z - BRIDGE_Z_SOUTH) / span;
  if (t < 0 || t > 1) return null;

  const deck = deckLevel() + deckRise(t) + DECK_SKIN;
  // Blend to the bank over the landing, at both ends
  const edge = t < 0.5 ? t : 1 - t;
  if (edge >= BRIDGE_LANDING) return deck;
  const bank = heightAt(x, t < 0.5 ? BRIDGE_Z_SOUTH : BRIDGE_Z_NORTH) + DECK_SKIN;
  const k = edge / BRIDGE_LANDING;
  return bank + (deck - bank) * (k * k * (3 - 2 * k));
}

/** The planks stand this far proud of the beams they are laid on. */
export const DECK_SKIN = 0.03;
