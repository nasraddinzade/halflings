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
  FORD_BAR_LIFT,
  FORD_BAR_REACH,
  FORD_X,
  FORD_Z,
  RIVER_FADE_START,
  RIVER_OFFSET_Z,
  POND_BANK,
  POND_DEPTH,
  POND_RADIUS,
  POND_WATER_DEPTH,
  POND_WOBBLE,
  HAUGH_FLAT,
  HAUGH_SLOPE,
  SCARP_WOBBLE,
  WHEEL_PIT_BANK,
  WHEEL_PIT_DEPTH,
  WHEEL_PIT_RADIUS,
  WHEEL_X,
  WHEEL_Z,
  RIVER_WATER_DEPTH,
  RIVER_WAVINESS,
  RIVER_WIDTH,
  TERRAIN_SEED,
  VALLEY_RADIUS,
} from '../config/constants';
import { BURROWS, PAD_BIAS, PAD_FADE, PAD_MARGIN } from '../config/burrows';
import { BUILDING_PADS } from '../config/buildings';
import { POND, pondEdge } from '../config/green';
import { SCARPS } from '../config/scarps';
import { faceOf, padWeight, type BurrowFace, type Pad } from './burrow/profile';

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

/** The scarps, with their trigonometry and their bounds worked out once. */
const SCARP_TERMS = SCARPS.map((s) => {
  const a = (s.deg * Math.PI) / 180;
  const outer = s.toe + s.wobble;
  return {
    ...s,
    ax: Math.sin(a),
    az: Math.cos(a),
    outerSq: outer * outer,
    inner: s.toe - s.width,
  };
});

// Declared here and not beside scarpAt: FACES is a module-level const that
// calls valleyFloor while the module is still initialising, and a `const`
// read before its own line throws. The function hoists; the table does not.

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

  return RIVER_DEPTH * profile * taper * (1 - fordBar(x, z));
}

/**
 * The bar of gravel at the ford, as a share of the channel's depth.
 *
 * A ford is not a place somebody laid stones in a river. It is the place
 * the river is SHALLOW, and the stones are laid because it is shallow.
 * Without the bar the crossing was cut to the same depth as the rest of
 * the channel, its paving lay 0.435 m under the surface where nothing
 * could see it, and the only thing marking the ford was four posts — two
 * of which stood in open water.
 *
 * Written as a lift of the bed rather than a separate carve, so that
 * everything already keyed to riverCarve — the water depth, the wading,
 * the ground paint, the fields, the vegetation — follows it for free.
 */
function fordBar(x: number, z: number): number {
  const dx = x - FORD_X;
  const dz = z - FORD_Z;
  const d2 = dx * dx + dz * dz;
  if (d2 >= FORD_BAR_REACH * FORD_BAR_REACH) return 0;
  const t = Math.sqrt(d2) / FORD_BAR_REACH;
  return FORD_BAR_LIFT * (1 - t * t * (3 - 2 * t));
}

/**
 * Burrow cuts are computed once: faceOf depends only on the burrow data
 * and on the valley terrain without the burrows, so there is no recursion
 * here.
 */
const FACES: ReadonlyArray<BurrowFace> = BURROWS.map((burrow) => faceOf(burrow, valleyFloor));

/** A patch of ground held level, with the height it is held at. */
type LevelPad = Pad & { base: number };

/**
 * Every level platform in the valley: fifteen dwellings, and the
 * buildings.
 *
 * A building needs its base level for the same reason a burrow does, and
 * it needs it through the SAME term. The alternative is a second function
 * with its own early-out inside heightAt, which runs some 593,000 times
 * before the first frame — the pond dish cost 12 ms of startup that way.
 * One more entry in a loop that already runs fifteen times costs a hypot.
 *
 * A building pad carries no mound, so its radius is not a mound radius:
 * padWeight holds the ground flat out to radius + PAD_MARGIN, and the
 * radius here is chosen so that disc covers the footprint's own diagonal
 * and no more.
 */
const PADS: ReadonlyArray<LevelPad> = [
  ...BURROWS.map((burrow, i) => {
    const face = FACES[i];
    const outer = burrow.radius + PAD_MARGIN + PAD_FADE;
    return {
      x: burrow.x,
      z: burrow.z,
      radius: burrow.radius,
      // The threshold and the way it looks: a dwelling's forecourt lies in
      // front of its door, not all round the hill it is cut into
      fx: face?.x ?? burrow.x,
      fz: face?.z ?? burrow.z,
      sx: Math.sin(face?.yaw ?? 0),
      sz: Math.cos(face?.yaw ?? 0),
      outerSq: outer * outer,
      base: face?.base ?? 0,
    };
  }),
  ...BUILDING_PADS.map((pad) => {
    const outer = pad.radius + PAD_MARGIN + PAD_FADE;
    // A building has no face to speak of, so its pad stays a disc
    return {
      x: pad.x,
      z: pad.z,
      radius: pad.radius,
      fx: pad.x,
      fz: pad.z,
      sx: 0,
      sz: 0,
      outerSq: outer * outer,
      base: valleyFloor(pad.x, pad.z),
    };
  }),
];

/**
 * The ground under the burrows and the buildings is flattened into a pad.
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

  for (let i = 0; i < PADS.length; i++) {
    const pad = PADS[i];
    if (pad === undefined) continue;

    const w = padWeight(pad, x, z);
    if (w <= 0) continue;
    if (w > strongest) strongest = w;

    // Weighted by closeness, not by the pad weight alone. A pad is flat
    // at 1 over a disc wider than its own mound, so where two of them
    // overlap the weights tie and neither owns the ground. Dividing by
    // distance breaks the tie in favour of whichever mound is actually
    // standing there.
    const reach = Math.max(0, Math.hypot(x - pad.x, z - pad.z) - pad.radius);
    const closeness = w / (PAD_BIAS + reach * reach);
    sum += closeness * pad.base;
    total += closeness;
  }

  if (total <= 0) return floor;
  return lerp(floor, sum / total, strongest);
}


/**
 * Raised ground may not stand higher than a ramp rising from HAUGH_FLAT
 * metres off the channel axis.
 *
 * A gate, not a min and not a smooth-min. A hard min is one scarp-tuning
 * away from creasing, and a smooth-min with an early-out creases at its
 * own toe. This is smooth everywhere, exactly zero over the water, exactly
 * h once there is room, and it can only ever REMOVE height — so no future
 * edit to the scarps can put a cliff over the channel, whoever makes it.
 */
function waterGuard(height: number, acrossFromAxis: number): number {
  if (height <= 0) return 0;
  const need = HAUGH_FLAT + height / HAUGH_SLOPE;
  if (acrossFromAxis >= need) return height;
  return height * smoothstep(HAUGH_FLAT, need, acrossFromAxis);
}

/** How high the scarps stand at this point. */
function scarpAt(x: number, z: number, channelZ: number): number {
  let free = 0;
  let guarded = 0;

  for (let i = 0; i < SCARP_TERMS.length; i++) {
    const s = SCARP_TERMS[i];
    if (s === undefined) continue;

    const dx = x - s.x;
    const dz = z - s.z;
    // Distance to the crest SEGMENT, so the two ends are round caps and
    // each bank dies for a reason instead of stopping at a drawn line
    let along = dx * s.ax + dz * s.az;
    if (along > s.half) along = s.half;
    else if (along < -s.half) along = -s.half;

    const ex = dx - along * s.ax;
    const ez = dz - along * s.az;
    const acrossSq = ex * ex + ez * ez;
    if (acrossSq >= s.outerSq) continue;

    // One sine along the crest shifts that distance, so the fall line is
    // not a constant bearing: the doors splay without a hand-written angle
    const across = Math.sqrt(acrossSq) - s.wobble * Math.sin(along * s.wave + s.phase);
    if (across >= s.toe) continue;

    const height = across <= s.inner
      ? s.rise
      : s.rise * (1 - smoothstep(s.inner, s.toe, across));
    if (s.free) free += height;
    else guarded += height;
  }

  if (guarded > 0) free += waterGuard(guarded, Math.abs(z - channelZ));
  return free;
}

/** Valley terrain without the burrows and without the channel. */
export function valleyFloor(x: number, z: number, channelZ = riverCenterZ(x)): number {
  // 0 at the valley centre, 1 at the edge
  const distance = Math.hypot(x, z) / VALLEY_RADIUS;

  // Rim: an exponent >1 makes the top steeper than the foot, so the band
  // above MAX_SLOPE comes out wide enough to stop the player reliably
  const rim = smoothstep(RIM_START, 1.05, distance) ** RIM_CURVE * RIM_HEIGHT;

  // Closer to the centre the hills are damped — flat ground for the village
  const calm = 1 - smoothstep(CENTER_CALM_INNER, CENTER_CALM_OUTER, distance);
  const hills = fbm(x * HILL_FREQUENCY, z * HILL_FREQUENCY, 4) * HILL_HEIGHT * (1 - calm * 0.8);

  const detail = fbm(x * DETAIL_FREQUENCY, z * DETAIL_FREQUENCY, 3);
  // The detail noise the terrain already computes, spent twice: once as
  // height and once to crinkle the scarp edges, so a bank's front is never
  // a drawn curve and costs no second octave
  const wobble = detail * SCARP_WOBBLE;

  return rim + scarpAt(x + wobble, z - wobble, channelZ) + hills + detail * DETAIL_HEIGHT;
}

/** Ground height without the channel — the water stands on it. */
export function groundHeight(x: number, z: number): number {
  return burrowGround(x, z, valleyFloor(x, z));
}

/**
 * The pond dish on the green.
 *
 * Squared distance, and the outer radius squared once at module scope.
 * This function is asked the same question as riverCarve — "are we near
 * it at all?" — and the answer is no for 99.96 % of the calls, of which
 * there are around 593,000 before the first frame: heightAt runs once per
 * terrain vertex and three more times per vertex inside groundColor's
 * slope test. A Math.hypot in that early-out is not sqrt; it is a
 * variadic builtin with overflow guards, and measured it cost 29 ms of
 * startup against 3 ms for the comparison below.
 *
 * Inside, the floor is flat and the bank is a ramp POND_BANK wide. A dish
 * that curved to the middle instead held nine square metres of water
 * where this holds sixteen.
 */
const POND_REACH_SQ = (POND_RADIUS * (1 + POND_WOBBLE)) ** 2;

export function pondCarve(x: number, z: number): number {
  const dx = x - POND.x;
  const dz = z - POND.z;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq >= POND_REACH_SQ) return 0;

  const distance = Math.sqrt(distanceSq);
  const edge = pondEdge(Math.atan2(dz, dx));
  if (distance >= edge) return 0;

  return POND_DEPTH * smoothstep(0, 1, Math.min(1, (edge - distance) / POND_BANK));
}

/**
 * The wheel pit, dug under the mill wheel.
 *
 * Same shape and the same squared early-out as the pond dish, and folded
 * into the same call so heightAt gains one comparison rather than one
 * function. Deepening the bed does not move the water: the surface comes
 * from groundHeight, which no carve touches, so the pit simply holds
 * deeper water at the same level.
 */
const WHEEL_PIT_SQ = WHEEL_PIT_RADIUS * WHEEL_PIT_RADIUS;

export function pitCarve(x: number, z: number): number {
  const dx = x - WHEEL_X;
  const dz = z - WHEEL_Z;
  const distanceSq = dx * dx + dz * dz;
  if (distanceSq >= WHEEL_PIT_SQ) return 0;
  // Flat floor, ramped sides — the pond's shape, and for the pond's
  // reason. A bowl that eases from the middle outwards is shallowest
  // exactly where the wheel's rim stands, so a 0.40 m pit sank the wheel
  // by five centimetres. The floor has to be wider than the wheel.
  const reach = WHEEL_PIT_RADIUS - Math.sqrt(distanceSq);
  return WHEEL_PIT_DEPTH * smoothstep(0, 1, Math.min(1, reach / WHEEL_PIT_BANK));
}

/** Ground height at (x, z), with the channel, the pond and the pit cut in. */
export function heightAt(x: number, z: number): number {
  return groundHeight(x, z) - riverCarve(x, z) - pondCarve(x, z) - pitCarve(x, z);
}

/**
 * The pond's surface, which is level — unlike the river's, which follows
 * the ground because a channel may.
 *
 * Recovered from the ground rather than written down: the dish is at full
 * depth under its own centre, so the rim is groundHeight there. A number
 * in constants.ts would go stale the moment the terrain moved.
 */
let pondSurface: number | null = null;

export function pondWaterY(): number {
  // Worked out once. It reads the ground under the pond's own centre, and
  // waterDepthAt asks for it on every step of the player and of every
  // villager choosing where to stand
  if (pondSurface === null) pondSurface = groundHeight(POND.x, POND.z) - POND_WATER_DEPTH;
  return pondSurface;
}

/**
 * How deep the water is over a pair of feet at height `feetY`. Zero
 * anywhere there is no water, and anywhere the feet are above the surface
 * — jumping out of the channel counts as out.
 *
 * This is the one place that knows where water is, and everything else
 * reads it: the player wades through it (PlayerController), and a
 * villager picking somewhere to stand refuses any point where it is not
 * zero (VillagerBrain). Add water anywhere and it has to be added here,
 * or the surface is painted on: the pond went in with its geometry, its
 * dish and its ground paint, and for one commit the player walked across
 * it at full speed while villagers happily sat down in it.
 *
 * The two surfaces are different in kind. The channel's follows the
 * ground with a fixed offset, which is how Water.ts builds its ribbon.
 * The pond's is level, so the depth over it varies with the bed — up to
 * 0.41 m, against the channel's 0.45 m, both a little over the knee on a
 * 1.1 m halfling.
 */
export function waterDepthAt(x: number, z: number, feetY: number): number {
  let surface = -Infinity;

  const carve = riverCarve(x, z);
  if (carve > RIVER_WATER_DEPTH) surface = groundHeight(x, z) - RIVER_WATER_DEPTH;

  // Inside the shoreline the level plane may still be under the ground,
  // near the bank; the subtraction below is what decides, not this test
  if (pondCarve(x, z) > 0) surface = Math.max(surface, pondWaterY());

  if (surface === -Infinity) return 0;
  return Math.max(0, surface - feetY);
}

/**
 * How much the ground rises and falls across a footprint of this size.
 *
 * Anything wider than a step has to ask this before it is placed. A prop
 * set on the single sample under its middle is bedded correctly at one
 * point and wrong everywhere else — it floats on the downhill side if it
 * takes the sample as its base, and buries itself on the uphill side if
 * it takes the lowest. Both have shipped here more than once. The cure is
 * to bed it honestly AND to refuse ground too broken to stand on, and
 * this is the second half.
 */
export function reliefAt(x: number, z: number, radius: number): number {
  let low = Infinity;
  let high = -Infinity;
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2;
    const h = heightAt(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius);
    low = Math.min(low, h);
    high = Math.max(high, h);
  }
  return high - low;
}

/**
 * The lowest ground under a footprint of this size.
 *
 * The companion to reliefAt, and the other half of the same rule: a thing
 * wider than a step is bedded on the LOWEST ground it covers, never on the
 * sample under its middle. Sinking a centimetre or two into the turf is
 * invisible; a hoof, a hedge foot or a fence pale hanging in the air is
 * the first thing the eye finds, and this project has shipped that fault
 * four times.
 */
export function lowestAt(x: number, z: number, radius: number): number {
  let low = heightAt(x, z);
  for (let a = 0; a < 8; a++) {
    const angle = (a / 8) * Math.PI * 2;
    low = Math.min(low, heightAt(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius));
  }
  return low;
}
