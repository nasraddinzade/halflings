import { BAY } from './constants';

/**
 * The valley's rectilinear buildings, as data.
 *
 * A village of grass mounds and round doors needs one straight-edged
 * silhouette or it reads as a burrow colony rather than a place people
 * built. The inn is that silhouette, and the mill will be the second — so
 * both come out of one description and one builder.
 *
 * A timber frame is not decorated with beams: it IS the beams, and the
 * panels are what is left between them. That is the whole reason this is
 * worth building properly rather than texturing a box.
 */

export interface Building {
  id: string;
  /** Centre of the footprint. */
  x: number;
  z: number;
  /** Bays along the long axis. Every building is a whole number of them. */
  bays: number;
  /** Depth across, in metres. */
  depth: number;
  /** Which way the long front faces, radians. */
  yaw: number;
  /** Roof pitch, degrees. NOT scaled: an angle is the same at any size. */
  pitch: number;
  /** Close studding on the front, box panels elsewhere: the show face. */
  showFront: boolean;
  /** Where the stack rises, as a share of the length from the centre. */
  stackAt: number;
}

/**
 * The inn, at the head of the green.
 *
 * `docs/VILLAGE.md` §2.6 says (5.5, 23.4). That is wrong, and measurably:
 * it puts the plinth **2.61 m inside burrow-1's mound** and 0.32 m into
 * burrow-1's own path to its door. The section was written when the
 * village had six dwellings and burrow-1 was not there.
 *
 * (-0.1, 27) is where the built world already assumes it — `hedges.ts`
 * runs the toft ring off an inn seat there, and both the cart lane and the
 * front lane meet at a vertex that exists to serve it. It is also right on
 * the merits: bearing 359.8 against a gap midpoint of 0.1, in the one wide
 * opening of the frontage ring between burrow-15 at 337.1 and burrow-1 at
 * 23.1. It clears its neighbour's mound by 3.36 m, the front lane by 3.79,
 * the nearest hedgerow tree by 2.19 — and of every footprint tested across
 * the whole head of the green, none was more level.
 */
export const INN: Building = {
  id: 'inn',
  x: -0.1,
  z: 27,
  bays: 3,
  // Three bays long, and deep for a village house: the through passage
  // has to take a cart. BAY is already at halfling scale — see its comment
  depth: BAY * 1.6,
  // Facing down the green, which is where the custom comes from
  yaw: Math.PI,
  // Thatch cannot be shallow: below about 45 degrees it holds water and
  // rots. This is an angle, so VERNACULAR_SCALE does not touch it
  pitch: 50,
  showFront: true,
  stackAt: -0.42,
};

export const BUILDINGS: readonly Building[] = [INN];

/** Length along the long axis, in metres. */
export function buildingLength(building: Building): number {
  return building.bays * BAY;
}

/**
 * The level platforms the terrain has to hold flat, read by heightfield's
 * pad loop.
 *
 * The radius is not the building's size. `padWeight` holds the ground flat
 * out to radius + PAD_MARGIN and fades over PAD_FADE beyond that, so the
 * radius here is set so that flat disc just covers the footprint's own
 * diagonal — no more, or the inn would iron a bald patch across the front
 * lane and half the head of the green.
 */
export const BUILDING_PADS: ReadonlyArray<{ x: number; z: number; radius: number }> =
  BUILDINGS.map((building) => {
    const length = buildingLength(building);
    const diagonal = Math.hypot(length / 2, building.depth / 2);
    return { x: building.x, z: building.z, radius: Math.max(0.4, diagonal - 3.6) };
  });
