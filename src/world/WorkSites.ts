import * as THREE from 'three';

import { PALETTE } from '../config/palette';
import { WORK_POINTS, propPosition, workFacing } from '../config/work';
import type { VillagerRole } from '../config/villagers';
import { hashSeed, makeRandom } from '../core/random';
import type { Circle } from './Obstacles';
import type { PropBatch } from './props/batch';
import { heightAt } from './heightfield';

/**
 * Work-site props: garden beds, sawhorses with logs, reeds at the water,
 * benches.
 *
 * Before them the occupations happened in a void — the gardener dug flat
 * grass, the sawyer sawed air. Work points are defined by data
 * (config/work.ts), and the props are built from that same data, so
 * moving the vegetable patch is still a change in exactly one place.
 *
 * Nothing here builds a mesh. Every part goes into the shared PropBatch
 * and comes out merged with the green's furniture: fifteen sites of four
 * items each would otherwise cost close to a hundred draw calls, and
 * merging per module still cost three for every colour in every module.
 */
export class WorkSites {
  /** Prop circles: you shouldn't walk through a sawhorse or a bed. */
  readonly blockers: Circle[] = [];

  constructor(batch: PropBatch) {
    const add = (color: number, geometry: THREE.BufferGeometry): void => {
      batch.add(geometry, color);
    };

    for (const point of WORK_POINTS) {
      const spot = propPosition(point);
      const yaw = workFacing(point);
      const base = heightAt(spot.x, spot.z);
      // A little rotation spread so a row of beds isn't a blueprint
      const random = makeRandom(hashSeed(point.id));
      const tilt = yaw + (random() - 0.5) * 0.5;

      const place = (geometry: THREE.BufferGeometry, color: number): void => {
        geometry.rotateY(tilt);
        geometry.translate(spot.x, base, spot.z);
        add(color, geometry);
      };

      for (const part of propsFor(point.role, random)) place(part.geometry, part.color);
      this.blockers.push({ x: spot.x, z: spot.z, radius: blockRadius(point.role) });
    }

  }
}

interface Part {
  geometry: THREE.BufferGeometry;
  color: number;
}

function blockRadius(role: VillagerRole): number {
  return role === 'fisher' ? 0.35 : 0.6;
}

function propsFor(role: VillagerRole, random: () => number): Part[] {
  switch (role) {
    case 'gardener': return gardenBed(random);
    case 'miller': return sawBench();
    case 'fisher': return reeds(random);
    case 'idler': return bench();
  }
}

/** Garden bed: a box of soil and sprouts in rows. */
function gardenBed(random: () => number): Part[] {
  const parts: Part[] = [];

  const soil = new THREE.BoxGeometry(2, 0.16, 1.2);
  soil.translate(0, 0.08, 0);
  parts.push({ geometry: soil, color: PALETTE.earth });

  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 3; i++) {
      const sprout = new THREE.ConeGeometry(0.07, 0.24 + random() * 0.1, 4);
      sprout.translate(-0.6 + i * 0.6, 0.28, -0.28 + row * 0.56);
      parts.push({ geometry: sprout, color: PALETTE.grass });
    }
  }
  return parts;
}

/** Sawhorse with a log: the thing being sawed. */
function sawBench(): Part[] {
  const parts: Part[] = [];

  const beam = new THREE.BoxGeometry(1.5, 0.12, 0.16);
  beam.translate(0, 0.52, 0);
  parts.push({ geometry: beam, color: PALETTE.wood });

  for (const x of [-0.55, 0.55]) {
    for (const z of [-0.25, 0.25]) {
      const leg = new THREE.BoxGeometry(0.09, 0.52, 0.09);
      leg.translate(x, 0.26, z);
      parts.push({ geometry: leg, color: PALETTE.woodDark });
    }
  }

  const log = new THREE.CylinderGeometry(0.2, 0.2, 1.3, 8);
  log.rotateZ(Math.PI / 2);
  log.translate(0, 0.68, 0);
  parts.push({ geometry: log, color: PALETTE.woodDark });

  return parts;
}

/** Reeds at the water and a crate for the catch. */
function reeds(random: () => number): Part[] {
  const parts: Part[] = [];

  for (let i = 0; i < 6; i++) {
    const stalk = new THREE.ConeGeometry(0.045, 0.8 + random() * 0.5, 4);
    stalk.translate(-0.5 + random(), 0.5, -0.35 + random() * 0.7);
    parts.push({ geometry: stalk, color: PALETTE.grassDry });
  }

  const crate = new THREE.BoxGeometry(0.5, 0.36, 0.4);
  crate.translate(0.55, 0.18, 0.2);
  parts.push({ geometry: crate, color: PALETTE.wood });

  return parts;
}

/** Bench on the square: an idler needs somewhere to idle. */
function bench(): Part[] {
  const parts: Part[] = [];

  const seat = new THREE.BoxGeometry(1.3, 0.1, 0.38);
  seat.translate(0, 0.42, 0);
  parts.push({ geometry: seat, color: PALETTE.wood });

  for (const x of [-0.5, 0.5]) {
    const leg = new THREE.BoxGeometry(0.12, 0.42, 0.34);
    leg.translate(x, 0.21, 0);
    parts.push({ geometry: leg, color: PALETTE.woodDark });
  }

  return parts;
}
