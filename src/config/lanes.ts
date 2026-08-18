import { BURROWS, FACE_CLEARANCE, type Burrow } from './burrows';
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
  {
    // From the inn at the head of the green, south through the green, over
    // the ford, and out between the two widest-spaced dwellings on the far
    // bank. The one route that crosses the water.
    id: 'cart',
    kind: 'cart',
    points: [
      [-0.1, 20.1], [0.8, 17], [1.4, 11], [1.2, 6], [0.4, 0], [-0.4, -7],
      [-0.6, -14], [-0.6, -18], [-0.4, -22], [-0.5, -26], [-6.2, -31.6], [-7.7, -37.3],
    ],
  },
  {
    // Past every door on the north bank, the long way round through the
    // north. It cannot be a closed circle: the river breaks the ring on
    // both sides, and a circle would cross it twice.
    id: 'front',
    kind: 'front',
    points: [
      [19.3, -8], [21.1, 0], [20, 8.3], [14.8, 14.8], [8.4, 19.7], [-0.1, 20.1],
      [-8.5, 20.3], [-14.7, 15.2], [-19.7, 9.1], [-20.9, 1.2], [-17.4, -5.9], [-13.1, -13.8],
    ],
  },
  {
    // The far bank's street runs BEHIND its row. Those doors face the
    // centre of the valley, which over there means facing the water, so a
    // street in front of them would be in the river.
    id: 'over-water',
    kind: 'front',
    points: [[30, -30], [14.5, -34.8], [1.8, -36.1], [-16.3, -39.3]],
  },
  {
    // Out of the village between two tofts, as a lane leaves a village.
    id: 'mill',
    kind: 'cart',
    points: [[-8, 1], [-12, -3.5], [-16, -8], [-20, -13.4], [-24, -17], [-26.5, -19.5]],
  },
  {
    // On the green: the south gate to the well, the well to the oak, the
    // oak to the north gate. It used to run THROUGH the well and the oak,
    // because it was drawn before either stood there and its middle two
    // points were simply their positions. Bending the path round them is
    // the right way out; moving them off their own path would leave a
    // beaten track that starts at a gate and ends at nothing, which is
    // exactly why buildPaths() was deleted.
    id: 'green-walk',
    kind: 'foot',
    points: [[0.75, 3], [0.1, 8.8], [-2.55, 12.8], [-4, 15]],
  },
  {
    // The north bank, linking the three fishing spots.
    id: 'bank',
    kind: 'foot',
    points: [[-8, -19.3], [-1, -18.4], [4, -17], [10, -15.9], [16, -14.8]],
  },
];

/** Where a burrow's threshold sits, and which way it faces. */
function threshold(burrow: Burrow): { x: number; z: number; yaw: number; reach: number } {
  const yaw = Math.atan2(-burrow.x, -burrow.z);
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
