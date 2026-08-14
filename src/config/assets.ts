// Единственное место, где проект знает пути к файлам.
// `?url` заставляет Vite проверить существование файла на сборке —
// опечатка становится ошибкой компиляции, а не 404 в рантайме.

import playerModelUrl from '../../assets/characters/halfling_base.glb?url';
import generalClipsUrl from '../../assets/animations/general.glb?url';
import movementClipsUrl from '../../assets/animations/movement.glb?url';

export const PLAYER_MODEL_URL = playerModelUrl;

/** Файлы клипов, нужные вертикальному срезу. Остальные подключим позже. */
export const ANIMATION_URLS: readonly string[] = [generalClipsUrl, movementClipsUrl];

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
