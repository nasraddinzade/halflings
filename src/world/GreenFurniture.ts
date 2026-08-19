import * as THREE from 'three';

import {
  POUND_BEDDING,
  POUND_CHORD,
  POUND_RADIUS,
  POUND_SEGMENTS,
  POUND_WALL_HEIGHT,
  POUND_WALL_THICKNESS,
  WELL_BARREL_RADIUS,
  WELL_BEDDING,
  WELL_INNER_RADIUS,
  WELL_OUTER_RADIUS,
  WELL_POST_HEIGHT,
  WELL_SHAFT_DROP,
  WELL_POST_THICKNESS,
  WELL_WALL_HEIGHT,
  GREEN_SEED,
} from '../config/constants';
import { POND, POND_REACH, POUND, WELL, pondEdge } from '../config/green';
import { PALETTE } from '../config/palette';
import { makeRandom } from '../core/random';
import type { Circle } from './Obstacles';
import { heightAt, pondWaterY } from './heightfield';
import type { PropBatch } from './props/batch';

/**
 * What stands on the green: the wellhead, the pound, and the pond's
 * dressing.
 *
 * The oak is not here — it is one more instance in the hedgerow-tree mesh
 * (Vegetation.ts), so the biggest thing on the green costs no draw call
 * at all. The water is not here either: it belongs to Water.ts, with the
 * river, for the same reason.
 *
 * Nothing in this file builds a mesh. Every part goes into the shared
 * PropBatch and comes out merged with the work-site props, because five
 * colours of furniture would otherwise cost fifteen draw calls to draw
 * eight hundred triangles.
 */
export class GreenFurniture {
  /** Circles for the obstacle grid: you cannot walk through a wellhead. */
  readonly blockers: Circle[] = [];

  constructor(batch: PropBatch) {
    const random = makeRandom(GREEN_SEED);
    this.buildWell(batch);
    this.buildPound(batch);
    this.buildPondEdge(batch, random);
  }

  /**
   * The wellhead: a stone drum with a dark shaft, two posts and a
   * windlass. It stands 1.05 m to the top of the barrel — a halfling
   * exactly — which makes it the one object in the village that tells you
   * how big everything else is.
   *
   * Built from primitives rather than a lathed profile. A lathe is the
   * obvious way to make a ring wall and the wrong one here: its winding
   * decides which way the faces point, and wound the natural way the
   * outer wall and the coping face inward, so a FrontSide toon material
   * shows you straight through the well and the inverted-hull outline
   * inflates the wrong way and disappears.
   */
  /**
   * The wellhead.
   *
   * Rebuilt because it was three separate wrongs at once, and every one of
   * them was a thing standing where another thing already was:
   *
   *  - the drum was a CAPPED cylinder, so its own top face lay over the
   *    dark shaft disc and sealed the well. From anywhere a halfling
   *    stands it read as a stone drum with a lid on;
   *  - the two posts stood at OUTER_RADIUS - 0.09, which is inside the
   *    drum's wall, so each was buried to two thirds of its length and
   *    only stubs showed above the stone;
   *  - and with the posts inside the drum the windlass they carry sat over
   *    the wall rather than over the water, so the bucket hung above the
   *    coping instead of down the shaft.
   *
   * Now: an open drum, a rolled rim, a dark shaft well down inside it, and
   * a frame that STRADDLES the drum — posts on the ground outside the
   * stone, a beam across their heads, the barrel under the beam and the
   * rope falling down the middle.
   */
  private buildWell(batch: PropBatch): void {
    const base = heightAt(WELL.x, WELL.z) - WELL_BEDDING;
    const put = (geometry: THREE.BufferGeometry, color: number): void => {
      geometry.translate(WELL.x, base, WELL.z);
      batch.add(geometry, color);
    };

    // Open ended: the cap is what used to seal the well
    const drum = new THREE.CylinderGeometry(WELL_OUTER_RADIUS, WELL_OUTER_RADIUS + 0.03,
      WELL_WALL_HEIGHT, 12, 1, true);
    drum.translate(0, WELL_WALL_HEIGHT / 2, 0);
    put(drum, PALETTE.rock);

    // A rolled rim rather than a slab, and a ring rather than a disc
    const coping = new THREE.TorusGeometry(WELL_OUTER_RADIUS + 0.02, 0.07, 6, 14);
    coping.rotateX(Math.PI / 2);
    coping.translate(0, WELL_WALL_HEIGHT, 0);
    put(coping, PALETTE.rock);

    // The shaft: a disc, not a hole. There is no hole worth cutting in a
    // toon renderer, and a dark face set down inside the drum reads as
    // one. Set well below the rim so the drum's own wall shades it and it
    // reads as depth rather than as a dark lid
    const shaft = new THREE.CircleGeometry(WELL_INNER_RADIUS, 12);
    shaft.rotateX(-Math.PI / 2);
    shaft.translate(0, WELL_WALL_HEIGHT - WELL_SHAFT_DROP, 0);
    put(shaft, PALETTE.ink);

    // The frame straddles the drum: on the ground, outside the stone
    const stand = WELL_OUTER_RADIUS + WELL_POST_THICKNESS;
    for (const side of [-1, 1]) {
      const post = new THREE.BoxGeometry(WELL_POST_THICKNESS, WELL_POST_HEIGHT,
        WELL_POST_THICKNESS);
      post.translate(side * stand, WELL_POST_HEIGHT / 2, 0);
      put(post, PALETTE.woodDark);
    }

    const beam = new THREE.BoxGeometry(stand * 2 + WELL_POST_THICKNESS, 0.09, 0.11);
    beam.translate(0, WELL_POST_HEIGHT + 0.045, 0);
    put(beam, PALETTE.wood);

    const barrel = new THREE.CylinderGeometry(WELL_BARREL_RADIUS, WELL_BARREL_RADIUS,
      stand * 2 - WELL_POST_THICKNESS, 8);
    barrel.rotateZ(Math.PI / 2);
    barrel.translate(0, WELL_POST_HEIGHT - 0.12, 0);
    put(barrel, PALETTE.wood);

    // A windlass with no crank cannot be turned, and a villager standing
    // at one would be miming
    const crank = new THREE.BoxGeometry(0.055, 0.22, 0.055);
    crank.translate(stand + 0.1, WELL_POST_HEIGHT - 0.21, 0);
    put(crank, PALETTE.woodDark);
    const handle = new THREE.BoxGeometry(0.05, 0.05, 0.17);
    handle.translate(stand + 0.1, WELL_POST_HEIGHT - 0.31, 0.085);
    put(handle, PALETTE.woodDark);

    // Rope and bucket fall down the MIDDLE, over the shaft — which is what
    // the frame is for
    const ropeLength = WELL_POST_HEIGHT - 0.12 - (WELL_WALL_HEIGHT + 0.18);
    const rope = new THREE.CylinderGeometry(0.012, 0.012, ropeLength, 4);
    rope.translate(0, WELL_WALL_HEIGHT + 0.18 + ropeLength / 2, 0);
    put(rope, PALETTE.woodDark);

    const bucket = new THREE.CylinderGeometry(0.13, 0.11, 0.2, 8);
    bucket.translate(0, WELL_WALL_HEIGHT + 0.1, 0);
    put(bucket, PALETTE.wood);

    this.blockers.push({ x: WELL.x, z: WELL.z, radius: stand + 0.15 });
  }

  private buildPound(batch: PropBatch): void {
    const pitch = (Math.PI * 2) / POUND_SEGMENTS;
    const put = (geometry: THREE.BufferGeometry, color: number, angle: number,
      radius: number, lift: number): void => {
      const x = POUND.x + Math.cos(angle) * radius;
      const z = POUND.z + Math.sin(angle) * radius;
      // Each footing is bedded into the ground under itself. Taking one
      // height for the whole ring would float the uphill half
      geometry.rotateY(-angle);
      geometry.translate(x, heightAt(x, z) - POUND_BEDDING + lift, z);
      batch.add(geometry, color);
    };

    const gateSlot = Math.round(POUND.gate / pitch) % POUND_SEGMENTS;

    for (let i = 0; i < POUND_SEGMENTS; i++) {
      const angle = i * pitch;
      if (i === gateSlot) continue;

      const wall = new THREE.BoxGeometry(POUND_WALL_THICKNESS, POUND_WALL_HEIGHT, POUND_CHORD);
      wall.translate(0, POUND_WALL_HEIGHT / 2, 0);
      put(wall, PALETTE.rock, angle, POUND_RADIUS, 0);

      // Coping on edge, the way a dry wall is finished so stock cannot
      // work the top stones loose
      const cope = new THREE.BoxGeometry(POUND_WALL_THICKNESS * 0.7, 0.14, POUND_CHORD * 0.96);
      cope.translate(0, POUND_WALL_HEIGHT + 0.07, 0);
      put(cope, PALETTE.rock, angle, POUND_RADIUS, 0);
    }

    this.buildPoundGate(batch, gateSlot * pitch);

    // Blocking circles along the wall, gateway left open
    const steps = POUND_SEGMENTS * 4;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const away = Math.abs(((angle - gateSlot * pitch + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (away > Math.PI - pitch * 0.6) continue;
      this.blockers.push({
        x: POUND.x + Math.cos(angle) * POUND_RADIUS,
        z: POUND.z + Math.sin(angle) * POUND_RADIUS,
        radius: POUND_WALL_THICKNESS,
      });
    }
  }

  /** A five-bar gate, hung ajar: closed reads as a wall, open as a hole. */
  private buildPoundGate(batch: PropBatch, angle: number): void {
    const hinge = angle - ((POUND_CHORD / 2) / POUND_RADIUS);
    const hx = POUND.x + Math.cos(hinge) * POUND_RADIUS;
    const hz = POUND.z + Math.sin(hinge) * POUND_RADIUS;
    const base = heightAt(hx, hz) - POUND_BEDDING;
    // Swung 35 degrees off the wall line, so it reads as a gate rather
    // than as one more panel
    const swing = -angle + (35 * Math.PI) / 180;

    const put = (geometry: THREE.BufferGeometry, color: number): void => {
      geometry.rotateY(swing);
      geometry.translate(hx, base, hz);
      batch.add(geometry, color);
    };

    for (const post of [0, POUND_CHORD]) {
      const stile = new THREE.BoxGeometry(0.1, POUND_WALL_HEIGHT + 0.1, 0.1);
      stile.translate(0, (POUND_WALL_HEIGHT + 0.1) / 2, post);
      put(stile, PALETTE.woodDark);
    }
    for (let bar = 0; bar < 5; bar++) {
      const rail = new THREE.BoxGeometry(0.06, 0.07, POUND_CHORD);
      rail.translate(0, 0.16 + bar * 0.19, POUND_CHORD / 2);
      put(rail, PALETTE.wood);
    }
    const brace = new THREE.BoxGeometry(0.05, 0.06, POUND_CHORD * 1.08);
    brace.rotateX((-24 * Math.PI) / 180);
    brace.translate(0, POUND_WALL_HEIGHT / 2, POUND_CHORD / 2);
    put(brace, PALETTE.wood);
  }

  /**
   * The pond's edge: a hard where the stock go in, and reeds on the side
   * where they do not.
   *
   * Not a ring of boulders at even spacing round the whole bank. That is
   * a garden rockery; a village pond is grass to the water almost all the
   * way round, with one cobbled ramp on the side the carts and the beasts
   * used, and the reeds left standing where nothing trampled them.
   *
   * Everything here shares the styling of the props it merges with. A
   * flat slab does not need to cast a shadow, but asking for that split
   * its colour into a second bucket and cost four draw calls to save
   * two.
   */
  private buildPondEdge(batch: PropBatch, random: () => number): void {
    const water = pondWaterY();

    // The hard faces the footpath, on the pond's east side
    const hardAt = 0.1;
    for (let i = 0; i < 7; i++) {
      const across = -1.05 + (i % 4) * 0.7;
      const out = i < 4 ? 0.35 : -0.35;
      const angle = hardAt + across / POND_REACH;
      const radius = pondEdge(angle) + out;
      const x = POND.x + Math.cos(angle) * radius;
      const z = POND.z + Math.sin(angle) * radius;
      const slab = new THREE.BoxGeometry(0.62 + random() * 0.2, 0.1, 0.52 + random() * 0.2);
      slab.rotateY(angle + (random() - 0.5) * 0.4);
      // Laid on the ramp, not floating over it: the ground under a hard
      // is the bank, and the bank falls away
      slab.translate(x, Math.max(heightAt(x, z), water - 0.04) - 0.02, z);
      batch.add(slab, PALETTE.rock);
    }

    // Reeds on the far quadrant, away from the hard and the path
    for (let clump = 0; clump < 5; clump++) {
      const angle = Math.PI * 0.62 + (clump / 5) * Math.PI * 0.72 + random() * 0.18;
      const radius = pondEdge(angle) - 0.15 - random() * 0.35;
      const cx = POND.x + Math.cos(angle) * radius;
      const cz = POND.z + Math.sin(angle) * radius;
      for (let stalk = 0; stalk < 4; stalk++) {
        const x = cx + (random() - 0.5) * 0.55;
        const z = cz + (random() - 0.5) * 0.55;
        const height = 0.75 + random() * 0.45;
        const reed = new THREE.ConeGeometry(0.04, height, 4);
        reed.translate(x, heightAt(x, z) + height / 2 - 0.05, z);
        batch.add(reed, PALETTE.grassDry);
      }
    }
  }
}
