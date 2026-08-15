import * as THREE from 'three';

import type { VillagerRole } from './villagers';

/**
 * Инструменты в руках жителей.
 *
 * Размеры — в родных единицах Blender, как и сами персонажи: инструмент
 * вплавляется в их геометрию до CHARACTER_SCALE. Персонаж 2.18 юнита,
 * то есть юнит примерно полметра.
 *
 * Ориентация повторяет соглашение пака: у всех его пропсов (кинжал, топор,
 * посох, кружка) длинная ось — +Y, хват у нуля, рабочий конец сверху,
 * а узел единичный. Значит пропс рассчитан на то, чтобы сесть в кость
 * handslot как есть — и наш повторяет ту же раскладку.
 */

/** Зона атласа: чем красить кусок инструмента. */
export type ToolZone = 'wood' | 'metal' | 'dark';

export interface ToolPart {
  geometry: THREE.BufferGeometry;
  zone: ToolZone;
}

/** Лопата: держак с накладкой, снизу штык. */
function shovel(): ToolPart[] {
  const handle = new THREE.CylinderGeometry(0.045, 0.045, 1.65, 6);
  handle.translate(0, 0.5, 0);

  const blade = new THREE.BoxGeometry(0.32, 0.38, 0.045);
  blade.translate(0, 1.48, 0);

  const collar = new THREE.CylinderGeometry(0.06, 0.06, 0.12, 6);
  collar.translate(0, 1.26, 0);

  return [
    { geometry: handle, zone: 'wood' },
    { geometry: blade, zone: 'metal' },
    { geometry: collar, zone: 'metal' },
  ];
}

/** Пила: короткая рукоять и широкое полотно. */
function saw(): ToolPart[] {
  const grip = new THREE.BoxGeometry(0.13, 0.3, 0.1);
  grip.translate(0, -0.05, 0);

  const blade = new THREE.BoxGeometry(0.17, 0.95, 0.018);
  blade.translate(0.02, 0.62, 0);

  return [
    { geometry: grip, zone: 'wood' },
    { geometry: blade, zone: 'metal' },
  ];
}

/** Удочка: сужающееся удилище. */
function rod(): ToolPart[] {
  const pole = new THREE.CylinderGeometry(0.012, 0.038, 2.2, 5);
  pole.translate(0, 0.78, 0);

  const grip = new THREE.CylinderGeometry(0.05, 0.05, 0.26, 6);
  grip.translate(0, -0.16, 0);

  return [
    { geometry: pole, zone: 'wood' },
    { geometry: grip, zone: 'dark' },
  ];
}

/** Инструмент по роли. Бездельнику ничего не полагается. */
export function toolForRole(role: VillagerRole): ToolPart[] {
  switch (role) {
    case 'gardener': return shovel();
    case 'miller': return saw();
    case 'fisher': return rod();
    case 'idler': return [];
  }
}
