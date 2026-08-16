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
 * Burrows in a ring around the village square. The south is left to the
 * river, so there are none there. The doors face the center of the
 * valley — the angle is derived from the coordinates, no point
 * duplicating it in the data.
 */
/**
 * A mound is close to a hemisphere: the radius roughly equals the height.
 * Then the cut comes out almost a semicircle — an arch over the door
 * rather than a wall.
 */
export const BURROWS: readonly Burrow[] = [
  { id: 'burrow-1', x: -25, z: 4, radius: 3.4, height: 3.2 },
  { id: 'burrow-2', x: -19, z: 21, radius: 3.1, height: 3 },
  { id: 'burrow-3', x: -3, z: 27, radius: 3.7, height: 3.4 },
  { id: 'burrow-4', x: 15, z: 24, radius: 3.1, height: 3 },
  { id: 'burrow-5', x: 27, z: 10, radius: 3.4, height: 3.2 },
  { id: 'burrow-6', x: 24, z: -7, radius: 3, height: 2.9 },
];

/** Which way the door faces: always toward the center of the valley. */
export function doorFacing(burrow: Burrow): number {
  return Math.atan2(-burrow.x, -burrow.z);
}
