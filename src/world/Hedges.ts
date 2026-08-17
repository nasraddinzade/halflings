import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { HEDGE_BEDDING, HEDGE_CREST, HEDGE_FOOT, HEDGE_ROUGHNESS, HEDGE_SHOULDER } from '../config/constants';
import { PALETTE, darken } from '../config/palette';
import { allHedges, type HedgeRun } from '../config/hedges';
import { applyStyle } from '../render/style';
import type { Circle } from './Obstacles';
import { heightAt } from './heightfield';

/**
 * Hedges, as extruded ribbon.
 *
 * Not a term in the height field. A hedge bank is about a metre across
 * and the terrain samples at 1.5 quads to the metre, so it cannot be
 * represented there; and putting five hundred segment tests inside
 * heightAt would be paid two hundred thousand times at startup. As
 * geometry it costs about seven thousand triangles, merged into one mesh
 * and carrying no outline — the same reasoning as the grass, which is
 * that a contour drawn on a metre-wide object does not read.
 *
 * Not instanced bushes either: the same length as instances would be
 * around twenty-six thousand triangles and would look like a row of
 * separate objects rather than a continuous boundary, which is precisely
 * what a boundary must not look like.
 *
 * The player is stopped by circles in the obstacle grid, not by slope.
 */
export class Hedges {
  readonly mesh: THREE.Mesh;
  /** Fed into the same grid that already bins the tree trunks. */
  readonly blockers: Circle[] = [];

  constructor() {
    const pieces: THREE.BufferGeometry[] = [];

    for (const run of allHedges()) {
      const geometry = ribbon(run, this.blockers);
      if (geometry !== null) pieces.push(geometry);
    }

    const merged = mergeGeometries(pieces, false);
    for (const piece of pieces) piece.dispose();
    if (merged === null) throw new Error('[hedges] could not merge the hedge geometry');
    merged.computeVertexNormals();
    merged.computeBoundingSphere();

    this.mesh = new THREE.Mesh(merged);
    this.mesh.name = 'hedges';
    applyStyle(this.mesh, {
      color: darken(PALETTE.grass, 0.78),
      outline: false,
      castShadow: true,
      receiveShadow: true,
    });
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}

/** Deterministic 1D wobble along a hedge, so no two metres are alike. */
function crestAt(distance: number): number {
  return HEDGE_CREST
    + Math.sin(distance * 2.09) * HEDGE_ROUGHNESS * 0.6
    + Math.sin(distance * 0.77 + 1.7) * HEDGE_ROUGHNESS * 0.4;
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

      const top = heightAt(x, z) + crestAt(along);
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
