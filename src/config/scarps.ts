/**
 * The valley's landform, as data.
 *
 * Before this the floor was flat: mean slope 3 degrees from r=10 to r=100,
 * less than a metre of rise over any eight-metre span anywhere inside the
 * rim. A dwelling dug into a hillside was the one thing the whole village
 * is built around, and there was no hillside — the ground rose 0.30 m
 * across a mound 3.13 m tall, so nine tenths of every "hill" was an
 * artificial dome sitting on a lawn. That is why it did not read.
 *
 * A scarp is a straight crest with round ends, a skirt that falls away
 * from it, and a front that wanders. Dwellings are cut into the skirt, so
 * their doors face down the fall line and their backs are in real ground.
 * Being data rather than noise, the settlement can be derived from it: a
 * row of plots is a contour of a scarp, not a list of coordinates.
 */

export interface Scarp {
  id: string;
  /** Centre of the crest segment. */
  x: number;
  z: number;
  /** Bearing of the crest; the fall line runs deg - 90. */
  deg: number;
  /** Half-length of the crest segment. The ends are round caps. */
  half: number;
  /** Distance at which the skirt is exactly zero. */
  toe: number;
  /** Width of the falling skirt. */
  width: number;
  /** Metres the shelf stands above the ground outside the toe. */
  rise: number;
  /** How far the front wanders, in metres. */
  wobble: number;
  wave: number;
  phase: number;
  /** Exempt from the water guard. */
  free?: boolean;
}

export const SCARPS: readonly Scarp[] = [
  // The broad lie of the land. Its crest lies west of everything, so its
  // uphill direction is the same westward one the smaller banks have and
  // it can never flip a fall line: it peaks at 10 degrees against a bank's
  // 28. No dwellings sit on it. It is why the higher end and the mill
  // stand three metres above the green.
  //
  // Its toe is 27 and not the 38 first proposed: at 38 the skirt reaches
  // 105.6 m, and the rim starts at 104.96. A landform term that touches
  // the rim is a landform term that can open the world's own border.
  {
    id: 'shoulder', x: -46, z: 12, deg: 158, half: 10,
    toe: 27, width: 38, rise: 4.5, wobble: 4, wave: 0.1, phase: 0.4, free: true,
  },
  // The knot: four plots on the west side of the green.
  {
    id: 'town', x: -9.5, z: 6, deg: 157.7, half: 24,
    toe: 19, width: 11, rise: 4.15, wobble: 3.5, wave: 0.105, phase: 1.35,
  },
  // The higher end: three plots, up the shoulder and back.
  {
    id: 'high', x: -44, z: 34, deg: 161, half: 17,
    toe: 19, width: 11, rise: 4.15, wobble: 3, wave: 0.12, phase: 2.7,
  },
  // The far bank's terrace: four plots looking north over the channel.
  // Exempt from the guard because it IS the terrace the guard exists to
  // protect — guarding it against itself would flatten it.
  {
    id: 'haugh', x: 2.3, z: -50.8, deg: 114, half: 20,
    toe: 19, width: 11, rise: 4.15, wobble: 2.6, wave: 0.14, phase: 0.15, free: true,
  },
  // Three steadings above the mill, at the west end of the water.
  {
    id: 'millbank', x: -47, z: -12, deg: 150, half: 15,
    toe: 19, width: 11, rise: 3.9, wobble: 2, wave: 0.18, phase: 3.9,
  },
  // A single hillock east of the green: one outlying farmstead, so the
  // nucleus reads as the middle of a parish rather than as the whole world.
  {
    id: 'fold', x: 28, z: 30, deg: 158, half: 3,
    toe: 19, width: 11, rise: 4.15, wobble: 2, wave: 0.2, phase: 1.9,
  },
];

/**
 * Where the wood stops.
 *
 * One disc per focus, not one circle round the origin. TREE_CLEARING_RADIUS
 * was a single 46 m ring centred on (0, 0) — which was the middle of the
 * ring of dwellings, and the ring is gone. With five foci scattered across
 * the valley a single circle either leaves half the village in the wood or
 * clears the whole valley; and it never cleared bushes at all, so scrub
 * grew up the street and inside the garden palings.
 */
export const CLEARINGS: ReadonlyArray<{ x: number; z: number; radius: number }> = [
  { x: 4.7, z: 14.7, radius: 27 },     // the knot
  // The green itself. It was inside the knot's disc when that disc was
  // drawn, and the green has since grown east and south past it: the pond
  // stood 1.8 m outside and the pound 0.8 m, which meant the wood was free
  // to close over both. The village pond spent the rebuild in a thicket,
  // invisible from the green it belongs to
  { x: 23, z: -1, radius: 15 },        // the green, its pond and its pound
  { x: -28.7, z: 45.4, radius: 22 },   // the higher end
  { x: 6.1, z: -36.9, radius: 31 },    // the water row
  { x: -34.8, z: -6.5, radius: 21 },   // the mill hamlet
  { x: 43.1, z: 36.7, radius: 14 },    // the outlying farmstead
];

/** True where the wood is kept off. */
export function inClearing(x: number, z: number): boolean {
  for (let i = 0; i < CLEARINGS.length; i++) {
    const c = CLEARINGS[i];
    if (c === undefined) continue;
    const dx = x - c.x;
    const dz = z - c.z;
    if (dx * dx + dz * dz < c.radius * c.radius) return true;
  }
  return false;
}
