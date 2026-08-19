import { GREEN_OAK_SCALE, POND_BANK, POND_DEPTH, POND_RADIUS, POND_WATER_DEPTH,
  POND_WOBBLE, POUND_RADIUS, POUND_SEGMENTS } from './constants';

/**
 * The green's furniture, as data.
 *
 * A green is not a lawn. It is the village's one shared room, and what
 * makes it a room rather than a gap between houses is the kit standing on
 * it: the water everyone draws from, the water the stock drinks, the tree
 * that is older than any of them, and the pen where a beast that got out
 * waits for its owner to pay for it.
 *
 * Every position here was solved against the world as built — hedges,
 * hedgerow trees, lanes, work sites — rather than laid out on paper. The
 * blueprint in docs/VILLAGE.md placed all five by eye before any of those
 * existed, and four of the five landed inside something.
 */

/** The wellhead. Its total height is a halfling: the scale reference. */
export const WELL = { x: 17.25, z: 10.25 } as const;

/**
 * The standard oak. Not a prop — one more instance in the hedgerow-tree
 * mesh, so it costs no draw call at all. Its foot is on the footpath the
 * path was drawn to reach.
 */
export const OAK = { x: 26, z: 20.25, scale: GREEN_OAK_SCALE } as const;

/**
 * The pond, in the green's low corner.
 *
 * Radius 2.8 is not a taste: it is the largest circle that leaves a body
 * room to walk between the water and every hedge, tree and lane around
 * it. The shoreline is not that circle — POND_WOBBLE bends it — and the
 * waterline is not the shoreline either, because the water lies flat and
 * the ground does not. That third line is the one you see.
 */
export const POND = {
  x: 29.5,
  z: 0,
  radius: POND_RADIUS,
  wobble: POND_WOBBLE,
  depth: POND_DEPTH,
  waterDepth: POND_WATER_DEPTH,
  bank: POND_BANK,
} as const;

/** How far the shoreline reaches at its widest, in metres. */
export const POND_REACH = POND_RADIUS * (1 + POND_WOBBLE);

/**
 * The pound: the pen for straying stock, walled and gated.
 *
 * On the verge outside the green's south hedge, fronting the mill lane —
 * where a pound belongs, because a pound is a thing of the parish and the
 * road, not of the lawn. The ground there sits level to within 62 mm over
 * the whole footing ring, which is why it is there and not on the green.
 */
export const POUND = {
  x: 17,
  z: -10.25,
  radius: POUND_RADIUS,
  segments: POUND_SEGMENTS,
  /** Bearing of the gap, aimed at the lane the beast is driven along. */
  gate: (135 * Math.PI) / 180,
} as const;

/**
 * The shoreline, as a multiplier on the radius.
 *
 * Two harmonics, three-lobed and five-lobed, so the bank never repeats
 * around the circle and never doubles back on itself.
 */
export function pondEdge(angle: number): number {
  return POND_RADIUS * (1 + POND_WOBBLE * (
    0.62 * Math.sin(3 * angle + 0.9) + 0.38 * Math.sin(5 * angle + 2.4)
  ));
}
