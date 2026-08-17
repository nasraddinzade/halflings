// Deterministic height field for the valley: the same point always gives
// the same height, with no Math.random and no external dependencies.
//
// The shape is a bowl: a calm middle for the village, hills around it, a
// steep rim at the edge. The rim is the world border (decision #4:
// diegetic borders).

import {
  CENTER_CALM_INNER,
  CENTER_CALM_OUTER,
  DETAIL_FREQUENCY,
  DETAIL_HEIGHT,
  HILL_FREQUENCY,
  HILL_HEIGHT,
  RIM_CURVE,
  RIM_HEIGHT,
  RIM_START,
  RIVER_AMPLITUDE,
  RIVER_DEPTH,
  RIVER_ENABLED,
  RIVER_FADE_END,
  RIVER_FADE_START,
  RIVER_OFFSET_Z,
  RIVER_WATER_DEPTH,
  RIVER_WAVINESS,
  RIVER_WIDTH,
  TERRAIN_SEED,
  VALLEY_RADIUS,
} from '../config/constants';
import { BURROWS, PAD_BIAS } from '../config/burrows';
import { faceOf, padWeight, type BurrowFace } from './burrow/profile';

function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/** Smooth step: 0 before edge0, 1 after edge1, eased transition between. */
function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Integer lattice hash -> [0, 1). Math.imul keeps the maths in 32 bits. */
function hash(ix: number, iz: number): number {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(TERRAIN_SEED, 1013904223);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Value noise in the range [-1, 1]: bilinear blend of lattice hashes. */
function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const sx = smoothstep(0, 1, x - ix);
  const sz = smoothstep(0, 1, z - iz);
  const top = lerp(hash(ix, iz), hash(ix + 1, iz), sx);
  const bottom = lerp(hash(ix, iz + 1), hash(ix + 1, iz + 1), sx);
  return lerp(top, bottom, sz) * 2 - 1;
}

/** Sum of octaves: the coarse shape plus ever finer detail. */
function fbm(x: number, z: number, octaves: number): number {
  let sum = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * frequency, z * frequency) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return sum / total;
}

/** Channel axis: where the middle of the river runs at a given x. */
export function riverCenterZ(x: number): number {
  return RIVER_OFFSET_Z + RIVER_AMPLITUDE * Math.sin(x * RIVER_WAVINESS);
}

/**
 * How deeply the channel is cut in at this point. Zero means the river
 * doesn't reach here.
 *
 * Towards the valley rim the cut fades to nothing: cut the rim through
 * and a gap appears in the closed ring, and the player walks out of the
 * valley along the channel. The ring has been checked numerically
 * (docs/ASSETS.md isn't about this, but the closedness test runs over
 * 3600 directions) — it must not be broken.
 */
export function riverCarve(x: number, z: number): number {
  if (!RIVER_ENABLED) return 0;

  const across = Math.abs(z - riverCenterZ(x));
  // Soft banks: a slope at the edge, a flat bottom towards the middle
  const profile = 1 - smoothstep(RIVER_WIDTH * 0.55, RIVER_WIDTH * 1.5, across);
  if (profile <= 0) return 0;

  const distance = Math.hypot(x, z) / VALLEY_RADIUS;
  const taper = 1 - smoothstep(RIVER_FADE_START, RIVER_FADE_END, distance);

  return RIVER_DEPTH * profile * taper;
}

/**
 * Burrow cuts are computed once: faceOf depends only on the burrow data
 * and on the valley terrain without the burrows, so there is no recursion
 * here.
 */
const FACES: ReadonlyArray<BurrowFace> = BURROWS.map((burrow) => faceOf(burrow, valleyFloor));

/**
 * The ground under the burrows is flattened into a pad.
 *
 * The hill itself is no longer raised by the terrain: it became a
 * separate mesh together with the facade (burrow/mesh.ts). All the
 * terrain has left to do is give it a level base — otherwise the valley's
 * waves creep in front of the door and drown its lower edge.
 *
 * With fifteen dwellings the pads overlap: fifteen of the hundred and
 * five pairs reach into each other, and their levels differ by up to
 * 0.92 m. Taking the strongest pad and ignoring the rest put a cliff on
 * every seam — 127 points inside the village stood steeper than 40
 * degrees, one of them at 69 — and it left burrow-2's rim floating 0.92 m
 * off its own base. Blending fixes both, but a flat average does not:
 * a pad is flat at weight 1 over a disc wider than its own mound, so
 * neighbours tie and no mound owns the ground beneath it. Weighting by
 * closeness as well leaves nothing steeper than 31 degrees and every rim
 * within 6 cm of where its mound expects it.
 */
function burrowGround(x: number, z: number, floor: number): number {
  let strongest = 0;
  let sum = 0;
  let total = 0;

  for (let i = 0; i < BURROWS.length; i++) {
    const burrow = BURROWS[i];
    const face = FACES[i];
    if (burrow === undefined || face === undefined) continue;

    const w = padWeight(burrow, x, z);
    if (w <= 0) continue;
    if (w > strongest) strongest = w;

    // Weighted by closeness, not by the pad weight alone. A pad is flat
    // at 1 over a disc wider than its own mound, so where two of them
    // overlap the weights tie and neither owns the ground. Dividing by
    // distance breaks the tie in favour of whichever mound is actually
    // standing there.
    const reach = Math.max(0, Math.hypot(x - burrow.x, z - burrow.z) - burrow.radius);
    const closeness = w / (PAD_BIAS + reach * reach);
    sum += closeness * face.base;
    total += closeness;
  }

  if (total <= 0) return floor;
  return lerp(floor, sum / total, strongest);
}

/** Valley terrain without the burrows and without the channel. */
export function valleyFloor(x: number, z: number): number {
  // 0 at the valley centre, 1 at the edge
  const distance = Math.hypot(x, z) / VALLEY_RADIUS;

  // Rim: an exponent >1 makes the top steeper than the foot, so the band
  // above MAX_SLOPE comes out wide enough to stop the player reliably
  const rim = smoothstep(RIM_START, 1.05, distance) ** RIM_CURVE * RIM_HEIGHT;

  // Closer to the centre the hills are damped — flat ground for the village
  const calm = 1 - smoothstep(CENTER_CALM_INNER, CENTER_CALM_OUTER, distance);
  const hills = fbm(x * HILL_FREQUENCY, z * HILL_FREQUENCY, 4) * HILL_HEIGHT * (1 - calm * 0.8);

  const detail = fbm(x * DETAIL_FREQUENCY, z * DETAIL_FREQUENCY, 3) * DETAIL_HEIGHT;

  return rim + hills + detail;
}

/** Ground height without the channel — the water stands on it. */
export function groundHeight(x: number, z: number): number {
  return burrowGround(x, z, valleyFloor(x, z));
}

/** Ground height at world point (x, z), with the channel cut in. */
export function heightAt(x: number, z: number): number {
  return groundHeight(x, z) - riverCarve(x, z);
}

/**
 * How deep the water is over a pair of feet at height `feetY`. Zero
 * anywhere the river does not reach, and anywhere the feet are above the
 * surface — jumping out of the channel counts as out.
 *
 * The water surface is groundHeight - RIVER_WATER_DEPTH, which is exactly
 * how River.ts builds its ribbon; both read this so the two cannot drift.
 * The deepest it gets is RIVER_DEPTH - RIVER_WATER_DEPTH, 0.45 m, which
 * on a 1.1 m halfling is a little over the knee.
 */
export function waterDepthAt(x: number, z: number, feetY: number): number {
  const carve = riverCarve(x, z);
  if (carve <= RIVER_WATER_DEPTH) return 0;
  return Math.max(0, groundHeight(x, z) - RIVER_WATER_DEPTH - feetY);
}
