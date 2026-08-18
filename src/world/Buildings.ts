import * as THREE from 'three';

import { BUILDINGS, MILL } from '../config/buildings';
import { WHEEL_X, WHEEL_Z } from '../config/constants';
import type { Circle } from './Obstacles';
import { timberBuilding } from './building/frame';
import { millExtras } from './building/mill';
import { MillWheel } from './building/wheel';
import type { PropBatch } from './props/batch';

/**
 * Every rectilinear building in the valley.
 *
 * Thin on purpose: the descriptions live in config/buildings.ts and the
 * joinery in building/frame.ts, so this is only the loop and what falls
 * out of it — the blockers and the chimney mouths.
 */
export class Buildings {
  readonly blockers: Circle[] = [];
  /** Stack mouths, handed to Smoke alongside the burrows'. */
  readonly chimneys: THREE.Vector3[] = [];
  /**
   * The one thing in the valley that moves on its own, and therefore the
   * one that cannot join the batch: merged static geometry has its matrix
   * composed once, which is exactly why the batch is cheap.
   */
  readonly wheel = new MillWheel(WHEEL_X, WHEEL_Z);

  constructor(batch: PropBatch) {
    for (const building of BUILDINGS) {
      const built = timberBuilding(building, batch);
      this.blockers.push(...built.blockers);
      // A mill has no hearth, so it contributes no plume
      if (built.chimney !== null) this.chimneys.push(built.chimney);
      if (building.id === MILL.id) millExtras(building, batch);
    }
    // You do not walk into a turning wheel
    this.blockers.push({ x: WHEEL_X, z: WHEEL_Z, radius: 1.35 });
  }

  update(delta: number): void {
    this.wheel.update(delta);
  }

  dispose(): void {
    this.wheel.dispose();
  }
}
