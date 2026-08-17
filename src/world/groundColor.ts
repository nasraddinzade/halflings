import * as THREE from 'three';

import {
  BANK_WIDTH,
  GROUND_DIRT_SLOPE,
  GROUND_PATCH_FREQUENCY,
  GROUND_ROCK_SLOPE,
  PATH_BLEND,
  PATH_WIDTH,
  RIVER_DEPTH,
  SPAWN_X,
  SPAWN_Z,
} from '../config/constants';
import { PALETTE } from '../config/palette';
import { BURROWS } from '../config/burrows';
import { facePoint } from './burrow/profile';
import { WORK_POINTS, propPosition } from '../config/work';
import { hashSeed, makeRandom } from '../core/random';
import { heightAt, riverCarve } from './heightfield';

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

/** A path segment: from the square to a door or to a work site. */
interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

function buildPaths(): Segment[] {
  const segments: Segment[] = [];

  // From the square to every door
  for (const burrow of BURROWS) {
    const door = facePoint(burrow);
    segments.push({ ax: SPAWN_X, az: SPAWN_Z, bx: door.x, bz: door.z });
  }

  // And to the middle of each cluster of work sites: one path to the
  // vegetable patches, not five — otherwise a star would fan out from
  // the square
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
    segments.push({ ax: SPAWN_X, az: SPAWN_Z, bx: acc.x / acc.count, bz: acc.z / acc.count });
  }

  return segments;
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

    // Paths. We take the nearest segment: overlapping paths must not
    // add up into one blotch around the square
    let nearest = Infinity;
    for (const segment of paths) {
      const d = distanceToSegment(x, z, segment);
      if (d < nearest) nearest = d;
    }
    current.lerp(earth, (1 - smoothstep(PATH_WIDTH, PATH_WIDTH + PATH_BLEND, nearest)) * 0.8);

    data[i * 3] = current.r;
    data[i * 3 + 1] = current.g;
    data[i * 3 + 2] = current.b;
  }

  geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
}
