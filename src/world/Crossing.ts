import * as THREE from 'three';

import {
  BRIDGE_BEAM,
  BRIDGE_DECK_WIDTH,
  BRIDGE_PLANKS,
  BRIDGE_RAIL_HEIGHT,
  BRIDGE_X,
  BRIDGE_Z_NORTH,
  BRIDGE_Z_SOUTH,
  FORD_SETTS,
  FORD_SETT_LENGTH,
  FORD_SETT_WIDTH,
  FORD_X,
  FORD_Z,
  RIVER_WATER_DEPTH,
} from '../config/constants';
import { PALETTE } from '../config/palette';
import type { Circle } from './Obstacles';
import { groundHeight, heightAt } from './heightfield';
import { DECK_SKIN, deckHeightAt, deckLevel } from './bridge';
import type { PropBatch } from './props/batch';

/**
 * The two ways over the river.
 *
 * They exist to make the river a place rather than a wall. Wading already
 * works — the bed is cut into the terrain and the controller slows in it —
 * so neither of these is needed to cross. What they add is a choice: the
 * ford is the short way and you get wet, the bridge is dry and it is a
 * detour. That is why the bridge is deliberately NOT on the cart lane.
 *
 * No regrading. docs/VILLAGE.md specifies 4.5 m ramps at 7 % on both ford
 * approaches; measured on the lane as built, the banks at the water's edge
 * stand at 21.1 and 21.7 degrees against a MAX_SLOPE of 50. They are
 * already walkable, and a height-field term to fix a problem that is not
 * there would cost startup for nothing.
 */
export class Crossing {
  readonly blockers: Circle[] = [];

  constructor(batch: PropBatch) {
    this.buildFord(batch);
    this.buildBridge(batch);
  }

  /**
   * The ford: setts laid flush in the bed, and four marker posts.
   *
   * The setts are what make it read as a crossing rather than a wet
   * patch — a made surface says somebody drives a cart through here. They
   * are laid flush and never proud: a lip in the middle of a river is a
   * trip hazard the player cannot see, and it would break the wade.
   */
  private buildFord(batch: PropBatch): void {
    const halfWidth = (FORD_SETTS / 4) * FORD_SETT_WIDTH * 0.5;

    for (let row = 0; row < FORD_SETTS / 4; row++) {
      for (let col = 0; col < 4; col++) {
        const x = FORD_X - halfWidth + (row + 0.5) * FORD_SETT_WIDTH;
        const z = FORD_Z - 1.5 * FORD_SETT_LENGTH + (col + 0.5) * FORD_SETT_LENGTH;
        const sett = new THREE.BoxGeometry(FORD_SETT_WIDTH * 0.94, 0.1, FORD_SETT_LENGTH * 0.94);
        // Sunk, not laid on: the bed is what the BVH stands the player on,
        // and a stone proud of it is a step in the middle of a river
        sett.translate(x, heightAt(x, z) - 0.035, z);
        batch.add(sett, PALETTE.rock);
      }
    }

    // Four squared posts marking the entry, the way a real ford is marked.
    // No striped depth gauge — that is a modern highway object
    for (const x of [FORD_X - 2.2, FORD_X + 2.2]) {
      for (const z of [FORD_Z + 3.2, FORD_Z - 3.2]) {
        const post = new THREE.BoxGeometry(0.12, 0.9, 0.12);
        post.translate(x, heightAt(x, z) + 0.4, z);
        batch.add(post, PALETTE.woodDark);
        this.blockers.push({ x, z, radius: 0.18 });
      }
    }
  }

  /**
   * The plank footbridge: two beams, a humped deck, one pair of mid-piles
   * and a handrail on the upstream side only.
   *
   * The asymmetry is the point. A rail on both sides is what a generator
   * produces; a rail on one is what a parish pays for, and it is the
   * cheapest possible signal that somebody decided something here.
   *
   * The deck is 1.10 m wide, which at PLAYER_RADIUS 0.25 means two
   * halflings abreast is a real negotiation rather than a formality.
   */
  private buildBridge(batch: PropBatch): void {
    const span = BRIDGE_Z_NORTH - BRIDGE_Z_SOUTH;
    const half = BRIDGE_DECK_WIDTH / 2;
    // Both the drawn deck and the walked deck come out of world/bridge.ts,
    // so they cannot drift apart. `top` includes the landing ramps at each
    // end; the beams and piles hang off it
    const top = (t: number): number =>
      deckHeightAt(BRIDGE_X, BRIDGE_Z_SOUTH + span * t) ?? deckLevel();

    for (const side of [-1, 1]) {
      // The beams follow the hump as a chain of short segments: one long
      // box would either float at the ends or dive through the deck
      for (let i = 0; i < BRIDGE_PLANKS; i++) {
        const t0 = i / BRIDGE_PLANKS;
        const t1 = (i + 1) / BRIDGE_PLANKS;
        const z = BRIDGE_Z_SOUTH + span * (t0 + t1) / 2;
        const y = top((t0 + t1) / 2) - DECK_SKIN - BRIDGE_BEAM / 2;
        const beam = new THREE.BoxGeometry(BRIDGE_BEAM, BRIDGE_BEAM * 0.8, span / BRIDGE_PLANKS + 0.02);
        beam.translate(BRIDGE_X + side * (half - BRIDGE_BEAM * 0.6), y, z);
        batch.add(beam, PALETTE.woodDark);
      }
    }

    for (let i = 0; i < BRIDGE_PLANKS; i++) {
      const t = (i + 0.5) / BRIDGE_PLANKS;
      const z = BRIDGE_Z_SOUTH + span * t;
      const plank = new THREE.BoxGeometry(BRIDGE_DECK_WIDTH, 0.06, span / BRIDGE_PLANKS * 0.88);
      plank.translate(BRIDGE_X, top(t) - DECK_SKIN, z);
      batch.add(plank, PALETTE.wood);
    }

    // One pair of piles at the middle, standing on the bed
    for (const side of [-1, 1]) {
      const x = BRIDGE_X + side * (half - 0.1);
      const z = BRIDGE_Z_SOUTH + span * 0.5;
      const bed = heightAt(x, z);
      const height = top(0.5) - DECK_SKIN - BRIDGE_BEAM - bed;
      const pile = new THREE.CylinderGeometry(0.09, 0.11, height, 6);
      pile.translate(x, bed + height / 2, z);
      batch.add(pile, PALETTE.woodDark);
    }

    // Handrail upstream only. The river runs east to west, so upstream is
    // the +x side: you lean on the rail with the current coming at you
    const railX = BRIDGE_X + half - 0.06;
    for (let i = 0; i <= BRIDGE_PLANKS; i += 2) {
      const t = i / BRIDGE_PLANKS;
      const z = BRIDGE_Z_SOUTH + span * t;
      const post = new THREE.BoxGeometry(0.08, BRIDGE_RAIL_HEIGHT, 0.08);
      post.translate(railX, top(t) + BRIDGE_RAIL_HEIGHT / 2, z);
      batch.add(post, PALETTE.woodDark);
    }
    for (let i = 0; i < BRIDGE_PLANKS; i++) {
      const t0 = i / BRIDGE_PLANKS;
      const t1 = (i + 1) / BRIDGE_PLANKS;
      const z = BRIDGE_Z_SOUTH + span * (t0 + t1) / 2;
      const rail = new THREE.BoxGeometry(0.06, 0.07, span / BRIDGE_PLANKS + 0.02);
      rail.translate(railX, top((t0 + t1) / 2) + BRIDGE_RAIL_HEIGHT, z);
      batch.add(rail, PALETTE.wood);
    }

    // No blockers on the handrail. A Circle has no height, so these
    // stopped the player at RIVERBED level — an invisible fence strung
    // across the channel, up to 1.44 m below the rail it stood for, in the
    // one place a wading player is meant to be able to go. The rail is
    // above anywhere he can reach on foot, so it needs no collision at
    // all: what it guards is the deck, and the deck has its own
  }
}

/** Water depth on the ford line, for anything that wants to know. */
export function fordDepth(): number {
  return groundHeight(FORD_X, FORD_Z) - RIVER_WATER_DEPTH - heightAt(FORD_X, FORD_Z);
}
