import * as THREE from 'three';

import { BUILDINGS, MILL } from '../config/buildings';
import { PALETTE } from '../config/palette';
import { RIVER_WATER_DEPTH, WHEEL_BEARING, WHEEL_RADIUS, WHEEL_SHAFT_OVERHANG, WHEEL_X, WHEEL_Z } from '../config/constants';
import { groundHeight, heightAt } from './heightfield';
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
  /**
   * The shaft has to reach the mill, so the wheel is told how far that is
   * rather than guessing: the wall is the south face of the mill, and the
   * wheel stands out in the stream because that is where the water is.
   */
  readonly wheel = new MillWheel(WHEEL_X, WHEEL_Z, Math.abs((MILL.z - MILL.depth / 2) - WHEEL_Z) + 0.35);
  /**
   * Where the wheel meets the water, for the spray. Two points, one at
   * each side of the wheel's width, because a single column of puffs on
   * the centre line reads as a chimney standing in a river.
   */
  readonly sprayPoints: THREE.Vector3[] = [];

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

    // Bearings. A shaft turns in something: one block on the mill wall
    // where it goes in, one on a pier beyond the wheel. Static, so they
    // merge with the stone the mill already contributes
    const axleY = this.wheel.mesh.position.y;
    const wallZ = MILL.z - MILL.depth / 2;
    for (const z of [wallZ - 0.1, WHEEL_Z - WHEEL_SHAFT_OVERHANG]) {
      const block = new THREE.BoxGeometry(WHEEL_BEARING, WHEEL_BEARING, WHEEL_BEARING * 0.8);
      block.translate(WHEEL_X, axleY, z);
      batch.add(block, PALETTE.rock);
    }
    // The outer bearing stands on a pier out of the pit, or it is a block
    // hanging in mid-air with a shaft through it
    {
      const z = WHEEL_Z - WHEEL_SHAFT_OVERHANG;
      const bed = heightAt(WHEEL_X, z);
      const height = axleY - WHEEL_BEARING / 2 - bed;
      const pier = new THREE.BoxGeometry(WHEEL_BEARING * 0.85, height, WHEEL_BEARING * 0.85);
      pier.translate(WHEEL_X, bed + height / 2, z);
      batch.add(pier, PALETTE.rock);
      this.blockers.push({ x: WHEEL_X, z, radius: 0.3 });
    }

    // At the waterline on the downstream side, where the floats leave the
    // water — which is where a real wheel throws it
    const surface = groundHeight(WHEEL_X, WHEEL_Z) - RIVER_WATER_DEPTH;
    for (const across of [-0.35, 0.35]) {
      this.sprayPoints.push(
        new THREE.Vector3(WHEEL_X - WHEEL_RADIUS * 0.55, surface + 0.05, WHEEL_Z + across),
      );
    }
  }

  update(delta: number): void {
    this.wheel.update(delta);
  }

  dispose(): void {
    this.wheel.dispose();
  }
}
