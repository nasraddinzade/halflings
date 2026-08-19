import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  HEDGE_BANK,
  HEDGE_BEDDING,
  HEDGE_CREST,
  HEDGE_FOOT,
  HEDGE_LUMP_RADIUS,
  HEDGE_LUMP_STEP,
  HEDGE_SEED,
  HEDGE_SHOULDER,
} from '../config/constants';
import { PALETTE, darken } from '../config/palette';
import { allHedges, type HedgeRun } from '../config/hedges';
import { applyStyle } from '../render/style';
import type { Circle } from './Obstacles';
import { heightAt } from './heightfield';
import { makeRandom } from '../core/random';

/**
 * Hedges: an earth bank with a crown of foliage standing on it.
 *
 * It was one smooth extruded prism, and it read as a strip of dark green
 * laid on the grass. That is what a smooth prism does under a three-step
 * toon shader: one lit face, one shaded face, and no silhouette. A hedge
 * is legible almost entirely by its silhouette — a line of overlapping
 * masses with a broken top — so the shape has to be in the geometry.
 *
 * The bank is still a ribbon, because a bank IS a smooth prism, and it is
 * now low: HEDGE_BANK rather than the whole height. The rest is lumps.
 *
 * Not in the height field. A hedge bank is about a metre across and the
 * terrain samples at 1.5 quads to the metre, so it cannot be represented
 * there, and five hundred segment tests inside heightAt would be paid
 * hundreds of thousands of times at startup.
 *
 * No outline on either piece, for the same reason the grass has none: a
 * contour drawn on a half-metre lump does not read, and it would double
 * the draw calls.
 *
 * The player is stopped by circles in the obstacle grid, not by slope.
 */
export class Hedges {
  readonly group = new THREE.Group();
  /** The earth bank the hedge grows out of. */
  readonly mesh: THREE.Mesh;
  /** Fed into the same grid that already bins the tree trunks. */
  readonly blockers: Circle[] = [];

  constructor() {
    const banks: THREE.BufferGeometry[] = [];
    const leaves: THREE.BufferGeometry[] = [];
    const random = makeRandom(HEDGE_SEED);

    for (const run of allHedges()) {
      const geometry = ribbon(run, this.blockers);
      if (geometry !== null) banks.push(geometry);
      crown(run, leaves, random);
    }

    const merged = mergeGeometries(banks, false);
    for (const piece of banks) piece.dispose();
    if (merged === null) throw new Error('[hedges] could not merge the hedge bank');
    merged.computeVertexNormals();
    merged.computeBoundingSphere();

    this.group.name = 'hedges';
    this.mesh = new THREE.Mesh(merged);
    this.mesh.name = 'hedge_bank';
    this.group.add(this.mesh);
    applyStyle(this.mesh, {
      // The bank is earth under grass, not foliage: darker and browner
      // than the crown, or the two read as one slab again
      color: darken(PALETTE.grass, 0.62),
      outline: false,
      // No shadow. The bank is one merged mesh spanning the whole valley,
      // so casting from it submits all 31,780 of its triangles to the
      // shadow map every frame wherever the player stands — and its own
      // shadow falls inside its 0.5 m half-width, under the crown's
      // shadow, where nothing can see it
      castShadow: false,
      receiveShadow: true,
    });

    const foliage = mergeGeometries(leaves, false);
    for (const piece of leaves) piece.dispose();
    if (foliage === null) throw new Error('[hedges] could not merge the hedge crown');
    foliage.computeVertexNormals();
    foliage.computeBoundingSphere();
    const crownMesh = new THREE.Mesh(foliage);
    crownMesh.name = 'hedge_crown';
    this.group.add(crownMesh);
    applyStyle(crownMesh, {
      color: darken(PALETTE.grass, 0.86),
      outline: false,
      castShadow: true,
      receiveShadow: true,
    });
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
  }
}

/**
 * Walks the polyline at half-metre steps and lofts a section along it.
 *
 * The section is a bank, not a wall: it flares to a wide foot so it beds
 * into ground that is never flat, which is also what stops a seam showing
 * where it crosses a slope.
 */
function ribbon(run: HedgeRun, blockers: Circle[]): THREE.BufferGeometry | null {
  const half = HEDGE_FOOT / 2;
  // Across, and how much of the crest height this point stands at.
  const profile: Array<readonly [number, number]> = [
    [-half, 0],
    [-half * 0.68, HEDGE_SHOULDER],
    [-half * 0.32, 1],
    [half * 0.32, 1],
    [half * 0.68, HEDGE_SHOULDER],
    [half, 0],
  ];
  const WIDTH = profile.length;

  const positions: number[] = [];
  const indices: number[] = [];
  // Rings pushed so far, and the one to stitch this ring to. A gate
  // breaks the line, and after a break there is nothing to stitch to —
  // which is why the two are counted separately.
  let pushed = 0;
  let previous = -1;
  let travelled = 0;
  let sinceBlocker = Infinity;

  for (let i = 1; i < run.points.length; i++) {
    const a = run.points[i - 1];
    const b = run.points[i];
    if (a === undefined || b === undefined) continue;

    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 1e-4) continue;
    const nx = -dz / length;
    const nz = dx / length;
    const steps = Math.max(1, Math.round(length / 0.5));

    // The first ring of a later segment would sit on top of the last ring
    // of the one before it
    for (let s = i === 1 ? 0 : 1; s <= steps; s++) {
      const t = s / steps;
      const x = a[0] + dx * t;
      const z = a[1] + dz * t;
      const along = travelled + length * t;

      if (isGate(run, along)) { previous = -1; continue; }

      const top = heightAt(x, z) + HEDGE_BANK;
      for (const [across, share] of profile) {
        const px = x + nx * across;
        const pz = z + nz * across;
        // Each point of the section is bedded into the ground under
        // ITSELF, not under the centre line. The foot stands half a metre
        // out to the side, and on a slope that is enough to leave
        // daylight beneath the hedge — 7% of the feet floated by up to
        // 20 cm before this. The crest still comes off the centre, so the
        // top of the bank stays level across its own width.
        const ground = heightAt(px, pz) - HEDGE_BEDDING;
        positions.push(px, ground + (top - ground) * share, pz);
      }
      const current = pushed;
      pushed++;

      if (previous >= 0) {
        const p = previous * WIDTH;
        const c = current * WIDTH;
        for (let k = 0; k + 1 < WIDTH; k++) {
          indices.push(p + k, c + k, p + k + 1);
          indices.push(p + k + 1, c + k, c + k + 1);
        }
      }
      previous = current;

      sinceBlocker += length / steps;
      if (sinceBlocker >= 0.7) {
        blockers.push({ x, z, radius: half });
        sinceBlocker = 0;
      }
    }
    travelled += length;
  }

  if (positions.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  return geometry;
}

function isGate(run: HedgeRun, along: number): boolean {
  if (run.gates === undefined) return false;
  for (const gate of run.gates) {
    if (along >= gate[0] && along <= gate[1]) return true;
  }
  return false;
}


/**
 * The foliage: a line of overlapping lumps along the run, standing on the
 * bank.
 *
 * Each is squashed across the line and stretched along it, so a lump reads
 * as part of a hedge rather than as a bush that happens to be in a row —
 * and each gets its own height, lean and lateral nudge, because a hedge
 * whose top is a smooth curve is the slab this replaces.
 *
 * Deliberately NOT instanced. An InstancedMesh would need its own draw
 * call and its own cull sphere spanning the whole village; merged into one
 * static mesh the crown costs nothing the bank was not already costing.
 */
function crown(run: HedgeRun, out: THREE.BufferGeometry[], random: () => number): void {
  let travelled = 0;

  for (let i = 1; i < run.points.length; i++) {
    const a = run.points[i - 1];
    const b = run.points[i];
    if (a === undefined || b === undefined) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 1e-4) continue;
    const nx = -dz / length;
    const nz = dx / length;
    const steps = Math.max(1, Math.round(length / HEDGE_LUMP_STEP));

    for (let s = i === 1 ? 0 : 1; s <= steps; s++) {
      const t = s / steps;
      const along = travelled + length * t;
      if (isGate(run, along)) continue;

      // Sideways nudge and its own size, so no two are alike and the line
      // wanders the way a grown hedge does
      const side = (random() - 0.5) * HEDGE_FOOT * 0.42;
      const x = a[0] + dx * t + nx * side;
      const z = a[1] + dz * t + nz * side;
      const radius = HEDGE_LUMP_RADIUS * (0.78 + random() * 0.5);
      const squash = 0.85 + random() * 0.3;
      // The TOP is chosen first and the centre is worked back from it.
      // Choosing the centre and letting the radius add on top put 132 of
      // 265 lumps above a halfling's 1.32 m eye — every lane a green
      // corridor, which is the thing HEDGE_CREST exists to prevent
      const top = HEDGE_CREST * (0.72 + random() * 0.28);
      const centre = Math.max(HEDGE_BANK * 0.6, top - radius * squash);

      const lump = new THREE.IcosahedronGeometry(radius, 0);
      // Narrow across the line, longer along it: the mass of a hedge runs
      // with the boundary, not across it
      lump.scale(1, squash, 1.35);
      lump.rotateY(Math.atan2(dx, dz) + (random() - 0.5) * 0.5);
      lump.translate(x, heightAt(x, z) + centre, z);
      out.push(lump.toNonIndexed());
    }
    travelled += length;
  }
}
