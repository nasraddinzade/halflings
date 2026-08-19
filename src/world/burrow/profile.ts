import {
  DOOR_CENTER_HEIGHT,
  DOOR_FRAME_RADIUS,
  DOOR_FRAME_TUBE,
  FACE_CLEARANCE,
  FACE_CUT_BLEND,
  PAD_FADE,
  PAD_BACK,
  PAD_MARGIN,
  PAD_SIDE,
  PAD_SIDE_FADE,
  doorFacing,
  type Burrow,
} from '../../config/burrows';

/**
 * Burrow geometry, computed from the parameters.
 *
 * Math only: the terrain and the meshes are both built from the same
 * functions, so the facade cannot drift apart from the mound.
 *
 * How it works: the mound is cut by a vertical plane, and the cut is
 * closed by a piece of geometry with a hole for the door. That gives two
 * guarantees — the door cannot be buried under earth (it is a hole in
 * the facade, not an object in front of it), and the facade cannot fail
 * to meet the mound (the silhouette comes from the same function).
 *
 * The dome profile is half an ellipsoid, not a cosine. A cosine dome
 * meets the ground at a shallow angle: to fit the door in you have to
 * make it wide, and cutting such a pancake gives an eleven-meter wall
 * that reads as a plywood board from the side. An ellipsoid has steep
 * flanks, the radius can be taken nearly equal to the height, and the
 * cut comes out as an arch a bit wider than the door — like real burrows.
 */

/** Top of the door casing above the threshold. */
export const DOOR_TOP = DOOR_CENTER_HEIGHT + DOOR_FRAME_RADIUS + DOOR_FRAME_TUBE;

export interface BurrowFace {
  /** Which way the facade faces, radians. */
  yaw: number;
  /** Center of the cut in world coordinates. */
  x: number;
  z: number;
  /** How far the cut plane stands off from the middle of the mound. */
  distance: number;
  /** Level of the pad the burrow stands on. */
  base: number;
  /** Half-width of the cut. */
  halfWidth: number;
  /** Arch height at the middle of the cut. */
  height: number;
}

/** The burrow dome above the pad: half an ellipsoid. */
export function moundHeight(burrow: Burrow, x: number, z: number): number {
  const distance = Math.hypot(x - burrow.x, z - burrow.z);
  if (distance >= burrow.radius) return 0;
  return burrow.height * Math.sqrt(1 - (distance / burrow.radius) ** 2);
}

/** Arch height on the cut, at side offset s from the door. */
export function faceHeightAt(burrow: Burrow, distance: number, s: number): number {
  const r = Math.hypot(s, distance);
  if (r >= burrow.radius) return 0;
  return burrow.height * Math.sqrt(1 - (r / burrow.radius) ** 2);
}

/**
 * How deep into the mound the cut plane goes.
 *
 * Computed so that exactly FACE_CLEARANCE of earth is left above the
 * casing, rather than set as a fraction of the radius: with a fraction
 * the margin would drift along with the size of the mound.
 */
export function faceDistance(burrow: Burrow): number {
  const wanted = DOOR_TOP + FACE_CLEARANCE;
  if (wanted >= burrow.height) return 0;
  return burrow.radius * Math.sqrt(1 - (wanted / burrow.height) ** 2);
}

/**
 * The facade point on the plane. Separate from faceOf because it is
 * needed where there is no terrain yet: vegetation and ground painting
 * steer clear of the doors, and they do not need the height for that.
 */
export function facePoint(burrow: Burrow): { x: number; z: number } {
  const yaw = doorFacing(burrow);
  const distance = faceDistance(burrow);
  return {
    x: burrow.x + Math.sin(yaw) * distance,
    z: burrow.z + Math.cos(yaw) * distance,
  };
}

/** Everything both the terrain and the mesh builder need. */
export function faceOf(burrow: Burrow, valleyFloorAt: (x: number, z: number) => number): BurrowFace {
  const yaw = doorFacing(burrow);
  const distance = faceDistance(burrow);

  return {
    yaw,
    x: burrow.x + Math.sin(yaw) * distance,
    z: burrow.z + Math.cos(yaw) * distance,
    distance,
    // Taken at the THRESHOLD, not at the crown. On a bank of any slope
    // those are different heights — 1.0 to 1.4 m apart on a 27-degree one —
    // and the facade stands at the threshold. Levelled to the crown, the
    // doorstep is buried and the pad has to iron the whole bank flat to
    // reach it, which is exactly how the hillside gets cancelled
    base: valleyFloorAt(
      burrow.x + Math.sin(yaw) * distance,
      burrow.z + Math.cos(yaw) * distance,
    ),
    halfWidth: Math.sqrt(Math.max(0, burrow.radius ** 2 - distance ** 2)),
    height: faceHeightAt(burrow, distance, 0),
  };
}

/**
 * How far the terrain under the burrow is pulled up to the pad level.
 * Without the leveling, valley swells climb up in front of the facade
 * and drown the bottom of the door.
 */
/**
 * How strongly the ground here is pulled to a pad's level.
 *
 * Takes only the disc, not a whole Burrow: the buildings hold their
 * ground level through this same function, and a building has no mound
 * and no height.
 */
export interface Pad {
  x: number;
  z: number;
  radius: number;
  /** The threshold, and the way the door faces. Zero facing = a building. */
  fx: number;
  fz: number;
  sx: number;
  sz: number;
  /** (radius + PAD_MARGIN + PAD_FADE) squared, worked out once. */
  outerSq: number;
}

const ease = (t: number): number => t * t * (3 - 2 * t);

export function padWeight(pad: Pad, x: number, z: number): number {
  const dx = x - pad.x;
  const dz = z - pad.z;
  const d2 = dx * dx + dz * dz;
  // Squared, and against a radius squared once at construction. This is
  // asked some 593,000 times before the first frame and answers no to
  // nearly all of them
  if (d2 >= pad.outerSq) return 0;

  const distance = Math.sqrt(d2);
  const inner = pad.radius + PAD_MARGIN;
  let w = distance <= inner ? 1 : 1 - ease((distance - inner) / PAD_FADE);

  // A building's pad has no face and stays a disc
  if (pad.sx === 0 && pad.sz === 0) return w;

  // Only as wide as the frontage: a forecourt, not a clearing
  const side = Math.abs((x - pad.fx) * pad.sz - (z - pad.fz) * pad.sx);
  const sideIn = pad.radius + PAD_SIDE;
  if (side >= sideIn + PAD_SIDE_FADE) return 0;
  if (side > sideIn) w *= 1 - ease((side - sideIn) / PAD_SIDE_FADE);

  // And it stops just behind the cut. Beyond that is the hill itself,
  // which is the whole point of the dwelling
  const forward = (x - pad.fx) * pad.sx + (z - pad.fz) * pad.sz;
  if (forward >= 0) return w;
  if (forward <= -PAD_BACK) return 0;
  return w * (1 - ease(-forward / PAD_BACK));
}

/** The dome behind the cut plane; in front of it there is none. */
export function moundContribution(burrow: Burrow, face: BurrowFace, x: number, z: number): number {
  const mound = moundHeight(burrow, x, z);
  if (mound <= 0) return 0;

  const forward = (x - face.x) * Math.sin(face.yaw) + (z - face.z) * Math.cos(face.yaw);
  if (forward <= -FACE_CUT_BLEND) return mound;
  if (forward >= 0) return 0;

  const t = -forward / FACE_CUT_BLEND;
  return mound * t * t * (3 - 2 * t);
}

export interface SilhouettePoint {
  s: number;
  bottom: number;
  top: number;
}

/**
 * Silhouette of the cut: the facade outline is built from it, and it is
 * also what guarantees the facade covers the terrain. The bottom is
 * level because the ground under the burrow is flattened by the pad.
 */
export function faceSilhouette(
  burrow: Burrow,
  face: BurrowFace,
  steps: number,
  sink: number,
): SilhouettePoint[] {
  const points: SilhouettePoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = -face.halfWidth + (i / steps) * face.halfWidth * 2;
    points.push({ s, bottom: -sink, top: faceHeightAt(burrow, face.distance, s) });
  }
  return points;
}
