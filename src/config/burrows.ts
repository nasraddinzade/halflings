// Halfling burrows are data, just like the work points.
// A burrow is described by four numbers; everything else is computed by
// the generator in world/burrow/. Adding a burrow means adding a row.

export interface Burrow {
  id: string;
  /** Center of the mound. */
  x: number;
  z: number;
  /** Radius and height of the mound, in meters. */
  radius: number;
  height: number;
}

/**
 * Round door. The 1.34 m diameter lands in the 1.2–1.5 m range of the
 * reference burrow doors and is proportionate to a 1.1 m halfling. The
 * sill is raised by 0.2 m: a real round door is stepped over, not walked
 * through flush with the ground.
 */
export const DOOR_RADIUS = 0.55;
export const DOOR_FRAME_RADIUS = 0.6;
export const DOOR_FRAME_TUBE = 0.11;
export const DOOR_SILL = 0.2;
export const DOOR_CENTER_HEIGHT = DOOR_SILL + DOOR_FRAME_RADIUS + DOOR_FRAME_TUBE;

/**
 * How much earth is left above the door frame. The depth the facade sinks
 * into the mound is derived from this number instead of being set as a
 * fraction of the radius: with a fraction the clearance drifted along
 * with the mound size, and on small burrows the top of the door poked out.
 */
export const FACE_CLEARANCE = 0.55;
/**
 * The facade is a flat cut through the mound, and that is right: real
 * burrows have a stone wall in front of the door. It looked like a shield
 * not because it was flat but because of the mound's proportions. A
 * pancake 6.5 m in radius and 2.9 m tall cuts into an eleven-meter wall;
 * a hemisphere gives an arch just slightly wider than the door.
 */
export const FACE_CUT_BLEND = 0.8;
/** How far the geometry is pushed forward so it doesn't z-fight terrain. */
export const FACE_OFFSET = 0.04;
/**
 * The patch of the dome pressed in for the door. Inside INNER the surface
 * lies exactly in the door plane; by OUTER it eases back to the dome.
 * That is the entire "facade": a circle a little over a meter across, not
 * a separate panel.
 */
export const DIMPLE_INNER = 1.05;
export const DIMPLE_OUTER = 1.85;
/** Dome tessellation: rings along the height, segments around it. */
export const MOUND_RINGS = 16;
export const MOUND_SEGMENTS = 40;
/** Flagstones of the path in front of the door. */
export const PATH_STONES = 4;
/**
 * The ground under a burrow is levelled into a pad, and the dome stands
 * on that. Without it the valley's natural terrain rides up in front of
 * the facade and drowns the bottom of the door. The margin is in meters,
 * not in fractions of the radius: with fractions the pad on small mounds
 * ran out right in front of the threshold.
 */
export const PAD_MARGIN = 3.6;
export const PAD_FADE = 2.6;
/**
 * Softens the closeness weighting where pads overlap. Small enough that a
 * mound owns the ground under itself, large enough that the term does not
 * blow up at a mound's own centre.
 */
export const PAD_BIAS = 0.8;

/**
 * Fifteen dwellings in a closed ring around the green, four of them on
 * the far bank. The doors face the centre of the valley — the angle is
 * derived from the coordinates, so there is no point duplicating it here.
 *
 * The ring used to be six on a horseshoe with the whole south side open.
 * Fifteen at that radius overlapped, and spread over the same horseshoe
 * they overlapped worse, so the ring closes and crosses the water. That
 * is what the surveyed English village does: the street carries on over
 * the ford and a few households live on the other side.
 *
 * The positions come from a solver rather than from taste, and every one
 * of them is measured. A dwelling steps back along its own radial until
 * its whole mound plus a metre of threshold is on dry land — which is
 * what put four of them across the river. Then the whole ring relaxes
 * until nothing overlaps anything: no mound within 3.2 m of another, none
 * within 1.8 m of the mill, its yard, the pond, the pound, the well or
 * the green's oak, and none within a metre of a lane. A seat too near a
 * lane slides ALONG the ring rather than outward, because a lane leaves a
 * village between two tofts and sliding is what opens that gap.
 *
 * Result: spacing 9.9 to 16.1 m, mean 11.7, so the frontage is 57%
 * occupied — the surveyed band for a real village is 50 to 67%, and the
 * old six-dwelling ring managed 24%. Worst ground slope under a mound is
 * 8.8 degrees. See docs/VILLAGE.md.
 */
/**
 * A mound is close to a hemisphere: the radius roughly equals the height.
 * Then the cut comes out almost a semicircle — an arch over the door
 * rather than a wall.
 */
export const BURROWS: readonly Burrow[] = [
  { id: 'burrow-1', x: 10.6, z: 24.8, radius: 3.33, height: 3.13 },
  { id: 'burrow-2', x: 19.1, z: 19.1, radius: 3.71, height: 3.49 },
  { id: 'burrow-3', x: 24.9, z: 10.3, radius: 3.14, height: 2.95 },
  { id: 'burrow-4', x: 27, z: 0, radius: 3.52, height: 3.31 },
  { id: 'burrow-5', x: 24, z: -9.9, radius: 2.95, height: 2.77 },
  // Across the water. The ford and the footbridge exist for these four
  { id: 'burrow-6', x: 25.5, z: -25.5, radius: 3.33, height: 3.13 },
  { id: 'burrow-7', x: 11.9, z: -28.6, radius: 3.71, height: 3.49 },
  { id: 'burrow-8', x: 1.5, z: -30, radius: 3.14, height: 2.95 },
  { id: 'burrow-9', x: -13.8, z: -33.3, radius: 3.52, height: 3.31 },
  // Back on the north bank, round to the head of the green
  { id: 'burrow-10', x: -16.6, z: -17.4, radius: 2.95, height: 2.77 },
  { id: 'burrow-11', x: -22.7, z: -7.7, radius: 3.33, height: 3.13 },
  { id: 'burrow-12', x: -27, z: 1.6, radius: 3.71, height: 3.49 },
  { id: 'burrow-13', x: -24.5, z: 11.3, radius: 3.14, height: 2.95 },
  { id: 'burrow-14', x: -18.8, z: 19.4, radius: 3.52, height: 3.31 },
  { id: 'burrow-15', x: -10.5, z: 24.9, radius: 2.95, height: 2.77 },
];

/** Which way the door faces: always toward the center of the valley. */
export function doorFacing(burrow: Burrow): number {
  return Math.atan2(-burrow.x, -burrow.z);
}
