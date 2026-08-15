// Единственное место, где проект знает пути к файлам.
// `?url` заставляет Vite проверить существование файла на сборке —
// опечатка становится ошибкой компиляции, а не 404 в рантайме.

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

/** Файлы пака — источник частей для сборки жителей. */
export const PART_URLS: Readonly<Record<PartFile, string>> = {
  Barbarian: barbarianUrl,
  Knight: knightUrl,
  Mage: mageUrl,
  Ranger: rangerUrl,
  Rogue: rogueUrl,
  Rogue_Hooded: rogueHoodedUrl,
};

/** Файлы клипов, нужные вертикальному срезу. Остальные подключим позже. */
export const ANIMATION_URLS: readonly string[] = [
  generalClipsUrl,
  movementClipsUrl,
  // Занятия жителей: Digging, Sawing, Fishing_* (шаг 5)
  toolsClipsUrl,
];

/** Имена клипов — ровно как в docs/ASSETS.md. */
export const CLIP = {
  idle: 'Idle_A',
  walk: 'Walking_A',
  run: 'Running_A',
  jumpStart: 'Jump_Start',
  jumpAir: 'Jump_Idle',
  jumpLand: 'Jump_Land',
} as const;

export type ClipKey = keyof typeof CLIP;

/** Поза из одного кадра, есть в каждом файле пака. В реестр не берём. */
export const IGNORED_CLIPS: readonly string[] = ['T-Pose'];
