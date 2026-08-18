import type * as THREE from 'three';

import { BUILDINGS } from '../config/buildings';
import type { Circle } from './Obstacles';
import { timberBuilding } from './building/frame';
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

  constructor(batch: PropBatch) {
    for (const building of BUILDINGS) {
      const built = timberBuilding(building, batch);
      this.blockers.push(...built.blockers);
      this.chimneys.push(built.chimney);
    }
  }
}
