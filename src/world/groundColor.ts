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
import { FIELD_FURROW_DEPTH, FIELD_FURROW_WAVELENGTH } from '../config/constants';
import { fieldAt, furrowPhase, type FieldUse } from '../config/fields';
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
  /** Where the wear fades out, and its square — both fixed per segment. */
  edge: number;
  edgeSquared: number;
}

/**
 * The lanes, bucketed into a coarse grid.
 *
 * Every terrain vertex has to know how worn its ground is, and there are
 * 148,225 of them against about ninety lane segments — thirteen million
 * distance tests, which measured at 0.89 s of blocking startup even after
 * the square roots came out of the inner loop. (Removing the square roots
 * was worth a quarter of it and no more: the cost was never the `hypot`,
 * it was the count. That is worth writing down, because the first guess
 * was the square roots and the first guess was wrong.)
 *
 * A segment can only wear ground within `edge` of itself, so bucketing by
 * that reach and asking one cell turns the thirteen million into about one.
 */
class LaneIndex {
  private readonly cells = new Map<number, Segment[]>();
  private readonly size: number;

  constructor(all: readonly Segment[]) {
    let widest = 1;
    for (const s of all) widest = Math.max(widest, s.edge);
    this.size = widest * 2;

    for (const s of all) {
      const x0 = Math.min(s.ax, s.bx) - s.edge;
      const x1 = Math.max(s.ax, s.bx) + s.edge;
      const z0 = Math.min(s.az, s.bz) - s.edge;
      const z1 = Math.max(s.az, s.bz) + s.edge;
      for (let i = Math.floor(x0 / this.size); i <= Math.floor(x1 / this.size); i++) {
        for (let j = Math.floor(z0 / this.size); j <= Math.floor(z1 / this.size); j++) {
          const key = LaneIndex.key(i, j);
          const bucket = this.cells.get(key);
          if (bucket === undefined) this.cells.set(key, [s]);
          else bucket.push(s);
        }
      }
    }
  }

  /** Every segment that could possibly wear the ground at this point. */
  near(x: number, z: number): readonly Segment[] {
    const bucket = this.cells.get(LaneIndex.key(
      Math.floor(x / this.size),
      Math.floor(z / this.size),
    ));
    return bucket ?? EMPTY;
  }

  private static key(i: number, j: number): number {
    return (i + 512) * 1024 + (j + 512);
  }
}

const EMPTY: readonly Segment[] = [];

/** One worn stretch, with its fade edge worked out once rather than per vertex. */
function segment(ax: number, az: number, bx: number, bz: number, halfWidth: number): Segment {
  const edge = halfWidth + halfWidth * LANE_BLEND;
  return { ax, az, bx, bz, halfWidth, edge, edgeSquared: edge * edge };
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
      segments.push(segment(a[0], a[1], b[0], b[1], halfWidth));
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
    segments.push(segment(near.x, near.z, cx, cz, LANE_HALF_WIDTH.croft));
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

/**
 * SQUARED distance from a point to a segment in the plane.
 *
 * Squared because of how often it is asked. The painter runs it for every
 * terrain vertex against every lane segment — 13.3 million times at
 * startup — and a Math.hypot per call was costing a second of blocking
 * load on its own. The comparison it feeds wants a threshold, and a
 * threshold can be squared once per segment instead.
 */
function distanceSquaredToSegment(x: number, z: number, s: Segment): number {
  const dx = s.bx - s.ax;
  const dz = s.bz - s.az;
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared < 1e-8) {
    const ax = x - s.ax;
    const az = z - s.az;
    return ax * ax + az * az;
  }

  let t = ((x - s.ax) * dx + (z - s.az) * dz) / lengthSquared;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = x - (s.ax + dx * t);
  const pz = z - (s.az + dz * t);
  return px * px + pz * pz;
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
  const index = new LaneIndex(buildPaths());
  const random = makeRandom(hashSeed('ground'));
  // Patch pattern offset: without it the patches would latch onto the
  // terrain grid
  const patchOffset = random() * 1000;

  const grass = new THREE.Color(PALETTE.grass);
  const dry = new THREE.Color(PALETTE.grassDry);
  const earth = new THREE.Color(PALETTE.earth);
  const rock = new THREE.Color(PALETTE.rock);
  const furrow = new THREE.Color(PALETTE.fieldFurrow);
  const crop: Record<FieldUse, THREE.Color> = {
    pasture: new THREE.Color(PALETTE.fieldPasture),
    arable: new THREE.Color(PALETTE.fieldArable),
    meadow: new THREE.Color(PALETTE.fieldMeadow),
  };
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

    // Inside a hedged parcel the turf gives way to whatever is grown in
    // it. This is the whole point of the field system: from map height a
    // patchwork of hedges over one shade of green reads as a net thrown
    // over a lawn, and it is the colour, not the boundary, that says
    // country. The parcel's own tint moves it a few percent either way so
    // that two pastures sharing a hedge are not the same green.
    const field = fieldAt(x, z);
    if (field !== null) {
      current.copy(crop[field.use]);
      const shade = 0.94 + field.tint * 0.12;
      current.multiplyScalar(shade);
      // Ridge and furrow: ploughland is ridged in lands a few metres
      // wide, and those stripes are the most recognisable thing about
      // arable from the air. Wavelength is kept well above the terrain's
      // own quad so the stripe is sampled, not aliased into noise.
      if (field.use === 'arable') {
        const u = furrowPhase(field.furlong, x, z);
        const ridge = 0.5 + 0.5 * Math.cos((u * Math.PI * 2) / FIELD_FURROW_WAVELENGTH);
        current.lerp(furrow, (1 - ridge) * FIELD_FURROW_DEPTH);
      }
    }

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
    for (const segment of index.near(x, z)) {
      const d2 = distanceSquaredToSegment(x, z, segment);
      if (d2 >= segment.edgeSquared) continue;
      const w = 1 - smoothstep(segment.halfWidth, segment.edge, Math.sqrt(d2));
      if (w > wear) wear = w;
    }
    current.lerp(earth, wear * 0.8);

    data[i * 3] = current.r;
    data[i * 3 + 1] = current.g;
    data[i * 3 + 2] = current.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
}
