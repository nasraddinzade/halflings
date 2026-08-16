import * as THREE from 'three';

import type { VillagerRole } from './villagers';

/**
 * Tools in the villagers' hands.
 *
 * Sizes are in native Blender units, same as the characters themselves:
 * the tool is merged into their geometry before CHARACTER_SCALE. A
 * character is 2.18 units, so a unit is about half a meter.
 *
 * The orientation follows the pack's convention: on every one of its
 * props (dagger, axe, staff, mug) the long axis is +Y, the grip sits at
 * zero, the working end points up, and the node scale is identity. So a
 * prop is meant to drop into the handslot bone as is — and ours repeats
 * that same layout.
 */

/** Atlas zone: what to paint a piece of the tool with. */
export type ToolZone = 'wood' | 'metal' | 'dark';

export interface ToolPart {
  geometry: THREE.BufferGeometry;
  zone: ToolZone;
}

/** Shovel: a shaft with a collar, blade at the bottom. */
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

/** Saw: a short grip and a wide blade. */
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

/** Fishing rod: a tapering pole. */
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

/** Tool by role. The idler gets nothing. */
export function toolForRole(role: VillagerRole): ToolPart[] {
  switch (role) {
    case 'gardener': return shovel();
    case 'miller': return saw();
    case 'fisher': return rod();
    case 'idler': return [];
  }
}
