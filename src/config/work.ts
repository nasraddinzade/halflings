// Точки работы — данные, а не код (шаг 5 в docs/PROMPTS.md).
// Чтобы передвинуть огород, правится этот файл и больше ничего.

import type { VillagerRole } from './villagers';

export interface WorkPoint {
  id: string;
  role: VillagerRole;
  /** Координаты в метрах от центра долины. */
  x: number;
  z: number;
}

/**
 * Клип, который житель крутит на работе.
 *
 * У KayKit соглашение: инфинитив — полное действие с замахом и возвратом,
 * герундий — короткая петля середины (docs/ASSETS.md, раздел 4). Для
 * жителя, который работает подолгу, нужен именно герундий.
 */
export const ROLE_WORK_CLIP: Readonly<Record<VillagerRole, string>> = {
  gardener: 'Digging',
  miller: 'Sawing',
  fisher: 'Fishing_Idle',
  // Бездельник «работает» тем, что глазеет по сторонам
  idler: 'Idle_B',
};

/**
 * Рабочие места деревни. Держатся в радиусе ~25 м от центра — там
 * рельеф ровный (см. CENTER_CALM_* в constants.ts).
 *
 * Рыбаки стоят там, где по замыслу пройдёт река (решение №4). Реки пока
 * нет, так что они удят посуху — это станет на место, когда появится вода.
 */
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

  { id: 'river-1', role: 'fisher', x: 16, z: -7 },
  { id: 'river-2', role: 'fisher', x: 19, z: -10 },
  { id: 'river-3', role: 'fisher', x: 13, z: -11 },

  { id: 'square-1', role: 'idler', x: 0, z: 9 },
  { id: 'square-2', role: 'idler', x: 3.5, z: 12 },
  { id: 'square-3', role: 'idler', x: -3.5, z: 11 },
];
