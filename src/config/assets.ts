// The only place where the project knows file paths.
// `?url` makes Vite check that the file exists at build time — a typo
// becomes a compile error instead of a 404 at runtime.

import playerModelUrl from '../../assets/characters/halfling_base.glb?url';
import generalClipsUrl from '../../assets/animations/general.glb?url';
import movementClipsUrl from '../../assets/animations/movement.glb?url';
import simulationClipsUrl from '../../assets/animations/simulation.glb?url';
import toolsClipsUrl from '../../assets/animations/tools.glb?url';
import barbarianUrl from '../../assets/characters/parts/Barbarian.glb?url';
import knightUrl from '../../assets/characters/parts/Knight.glb?url';
import mageUrl from '../../assets/characters/parts/Mage.glb?url';
import rangerUrl from '../../assets/characters/parts/Ranger.glb?url';
import rogueUrl from '../../assets/characters/parts/Rogue.glb?url';
import rogueHoodedUrl from '../../assets/characters/parts/Rogue_Hooded.glb?url';
import cowUrl from '../../assets/animals/cow.glb?url';
import bullUrl from '../../assets/animals/bull.glb?url';

import type { PartFile } from './villagers';
import type { AnimalKind } from './animals';

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

/**
 * The field animals, prepared by tools/prepare-animals.mjs from the
 * Quaternius pack (CC0). Each carries its own skeleton and its own five
 * clips, so unlike the villagers they need no separate animation files.
 */
export const ANIMAL_URLS: Readonly<Record<AnimalKind, string>> = {
  cow: cowUrl,
  bull: bullUrl,
};

/** Clip files the vertical slice needs. The rest get wired up later. */
export const ANIMATION_URLS: readonly string[] = [
  generalClipsUrl,
  movementClipsUrl,
  // Villager occupations: Digging, Sawing, Fishing_* (step 5)
  toolsClipsUrl,
  // Waving, and the sit/lie triplets a bench will want later. 247 KB
  simulationClipsUrl,
];

/** Clip names — exactly as in docs/ASSETS.md. */
export const CLIP = {
  idle: 'Idle_A',
  walk: 'Walking_A',
  run: 'Running_A',
  jumpStart: 'Jump_Start',
  jumpAir: 'Jump_Idle',
  jumpLand: 'Jump_Land',
  /** A villager greeting the player. Plays once, then back to work. */
  wave: 'Waving',
} as const;

export type ClipKey = keyof typeof CLIP;

/** Single-frame pose, present in every pack file. Kept out of the registry. */
export const IGNORED_CLIPS: readonly string[] = ['T-Pose'];
