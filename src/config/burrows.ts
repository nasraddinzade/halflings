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
  /**
   * Bearing the door faces, degrees, 0 = +z.
   *
   * Data, not a formula. It used to be `Math.atan2(-x, -z)` — face the
   * middle of the valley — retyped in four separate files, and that one
   * line is what produced a ring: if every door looks at the centre, every
   * dwelling sits on a circle around it. A dwelling cut into a bank has
   * exactly one possible aspect, downhill, and which way that is depends
   * on the bank, not on the origin.
   */
  facing: number;
}

/** Which way this dwelling's door looks, in radians. */
export function doorFacing(burrow: Burrow): number {
  return (burrow.facing * Math.PI) / 180;
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
export const PAD_MARGIN = 1;
export const PAD_FADE = 4;
/**
 * A dwelling's pad is a FORECOURT, not a disc.
 *
 * It used to be omnidirectional: radius + 3.6 m held dead level, fading
 * over 2.6 — a disc some fourteen metres across, centred on the mound and
 * reaching out behind the hill it is cut into. On flat ground nobody
 * noticed. The moment the valley gets any relief that disc irons it flat,
 * and the dwelling stops being dug into anything.
 *
 * Now it is limited three ways: it reaches PAD_BACK behind the cut face
 * and no further, it is only as wide as the frontage plus PAD_SIDE, and
 * it fades over PAD_SIDE_FADE at the sides. Measured on the new landform,
 * that is the difference between 641 grid points steeper than MAX_SLOPE
 * and nine.
 */
export const PAD_BACK = 0.6;
export const PAD_SIDE = 1;
export const PAD_SIDE_FADE = 2;
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
  // Five foci, not a ring: four at the knot, three at the higher end, four
  // along the water, three above the mill, and one outlying farmstead — so
  // the village reads as the middle of a parish rather than as the whole
  // world. Frontages are perch multiples (5.0292 m x VERNACULAR_SCALE):
  // 2.5, 3, 4, 5, 6, 8, which is why no two plots are the same width.
  //
  // Every one of these is cut into a scarp. Measured across its own
  // footprint the ground rises 2.31 to 3.20 m against the 2.17 m the arch
  // needs, and the hill is 76 to 100 % of the mound's silhouette. On the
  // ring it was 0.30 m and 0.7 %.
  { id: 'burrow-1', x: -2.7, z: 25.03, radius: 3.71, height: 3.49, facing: 40.5 },
  { id: 'burrow-2', x: 3.44, z: 18.82, radius: 2.95, height: 2.77, facing: 40.7 },
  { id: 'burrow-3', x: 7.68, z: 12.25, radius: 3.14, height: 2.95, facing: 75.5 },
  { id: 'burrow-4', x: 10.33, z: 2.77, radius: 3.52, height: 3.31, facing: 79.7 },

  { id: 'burrow-5', x: -34.88, z: 51.22, radius: 3.52, height: 3.31, facing: 60 },
  { id: 'burrow-6', x: -28.63, z: 46.04, radius: 2.95, height: 2.77, facing: 65.5 },
  { id: 'burrow-7', x: -22.64, z: 39.06, radius: 3.14, height: 2.95, facing: 6.3 },

  { id: 'burrow-8', x: -6.97, z: -33.18, radius: 3.33, height: 3.13, facing: 33.8 },
  { id: 'burrow-9', x: 0.06, z: -36.67, radius: 2.95, height: 2.77, facing: 9.6 },
  { id: 'burrow-10', x: 8.26, z: -37.99, radius: 3.14, height: 2.95, facing: 6.3 },
  { id: 'burrow-11', x: 23.01, z: -39.78, radius: 3.52, height: 3.31, facing: 33.6 },

  { id: 'burrow-12', x: -39.46, z: 0.03, radius: 3.33, height: 3.13, facing: 87.6 },
  { id: 'burrow-13', x: -34.78, z: -6.55, radius: 2.95, height: 2.77, facing: 85.6 },
  { id: 'burrow-14', x: -30.3, z: -12.91, radius: 3.14, height: 2.95, facing: 66.4 },

  { id: 'burrow-15', x: 43.14, z: 36.73, radius: 3.52, height: 3.31, facing: 85.7 },
];

