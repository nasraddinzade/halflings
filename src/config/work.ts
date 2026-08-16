// Work points are data, not code (step 5 in docs/PROMPTS.md).
// To move the vegetable garden, you edit this file and nothing else.

import type { VillagerRole } from './villagers';

export interface WorkPoint {
  id: string;
  role: VillagerRole;
  /** Coordinates in meters from the center of the valley. */
  x: number;
  z: number;
}

/**
 * The clip a villager loops while working.
 *
 * KayKit has a convention: the infinitive is the full action with wind-up
 * and return, the gerund is a short loop of the middle (docs/ASSETS.md,
 * section 4). For a villager who works for long stretches, the gerund is
 * exactly what's needed.
 */
export const ROLE_WORK_CLIP: Readonly<Record<VillagerRole, string>> = {
  gardener: 'Digging',
  miller: 'Sawing',
  fisher: 'Fishing_Idle',
  // The idler "works" by gawking around
  idler: 'Idle_B',
};

/**
 * The village's work spots. They stay within ~25 m of the center, where
 * the terrain is flat (see CENTER_CALM_* in constants.ts).
 *
 * Fishers stand on the north bank of the river, 4.2 m from its axis:
 * still dry land, with the water within arm's reach. The coordinates were
 * computed from riverCenterZ(x) — if the riverbed is moved in
 * constants.ts, these three points have to be recomputed.
 */
/** How many meters in front of the villager the prop stands. */
export const PROP_DISTANCE = 0.95;

export const WORK_POINTS: readonly WorkPoint[] = [
  { id: 'garden-1', role: 'gardener', x: -8, z: 10 },
  { id: 'garden-2', role: 'gardener', x: -11.5, z: 13 },
  { id: 'garden-3', role: 'gardener', x: -5, z: 14.5 },
  { id: 'garden-4', role: 'gardener', x: -14, z: 8 },
  { id: 'garden-5', role: 'gardener', x: -9, z: 17 },

  { id: 'saw-1', role: 'miller', x: 9, z: 11 },
  { id: 'saw-2', role: 'miller', x: 12.5, z: 8 },
  { id: 'saw-3', role: 'miller', x: 7, z: 15 },
  { id: 'saw-4', role: 'miller', x: 14, z: 13 },

  { id: 'river-1', role: 'fisher', x: -8, z: -19.3 },
  { id: 'river-2', role: 'fisher', x: 4, z: -17.0 },
  { id: 'river-3', role: 'fisher', x: 16, z: -14.8 },

  { id: 'square-1', role: 'idler', x: 0, z: 9 },
  { id: 'square-2', role: 'idler', x: 3.5, z: 12 },
  { id: 'square-3', role: 'idler', x: -3.5, z: 11 },
];

/** Where a villager faces at work: the valley center — and the prop too. */
export function workFacing(point: WorkPoint): number {
  return Math.atan2(-point.x, -point.z);
}

/** Where the garden bed, sawhorse or reeds go: in front, not underneath. */
export function propPosition(point: WorkPoint): { x: number; z: number } {
  const yaw = workFacing(point);
  return {
    x: point.x + Math.sin(yaw) * PROP_DISTANCE,
    z: point.z + Math.cos(yaw) * PROP_DISTANCE,
  };
}
