// The only place where the project knows file paths.
// `?url` makes Vite check that the file exists at build time — a typo
// becomes a compile error instead of a 404 at runtime.

import playerModelUrl from '../../assets/characters/halfling_base.glb?url';
import generalClipsUrl from '../../assets/animations/general.glb?url';
import movementClipsUrl from '../../assets/animations/movement.glb?url';
import toolsClipsUrl from '../../assets/animations/tools.glb?url';
import barbarianUrl from '../../assets/characters/parts/Barbarian.glb?url';
import knightUrl from '../../assets/characters/parts/Knight.glb?url';
import mageUrl from '../../assets/characters/parts/Mage.glb?url';
import rangerUrl from '../../assets/characters/parts/Ranger.glb?url';
import rogueUrl from '../../assets/characters/parts/Rogue.glb?url';
import rogueHoodedUrl from '../../assets/characters/parts/Rogue_Hooded.glb?url';

import type { PartFile } from './villagers';

export const PLAYER_MODEL_URL = playerModelUrl;

/** Pack files — the source of parts for assembling villagers. */
export const PART_URLS: Readonly<Record<PartFile, string>> = {
  Barbarian: barbarianUrl,
  Knight: knightUrl,
  Mage: mageUrl,
  Ranger: rangerUrl,
  Rogue: rogueUrl,
  Rogue_Hooded: rogueHoodedUrl,
};

/** Clip files the vertical slice needs. The rest get wired up later. */
export const ANIMATION_URLS: readonly string[] = [
  generalClipsUrl,
  movementClipsUrl,
  // Villager occupations: Digging, Sawing, Fishing_* (step 5)
  toolsClipsUrl,
];

/** Clip names — exactly as in docs/ASSETS.md. */
export const CLIP = {
  idle: 'Idle_A',
  walk: 'Walking_A',
  run: 'Running_A',
  jumpStart: 'Jump_Start',
  jumpAir: 'Jump_Idle',
  jumpLand: 'Jump_Land',
} as const;

export type ClipKey = keyof typeof CLIP;

/** Single-frame pose, present in every pack file. Kept out of the registry. */
export const IGNORED_CLIPS: readonly string[] = ['T-Pose'];
