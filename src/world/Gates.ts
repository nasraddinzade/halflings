import * as THREE from 'three';

import {
  FIELD_GATE_WIDTH,
  GATE_BARS,
  GATE_HEIGHT,
  GATE_LEAF_SAMPLES,
  GATE_POST,
  GATE_RAIL,
  GATE_SWING,
} from '../config/constants';
import { PALETTE, darken } from '../config/palette';
import { allHedges, type HedgeRun } from '../config/hedges';
import type { Circle } from './Obstacles';
import { heightAt } from './heightfield';
import type { PropBatch } from './props/batch';

/**
 * Field gates: the thing that turns a hole in a hedge into a way in.
 *
 * The gaps came first, and for one commit they stood empty. A hedge with
 * a two-metre hole in it and nothing in the hole does not read as a
 * gateway — it reads as a hedge somebody has driven through. What says
 * gateway is a pair of posts, and a barred gate hung on one of them.
 *
 * The gate is hung OPEN, swung back along the hedge. Partly because it
 * looks like a working farm rather than a museum, and partly because a
 * shut gate would be an obstacle across the only way into the field, and
 * these gaps exist precisely because all forty fields were sealed.
 *
 * No geometry of its own: everything goes into the shared prop batch, so
 * a hundred and sixty gates cost nothing beyond triangles in a mesh the
 * village was already drawing.
 */
/**
 * Weathered timber. PALETTE.wood is fresh sawn and reads bright orange
 * against grass; a gate stands out in the weather for twenty years, and
 * in the first cut every gateway in the valley was a red mark on a green
 * field.
 */
const GATE_TIMBER = darken(PALETTE.wood, 0.74);

export class Gates {
  readonly blockers: Circle[] = [];

  constructor(batch: PropBatch) {
    for (const run of allHedges()) {
      if (!run.id.startsWith('field-')) continue;
      for (const gate of run.gates ?? []) {
        const middle = (gate[0] + gate[1]) / 2;
        const placed = pointAlong(run, middle);
        if (placed === null) continue;
        this.build(batch, placed, (gate[1] - gate[0]) / 2);
      }
    }
  }

  /**
   * One gateway: two posts across the gap, and a barred leaf hung on the
   * left-hand one and swung back out of the way.
   */
  private build(batch: PropBatch, at: Placed, half: number): void {
    const { x, z, dx, dz } = at;

    for (const side of [-1, 1]) {
      const px = x + dx * half * side;
      const pz = z + dz * half * side;
      const post = new THREE.BoxGeometry(GATE_POST, GATE_HEIGHT * 1.15, GATE_POST);
      post.rotateY(Math.atan2(dx, dz));
      post.translate(px, heightAt(px, pz) + (GATE_HEIGHT * 1.15) / 2, pz);
      batch.add(post, darken(PALETTE.woodDark, 0.82));
      // The posts stand at the very edge of the gap, inside the hedge's
      // own footprint, so they narrow nothing the player could use
      this.blockers.push({ x: px, z: pz, radius: GATE_POST });
    }

    // Hung on the near post and swung back: the leaf runs off at an angle
    // to the gap rather than across it
    const hingeX = x - dx * half;
    const hingeZ = z - dz * half;
    const bearing = Math.atan2(dx, dz) + GATE_SWING;
    const lx = Math.sin(bearing);
    const lz = Math.cos(bearing);
    const span = FIELD_GATE_WIDTH * 0.92;
    // The leaf is two metres long, and it must clear the ground along ALL
    // of it. Taking the lower of its two ENDS was not enough: on a bank
    // the ground rises through the middle of the leaf, and it buried the
    // bottom bar at 20 of the 72 gateways, half the leaf at 10 of them and
    // the TOP rail at 6. Sampled along its length instead — a gate hangs
    // from its hinge and swings clear of whatever is under it, so the
    // highest ground it passes over is the one that sets its height
    let base = -Infinity;
    for (let t = 0; t <= GATE_LEAF_SAMPLES; t++) {
      const along = (t / GATE_LEAF_SAMPLES) * span;
      base = Math.max(base, heightAt(hingeX + lx * along, hingeZ + lz * along));
    }

    // Bars. The lowest sits a little off the ground and the top one at
    // full height; five of them is what a field gate has
    for (let b = 0; b < GATE_BARS; b++) {
      const y = base + GATE_HEIGHT * (0.18 + (0.82 * b) / (GATE_BARS - 1));
      const bar = new THREE.BoxGeometry(span, GATE_RAIL, GATE_RAIL);
      bar.rotateY(-bearing + Math.PI / 2);
      bar.translate(hingeX + (lx * span) / 2, y, hingeZ + (lz * span) / 2);
      batch.add(bar, GATE_TIMBER);
      // A barred gate is chest high on a halfling and it is not a doorway
      // — only the two posts used to block, so 1.5 m of every gate in the
      // valley could be walked straight through
      if (b === 0) {
        for (const t of [0.3, 0.6, 0.9]) {
          this.blockers.push({ x: hingeX + lx * span * t, z: hingeZ + lz * span * t, radius: 0.1 });
        }
      }
    }

    // Head and heel: the two uprights that hold the bars together
    for (const t of [0.02, 0.98]) {
      const ux = hingeX + lx * span * t;
      const uz = hingeZ + lz * span * t;
      const stile = new THREE.BoxGeometry(GATE_RAIL, GATE_HEIGHT, GATE_RAIL);
      stile.rotateY(-bearing);
      stile.translate(ux, base + GATE_HEIGHT / 2, uz);
      batch.add(stile, GATE_TIMBER);
    }

    // The diagonal brace. A five-bar gate without it sags, and the eye
    // knows that even when it cannot say why
    const brace = new THREE.BoxGeometry(
      Math.hypot(span, GATE_HEIGHT * 0.82),
      GATE_RAIL,
      GATE_RAIL,
    );
    brace.rotateZ(Math.atan2(GATE_HEIGHT * 0.82, span));
    brace.rotateY(-bearing + Math.PI / 2);
    brace.translate(
      hingeX + (lx * span) / 2,
      base + GATE_HEIGHT * 0.59,
      hingeZ + (lz * span) / 2,
    );
    batch.add(brace, GATE_TIMBER);
  }
}

interface Placed {
  x: number;
  z: number;
  /** Unit vector along the hedge at this point. */
  dx: number;
  dz: number;
}

/** Walks a run to the given distance along it. */
function pointAlong(run: HedgeRun, distance: number): Placed | null {
  let travelled = 0;
  for (let i = 1; i < run.points.length; i++) {
    const a = run.points[i - 1];
    const b = run.points[i];
    if (a === undefined || b === undefined) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 1e-4) continue;
    if (travelled + length >= distance) {
      const t = (distance - travelled) / length;
      return { x: a[0] + dx * t, z: a[1] + dz * t, dx: dx / length, dz: dz / length };
    }
    travelled += length;
  }
  return null;
}
