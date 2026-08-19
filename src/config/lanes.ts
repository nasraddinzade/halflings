import { BURROWS, FACE_CLEARANCE, doorFacing, type Burrow } from './burrows';
import { DOOR_TOP } from '../world/burrow/profile';
import { riverCenterZ } from '../world/heightfield';

/**
 * The village's ways, as data.
 *
 * A village that uses one width for everything cannot read as a village.
 * Real ways come in a hierarchy with legally fixed widths — footpath,
 * field-edge path, bridleway, cart road — and the difference between them
 * is most of what tells you where you are. These are the surveyed widths
 * scaled to a 1.1 m halfling against a 1.70 m adult.
 *
 * What was here before was ten straight segments radiating from the spawn
 * point to every door: a star. With six dwellings it was odd, with
 * fifteen it would be a sunburst. No path joined two dwellings, none
 * crossed the river, none went anywhere.
 *
 * Every point below was solved against the height field rather than
 * placed by eye, and each route is checked to clear every mound by at
 * least a metre, stay out of the water and stay under 26 degrees.
 */

export type LaneClass = 'cart' | 'front' | 'croft' | 'foot';

export interface Lane {
  id: string;
  kind: LaneClass;
  points: ReadonlyArray<readonly [number, number]>;
}

/** Half-width of the beaten track. */
export const LANE_HALF_WIDTH: Readonly<Record<LaneClass, number>> = {
  cart: 1,
  front: 0.8,
  croft: 0.5,
  foot: 0.35,
};

/** How far the wear fades past the track, as a multiple of the half-width. */
export const LANE_BLEND = 1.45;

export const LANES: readonly Lane[] = [
  // Routed on the BUILT surface, not drawn on a map: cost is length times
  // (1 + 9 grade^2), with a penalty past 22 degrees and a hard refusal
  // past 26, and water, mounds and building pads forbidden. That is why
  // the street holds 7 degrees across the knot while the hollow way up to
  // the higher end is allowed 29.7 — a lane that climbs is a lane that
  // climbs, and pretending otherwise is what produces a road through a
  // hillside.
  {
    // Past every door of the knot, along the green's west edge
    id: 'street', kind: 'front',
    points: [[1.5, 31], [9.5, 22.5], [10.5, 21], [10.5, 18.5], [14.5, 14.5],
             [14.5, 9], [15.5, 8], [15.5, -2], [16, -2.5]],
  },
  {
    // The toft rears behind the knot: how you get to the back of a plot
    id: 'back', kind: 'croft',
    points: [[-19, 21.5], [-8.5, 11], [-8.5, -1], [-6.5, -3], [-6.5, -8.5], [-6, -9]],
  },
  {
    // The hollow way up to the higher end. It is steep because the ground
    // is steep; a village on a hill has one of these
    id: 'higher', kind: 'cart',
    points: [[-19, 21.5], [-24, 26.5], [-27, 26.5], [-34, 33.5], [-34.5, 39.5],
             [-35.5, 40.5], [-35.5, 42], [-40, 47], [-40, 52], [-38.5, 55.5],
             [-33, 56], [-30.5, 54.5], [-30, 55]],
  },
  {
    // The green to the mill, along the north bank
    id: 'millway', kind: 'cart',
    points: [[16, -2.5], [14, -4.5], [14, -13], [13, -14], [11, -14], [9.5, -15.5],
             [4, -16], [2, -17], [-3, -17.5], [-5, -18.5], [-10.5, -19], [-13, -20],
             [-16.5, -20], [-19.5, -17], [-23.5, -17]],
  },
  {
    // The mill up to its three steadings
    id: 'mill-end', kind: 'croft',
    points: [[-23.5, -17], [-23, -12.5], [-27.5, -6.5], [-28.5, -3], [-31, -0.5],
             [-31, 2], [-34, 5], [-35.5, 4], [-35, 3]],
  },
  {
    // Down off the millway to the crossing
    id: 'ford', kind: 'cart',
    points: [[-6, -18.5], [-3, -19], [-2, -20], [-2, -24.5], [-1, -25.5], [-3, -27.5], [-4.5, -27.5]],
  },
  {
    // In front of the water row, on the far bank
    id: 'far', kind: 'front',
    points: [[-8, -28.5], [-4, -29], [-2.5, -30.5], [1.5, -30.5], [4.5, -33.5],
             [9.5, -33.5], [13.5, -35], [26, -35]],
  },
  { id: 'bridge-s', kind: 'foot', points: [[26, -35], [16.5, -25.5], [16.5, -23.5]] },
  { id: 'bridge-n', kind: 'foot', points: [[16.5, -14.5], [14, -11.5], [14, -9], [15.5, -7.5]] },
  {
    // Out to the outlying farmstead
    id: 'fold', kind: 'croft',
    points: [[28, 20], [38.5, 30.5], [40, 33]],
  },
];

/** Where a burrow's threshold sits, and which way it faces. */
function threshold(burrow: Burrow): { x: number; z: number; yaw: number; reach: number } {
  const yaw = doorFacing(burrow);
  const reach = burrow.radius
    * Math.sqrt(Math.max(0, 1 - ((DOOR_TOP + FACE_CLEARANCE) / burrow.height) ** 2));
  return { x: burrow.x + Math.sin(yaw) * reach, z: burrow.z + Math.cos(yaw) * reach, yaw, reach };
}

/**
 * The short path from each threshold to the street. Generated rather than
 * written down, so it follows a dwelling that moves.
 *
 * On the far bank the street is behind the row, and a straight line from
 * the door to it would go through the mound — so those turn the corner.
 */
export function doorSpurs(): Lane[] {
  const spurs: Lane[] = [];

  for (const burrow of BURROWS) {
    const door = threshold(burrow);
    const step = 0.6;
    const from: [number, number] = [
      burrow.x + Math.sin(door.yaw) * (door.reach + step),
      burrow.z + Math.cos(door.yaw) * (door.reach + step),
    ];

    if (burrow.z > riverCenterZ(burrow.x)) {
      const to: [number, number] = [
        burrow.x + Math.sin(door.yaw) * (door.reach + 3.2),
        burrow.z + Math.cos(door.yaw) * (door.reach + 3.2),
      ];
      spurs.push({ id: `spur-${burrow.id}`, kind: 'croft', points: [from, to] });
      continue;
    }

    // Round the side, then back to the street behind.
    const side = door.yaw + Math.PI / 2;
    const flank = burrow.radius + 1.4;
    const behind = door.reach + burrow.radius + 3;
    spurs.push({
      id: `spur-${burrow.id}`,
      kind: 'croft',
      points: [
        from,
        [burrow.x + Math.sin(side) * flank, burrow.z + Math.cos(side) * flank],
        [burrow.x - Math.sin(door.yaw) * behind, burrow.z - Math.cos(door.yaw) * behind],
      ],
    });
  }

  return spurs;
}
