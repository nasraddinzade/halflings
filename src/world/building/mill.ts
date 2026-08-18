import * as THREE from 'three';

import {
  FRAME_POST,
  FRAME_STOREY,
  FRAME_STUD,
  LUCAM_GABLE,
  LUCAM_PROJECTION,
  LUCAM_WIDTH,
} from '../../config/constants';
import { buildingLength, type Building } from '../../config/buildings';
import { PALETTE } from '../../config/palette';
import { eavesOf } from './frame';
import { heightAt } from '../heightfield';
import type { PropBatch } from '../props/batch';

/**
 * What makes a mill a mill.
 *
 * The frame is shared with the inn and says nothing about what happens
 * inside. These do: a lucam — the gabled hood that projects from the top
 * storey so a sack can be hoisted out of a cart without getting wet — and
 * the worn-out millstone that ends its life as a doorstep. The lucam is
 * about twenty boxes and it is worth more than the rest of the building,
 * because it is the one silhouette nothing else in a village has.
 */
export function millExtras(building: Building, batch: PropBatch): void {
  const length = buildingLength(building);
  const halfDepth = building.depth / 2;
  const eaves = eavesOf(building);

  // The front is the face that looks away from the water: sacks come off
  // a cart in the yard, not out of the river
  const front = -halfDepth;

  let highest = -Infinity;
  for (let u = -length / 2; u <= length / 2; u += 0.4) {
    for (let v = -halfDepth; v <= halfDepth; v += 0.4) {
      const p = place(building, u, v);
      highest = Math.max(highest, heightAt(p.x, p.z));
    }
  }
  const floorY = highest + 0.02;

  const put = (geometry: THREE.BufferGeometry, color: number, u: number, y: number, v: number): void => {
    geometry.rotateY(building.yaw);
    const p = place(building, u, v);
    geometry.translate(p.x, floorY + y, p.z);
    batch.add(geometry, color);
  };

  const sill = eaves - FRAME_STOREY * 0.55;
  const out = front - LUCAM_PROJECTION;

  // The hood: a weatherboarded box on two knees, with its own little gable
  const hood = new THREE.BoxGeometry(LUCAM_WIDTH, FRAME_STOREY * 0.62, LUCAM_PROJECTION);
  put(hood, PALETTE.wood, 0, sill + FRAME_STOREY * 0.31, front - LUCAM_PROJECTION / 2);

  const gable = new THREE.BoxGeometry(LUCAM_WIDTH, LUCAM_GABLE, LUCAM_PROJECTION * 0.5);
  put(gable, PALETTE.roofTile, 0, sill + FRAME_STOREY * 0.62 + LUCAM_GABLE / 2,
    front - LUCAM_PROJECTION * 0.5);

  for (const side of [-1, 1]) {
    const knee = new THREE.BoxGeometry(FRAME_STUD, 0.5, LUCAM_PROJECTION);
    knee.rotateX(-Math.PI / 5);
    put(knee, PALETTE.woodDark, side * (LUCAM_WIDTH / 2 - 0.06), sill - 0.16,
      front - LUCAM_PROJECTION / 2);
  }

  // The hoist beam, and the rope hanging off it. Without them the hood is
  // a bay window on a barn
  const beam = new THREE.BoxGeometry(0.12, 0.12, LUCAM_PROJECTION + 0.3);
  put(beam, PALETTE.woodDark, 0, sill + FRAME_STOREY * 0.56, front - LUCAM_PROJECTION / 2 - 0.15);
  const rope = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4);
  put(rope, PALETTE.woodDark, 0, sill + FRAME_STOREY * 0.56 - 0.4, out - 0.12);

  // Loading doors under the hood, dark and shut
  const doors = new THREE.BoxGeometry(1.3, 1.1, FRAME_POST * 0.8);
  put(doors, PALETTE.woodDark, 0, sill - 0.55, front - 0.02);

  // A worn millstone for a doorstep. Every mill has one and it is the
  // cheapest possible way to say what the building does
  const stone = new THREE.CylinderGeometry(0.4, 0.4, 0.16, 12);
  put(stone, PALETTE.rock, length * 0.28, 0.08, front - 0.5);
  const eye = new THREE.CylinderGeometry(0.09, 0.09, 0.18, 8);
  put(eye, PALETTE.woodDark, length * 0.28, 0.08, front - 0.5);
}

function place(building: Building, along: number, across: number): { x: number; z: number } {
  const c = Math.cos(building.yaw);
  const s = Math.sin(building.yaw);
  return {
    x: building.x + c * along + s * across,
    z: building.z - s * along + c * across,
  };
}
