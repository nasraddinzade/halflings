import * as THREE from 'three';

import {
  POND_DEPTH,
  BANK_WIDTH,
  GROUND_DIRT_SLOPE,
  GROUND_PATCH_FREQUENCY,
  GROUND_ROCK_SLOPE,
  RIVER_DEPTH,
} from '../config/constants';
import { PALETTE } from '../config/palette';
import { WORK_POINTS, propPosition } from '../config/work';
import { LANES, LANE_BLEND, LANE_HALF_WIDTH, doorSpurs } from '../config/lanes';
import { hashSeed, makeRandom } from '../core/random';
import { heightAt, pondCarve, riverCarve } from './heightfield';

/**
 * Ground colour, per terrain vertex.
 *
 * Before this the whole valley was a single flat shade of green, and that
 * gave away the cheapness harder than any missing model did: real ground
 * is never uniform. Here it darkens on the slopes, goes bare by the
 * water, greys out on the rim, and wears down where people walk.
 *
 * The colour goes into a vertex attribute, so it costs not a single extra
 * draw call and not a single byte of texture. Computed once at startup.
 */

/** One worn stretch of ground, with the width of the way that wore it. */
interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  halfWidth: number;
}

/**
 * Flattens the lane network into segments once, carrying each way's own
 * width along with it.
 *
 * The routes themselves are data in config/lanes.ts, so moving a lane is
 * one edit in one file — the same discipline work.ts already has.
 */
function buildPaths(): Segment[] {
  const segments: Segment[] = [];

  for (const lane of [...LANES, ...doorSpurs()]) {
    const halfWidth = LANE_HALF_WIDTH[lane.kind];
    for (let i = 1; i < lane.points.length; i++) {
      const a = lane.points[i - 1];
      const b = lane.points[i];
      if (a === undefined || b === undefined) continue;
      segments.push({ ax: a[0], az: a[1], bx: b[0], bz: b[1], halfWidth });
    }
  }

  // One short path to the middle of each cluster of work sites: one to the
  // vegetable patches, not five, or a star fans out again
  const byRole = new Map<string, { x: number; z: number; count: number }>();
  for (const point of WORK_POINTS) {
    const spot = propPosition(point);
    const acc = byRole.get(point.role) ?? { x: 0, z: 0, count: 0 };
    acc.x += spot.x;
    acc.z += spot.z;
    acc.count++;
    byRole.set(point.role, acc);
  }
  for (const acc of byRole.values()) {
    const cx = acc.x / acc.count;
    const cz = acc.z / acc.count;
    // Joined to the nearest point on the network, not to the spawn point:
    // work sites belong to the lanes that pass them, not to the middle
    const near = nearestOnNetwork(cx, cz, segments);
    segments.push({ ax: near.x, az: near.z, bx: cx, bz: cz, halfWidth: LANE_HALF_WIDTH.croft });
  }

  return segments;
}

/** Closest point anywhere on the network so far. */
function nearestOnNetwork(x: number, z: number, segments: readonly Segment[]): { x: number; z: number } {
  let best = Infinity;
  let point = { x, z };
  for (const segment of segments) {
    const dx = segment.bx - segment.ax;
    const dz = segment.bz - segment.az;
    const length = dx * dx + dz * dz;
    const t = length === 0 ? 0
      : Math.max(0, Math.min(1, ((x - segment.ax) * dx + (z - segment.az) * dz) / length));
    const px = segment.ax + dx * t;
    const pz = segment.az + dz * t;
    const d = Math.hypot(x - px, z - pz);
    if (d < best) {
      best = d;
      point = { x: px, z: pz };
    }
  }
  return point;
}

/** Distance from a point to a segment in the plane. */
function distanceToSegment(x: number, z: number, s: Segment): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-8) return Math.hypot(x - s.ax, z - s.az);

  let t = ((x - s.ax) * dx + (z - s.az) * dz) / lengthSquared;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - (s.ax + dx * t), z - (s.az + dz * t));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Surface slope at a point, by finite difference. */
function slopeAt(x: number, z: number): number {
  const h = heightAt(x, z);
  const step = 0.5;
  return Math.atan(Math.hypot(heightAt(x + step, z) - h, heightAt(x, z + step) - h) / step);
}

/**
 * Fills in the `color` attribute for the terrain geometry.
 * The geometry must already be displaced by height.
 */
export function paintGround(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position');
  const paths = buildPaths();
  const random = makeRandom(hashSeed('ground'));
  // Patch pattern offset: without it the patches would latch onto the
  // terrain grid
  const patchOffset = random() * 1000;

  const grass = new THREE.Color(PALETTE.grass);
  const dry = new THREE.Color(PALETTE.grassDry);
  const earth = new THREE.Color(PALETTE.earth);
  const rock = new THREE.Color(PALETTE.rock);
  const current = new THREE.Color();

  const data = new Float32Array(position.count * 3);

  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i);
    const z = position.getZ(i);

    // Large patches of dry grass: two sine waves instead of noise —
    // cheap, and no visible repeat at this scale
    const patch = 0.5 + 0.5 * Math.sin(
      (x + patchOffset) * GROUND_PATCH_FREQUENCY,
    ) * Math.cos((z - patchOffset) * GROUND_PATCH_FREQUENCY * 1.3);
    current.copy(grass).lerp(dry, patch * 0.45);

    // Slopes: the steeper it gets, the more soil shows through the turf,
    // and at the very steepest — the rock of the rim
    const slope = slopeAt(x, z);
    current.lerp(earth, smoothstep(GROUND_DIRT_SLOPE, GROUND_ROCK_SLOPE, slope) * 0.85);
    current.lerp(rock, smoothstep(GROUND_ROCK_SLOPE, GROUND_ROCK_SLOPE + 0.25, slope) * 0.7);

    // Bank: grass doesn't grow at the water's edge. Keyed off how close
    // the cut is to full depth, not off a distance — RIVER_DEPTH used to
    // be written out here as a bare 0.75, which meant changing the river
    // silently changed the paint
    const carve = riverCarve(x, z);
    if (carve > 0.01) {
      current.lerp(earth, 1 - smoothstep(0, BANK_WIDTH, Math.abs(carve - RIVER_DEPTH)));
    }

    // The pond's margin is poached mud, for the same reason and by the
    // same rule: strongest where the dish is deepest, fading out at the
    // top of the bank. Without it the bed keeps its lawn under the water
    const dish = pondCarve(x, z);
    if (dish > 0.01) current.lerp(earth, smoothstep(0, POND_DEPTH * 0.5, dish));

    // Ways. Each carries its own width, and we take the strongest wear
    // rather than adding them up: where routes meet they must not compound
    // into a blotch. A cart lane wears a band nearly three times what a
    // footpath does, and that difference is most of what says which way
    // you are standing on.
    let wear = 0;
    for (const segment of paths) {
      const d = distanceToSegment(x, z, segment);
      const edge = segment.halfWidth + segment.halfWidth * LANE_BLEND;
      if (d >= edge) continue;
      const w = 1 - smoothstep(segment.halfWidth, edge, d);
      if (w > wear) wear = w;
    }
    current.lerp(earth, wear * 0.8);

    data[i * 3] = current.r;
    data[i * 3 + 1] = current.g;
    data[i * 3 + 2] = current.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
}
