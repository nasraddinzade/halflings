import * as THREE from 'three';

import {
  BRIDGE_BEAM,
  FORD_POST_OUT,
  BRIDGE_DECK_WIDTH,
  BRIDGE_KERB_BURY,
  BRIDGE_PLANKS,
  BRIDGE_PLANK_GAP,
  BRIDGE_RAIL_HEIGHT,
  BRIDGE_X,
  BRIDGE_Z_NORTH,
  BRIDGE_Z_SOUTH,
  FORD_COLS,
  FORD_ROWS,
  FORD_SETT_LENGTH,
  FORD_SETT_PROUD,
  FORD_SETT_THICKNESS,
  FORD_SETT_WIDTH,
  FORD_X,
  FORD_Z,
  RIVER_WATER_DEPTH,
} from '../config/constants';
import { PALETTE } from '../config/palette';
import type { Circle } from './Obstacles';
import { groundHeight, heightAt, lowestAt } from './heightfield';
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
    const halfAcross = (FORD_ROWS * FORD_SETT_WIDTH) / 2;
    const halfAlong = (FORD_COLS * FORD_SETT_LENGTH) / 2;

    for (let row = 0; row < FORD_ROWS; row++) {
      for (let col = 0; col < FORD_COLS; col++) {
        const x = FORD_X - halfAcross + (row + 0.5) * FORD_SETT_WIDTH;
        const z = FORD_Z - halfAlong + (col + 0.5) * FORD_SETT_LENGTH;
        // Laid level with the WATER, not with the bed.
        //
        // A paved ford is a level causeway; the bed under it is not level,
        // because the gravel bar that makes the crossing shallow is a
        // dome. Set at a fixed height above the BED, only the three setts
        // over the top of the dome broke the surface and the other nine
        // stayed invisible — the ford read as three pale slivers floating
        // in the river. Set at a fixed height above the WATER, all of them
        // stand the same height clear of it, which is what a causeway is.
        //
        // The stone is thick enough to reach down into the bed from there,
        // and the excess is buried
        const water = groundHeight(x, z) - RIVER_WATER_DEPTH;
        const sett = new THREE.BoxGeometry(
          FORD_SETT_WIDTH * 0.94, FORD_SETT_THICKNESS, FORD_SETT_LENGTH * 0.94,
        );
        sett.translate(x, water + FORD_SETT_PROUD - FORD_SETT_THICKNESS / 2, z);
        batch.add(sett, PALETTE.rock);
      }
    }

    // Four squared posts marking the entry, the way a real ford is marked.
    // No striped depth gauge — that is a modern highway object.
    //
    // Set clear of the water. The ribbon is drawn RIVER_WIDTH * 1.15 wide
    // either side of the channel line, and at 3.2 m out two of the four
    // posts stood in it — a marker standing in the water marks nothing
    for (const x of [FORD_X - 2.2, FORD_X + 2.2]) {
      for (const z of [FORD_Z + FORD_POST_OUT, FORD_Z - FORD_POST_OUT]) {
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
    // so they cannot drift apart. `top` includes the landing ramps
    const top = (t: number): number =>
      deckHeightAt(BRIDGE_X, BRIDGE_Z_SOUTH + span * t) ?? deckLevel();

    /**
     * Lays a box from one point on the deck line to the next, pitched to
     * match the fall between them.
     *
     * Everything on this bridge used to be an axis-aligned box dropped at
     * the height of its own midpoint, which was fine while the deck was
     * level and became a wreck the moment it got landing ramps: over the
     * ramp each plank sat flat 0.2 m below its neighbour, so the deck came
     * apart into a broken staircase with daylight between the treads and
     * one plank lying loose on the grass. The measurements said the
     * crossing was walkable — and it was — but nobody had looked at it.
     */
    const along = (
      t0: number,
      t1: number,
      lift: number,
      width: number,
      thick: number,
      x: number,
      color: number,
      shrink = 0,
    ): void => {
      const z0 = BRIDGE_Z_SOUTH + span * t0;
      const z1 = BRIDGE_Z_SOUTH + span * t1;
      const y0 = top(t0) + lift;
      const y1 = top(t1) + lift;
      const run = z1 - z0;
      const rise = y1 - y0;
      const length = Math.hypot(run, rise);
      const box = new THREE.BoxGeometry(width, thick, Math.max(0.02, length - shrink));
      box.rotateX(-Math.atan2(rise, run));
      box.translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
      batch.add(box, color);
    };

    for (const side of [-1, 1]) {
      for (let i = 0; i < BRIDGE_PLANKS; i++) {
        along(
          i / BRIDGE_PLANKS, (i + 1) / BRIDGE_PLANKS,
          -DECK_SKIN - BRIDGE_BEAM / 2,
          BRIDGE_BEAM, BRIDGE_BEAM * 0.8,
          BRIDGE_X + side * (half - BRIDGE_BEAM * 0.6),
          PALETTE.woodDark,
        );
      }
    }

    for (let i = 0; i < BRIDGE_PLANKS; i++) {
      // A hair of gap between boards: that is what a plank deck looks like,
      // and it is what lets the water show through from above
      along(
        i / BRIDGE_PLANKS, (i + 1) / BRIDGE_PLANKS,
        -DECK_SKIN, BRIDGE_DECK_WIDTH, 0.06, BRIDGE_X, PALETTE.wood,
        BRIDGE_PLANK_GAP,
      );
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

    // A stone kerb where each ramp runs out onto the bank. Without it the
    // last board simply stops on the turf and reads as dropped there
    for (const t of [0, 1]) {
      const z = BRIDGE_Z_SOUTH + span * t;
      const base = lowestAt(BRIDGE_X, z, half);
      const height = top(t) - DECK_SKIN - base + BRIDGE_KERB_BURY;
      const kerb = new THREE.BoxGeometry(BRIDGE_DECK_WIDTH + 0.3, height, 0.5);
      kerb.translate(BRIDGE_X, top(t) - DECK_SKIN - height / 2, z);
      batch.add(kerb, PALETTE.rock);
    }

    // Handrail upstream only. The river runs east to west, so upstream is
    // the +x side: you lean on the rail with the current coming at you
    const railX = BRIDGE_X + half - 0.06;
    for (let i = 0; i <= BRIDGE_PLANKS; i += 2) {
      const t = i / BRIDGE_PLANKS;
      const post = new THREE.BoxGeometry(0.08, BRIDGE_RAIL_HEIGHT, 0.08);
      post.translate(railX, top(t) + BRIDGE_RAIL_HEIGHT / 2, BRIDGE_Z_SOUTH + span * t);
      batch.add(post, PALETTE.woodDark);
    }
    for (let i = 0; i < BRIDGE_PLANKS; i++) {
      along(
        i / BRIDGE_PLANKS, (i + 1) / BRIDGE_PLANKS,
        BRIDGE_RAIL_HEIGHT, 0.06, 0.07, railX, PALETTE.wood,
      );
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
