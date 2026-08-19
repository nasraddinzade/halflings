import {
  FIELD_ACROSS,
  FIELD_ALONG,
  FIELD_EDGE,
  FIELD_JITTER,
  FIELD_MIN_AREA,
  FIELD_RIVER_MARGIN,
  FIELD_SEED,
} from './constants';
import { CLEARINGS } from './scarps';
import { hashSeed, makeRandom } from '../core/random';
import { pondCarve, riverCenterZ } from '../world/heightfield';

/**
 * The fields, and why a village needs them more than it needs props.
 *
 * Seen from above, this valley was a disc of identical trees with a smear
 * of village in the middle: about nine tenths of the surface was wood at
 * one spacing, which reads as a texture rather than as country. The thing
 * that makes English landscape English is not the cottages — it is the
 * fields, hedged, in different colours, with the wood pushed to the edges.
 * There was not one.
 *
 * They are laid out in furlongs, not on one grid. A parish is not a sheet
 * of graph paper: it is a handful of blocks, each ploughed its own way,
 * meeting at angles. One grid over the whole valley was the first cut of
 * this, and from map height every parcel in it ran parallel to every
 * other — the ring's mistake wearing different clothes, one rule applied
 * to the whole of a thing that has never anywhere been laid out at once.
 *
 * Within a furlong the grain runs with the land, because that is how you
 * plough and how you drain, and cells are long one way and short the
 * other: a field is a strip before it is a square.
 */

export type FieldUse = 'pasture' | 'arable' | 'meadow';

/**
 * One block of fields, ploughed its own way.
 *
 * The valley is divided between them by nearest centre, so the blocks
 * tile it without gaps and a cell belongs to exactly one of them. Grains
 * are spread across a half turn rather than clustered near the scarps:
 * two furlongs ten degrees apart read as one furlong drawn badly.
 */
interface Furlong {
  x: number;
  z: number;
  grain: number;
  along: number;
  across: number;
}

const FURLONGS: readonly Furlong[] = [
  { x: 66, z: -26, grain: 158, along: FIELD_ALONG, across: FIELD_ACROSS },
  { x: 34, z: 64, grain: 122, along: FIELD_ALONG * 0.86, across: FIELD_ACROSS * 1.1 },
  { x: -46, z: 58, grain: 78, along: FIELD_ALONG * 1.12, across: FIELD_ACROSS * 0.88 },
  { x: -70, z: -18, grain: 34, along: FIELD_ALONG * 0.92, across: FIELD_ACROSS },
  { x: -6, z: -72, grain: 104, along: FIELD_ALONG, across: FIELD_ACROSS * 0.92 },
];

const FRAMES = FURLONGS.map((f) => ({
  cos: Math.cos((f.grain * Math.PI) / 180),
  sin: Math.sin((f.grain * Math.PI) / 180),
}));

export interface Field {
  id: string;
  /** Which furlong, and its cell within that furlong's own grid. */
  furlong: number;
  i: number;
  j: number;
  /**
   * Corners, world coordinates, in order. Usually four, more where the
   * cell has been cut back to its own furlong.
   */
  points: ReadonlyArray<readonly [number, number]>;
  use: FieldUse;
  /**
   * Meadows only: whether the hay is already in.
   *
   * It lives on the field rather than in whatever draws the haycocks
   * because two systems have to agree about it — a mown meadow carries
   * cocks AND is cropped short, and an unmown one stands long and carries
   * nothing. Decided in two places, they disagree, and half the valley
   * grows stacks of hay in grass that was never cut.
   */
  mown: boolean;
  /** Its own shade, so two neighbouring pastures are not the same green. */
  tint: number;
}

/** The furlong a point belongs to: the nearest centre. */
export function furlongAt(x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let k = 0; k < FURLONGS.length; k++) {
    const f = FURLONGS[k];
    if (f === undefined) continue;
    const d = (x - f.x) ** 2 + (z - f.z) ** 2;
    if (d < bestD) { bestD = d; best = k; }
  }
  return best;
}

/** Grid frame to world, for one furlong. */
function toWorld(k: number, u: number, v: number): readonly [number, number] {
  const frame = FRAMES[k];
  if (frame === undefined) return [0, 0];
  return [u * frame.cos - v * frame.sin, u * frame.sin + v * frame.cos];
}

/** World to one furlong's grid frame. */
function toGrain(k: number, x: number, z: number): readonly [number, number] {
  const frame = FRAMES[k];
  if (frame === undefined) return [0, 0];
  return [x * frame.cos + z * frame.sin, -x * frame.sin + z * frame.cos];
}

/**
 * Both directions of a furlong's frame, for anything that has to work in
 * rows: a crop is drilled along the grain, not scattered across it.
 */
export const toGrainIn = toGrain;
export function toWorldIn(k: number, u: number, v: number): readonly [number, number] {
  return toWorld(k, u, v);
}

/** Where a point sits along its furlong's grain, for ridge and furrow. */
export function furrowPhase(k: number, x: number, z: number): number {
  return toGrain(k, x, z)[0] ?? 0;
}

/** True inside any of the village's clearings, where fields do not go. */
function onTheVillage(x: number, z: number): boolean {
  for (const c of CLEARINGS) {
    const dx = x - c.x;
    const dz = z - c.z;
    // A field may come right up to a clearing, but not into it
    if (dx * dx + dz * dz < (c.radius + 2) ** 2) return true;
  }
  return false;
}

/**
 * Water, and the strip of ground beside it that belongs to the water.
 *
 * A field that crosses the river is not a field. The first cut had one —
 * standing in the middle of what the generator called pasture put the eye
 * in the channel with the current running through it, and a hedge marched
 * down one bank and up the other. Nothing in the numbers said so: the
 * cell was inside the disc and clear of every clearing, which was all the
 * generator ever asked.
 *
 * The margin clears the cut itself, so the boundary stands at the top of
 * the bank. The strip between hedge and water is the haugh, and it reads
 * as rough grazing because nobody has fenced it.
 */
function wet(x: number, z: number): boolean {
  if (Math.abs(z - riverCenterZ(x)) < FIELD_RIVER_MARGIN) return true;
  return pondCarve(x, z) > 0.01;
}

/**
 * A lattice corner's own offset.
 *
 * Hashed from the corner's coordinates rather than drawn off one running
 * stream: both cells that meet at a corner have to get the same answer,
 * and a stream only manages that if every consumer walks the lattice in
 * the same order. `fieldAt` does not — it looks up single cells — so the
 * offset has to be a pure function of (furlong, i, j).
 */
function offsetAt(k: number, i: number, j: number): readonly [number, number] {
  const random = makeRandom(hashSeed(`field-corner-${FIELD_SEED}-${k}-${i}-${j}`));
  return [(random() - 0.5) * FIELD_JITTER, (random() - 0.5) * FIELD_JITTER];
}

const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;

/** A cell as a quad, whether or not it survives as a field. */
function quadOf(k: number, i: number, j: number): Array<readonly [number, number]> {
  const f = FURLONGS[k];
  if (f === undefined) return [];
  const points: Array<readonly [number, number]> = [];
  for (const [di, dj] of CORNERS) {
    const off = offsetAt(k, i + di, j + dj);
    points.push(toWorld(k, (i + di) * f.along + off[0], (j + dj) * f.across + off[1]));
  }
  return points;
}

/**
 * The whole system, as polygons.
 *
 * Corners are jittered on a lattice shared by neighbouring cells, so two
 * fields that touch agree on the corner between them and the boundary
 * between them is one line rather than two that nearly coincide.
 */
let generated: Field[] | null = null;

/**
 * The whole system. Built once and handed out: five callers ask for it —
 * the hedges, the ground painter, the crop, the trees and the bushes —
 * and regenerating five times is five clips of every cell against every
 * furlong. Callers get the same array, and treat it as read-only.
 */
export function fields(): Field[] {
  if (generated === null) generated = build();
  return generated;
}

function build(): Field[] {
  const out: Field[] = [];

  for (let k = 0; k < FURLONGS.length; k++) {
    const f = FURLONGS[k];
    if (f === undefined) continue;
    const reach = Math.ceil(FIELD_EDGE / Math.min(f.along, f.across)) + 1;

    for (let i = -reach; i < reach; i++) {
      for (let j = -reach; j < reach; j++) {
        const quad = quadOf(k, i, j);
        if (quad.length < 4) continue;

        // The cell belongs to whichever furlong its middle falls in, and
        // is then cut back to that furlong's share of the valley. Testing
        // the whole outline instead and throwing the cell away when it
        // crossed a boundary was tried: with five blocks in a disc this
        // size a boundary runs through nearly every cell, and it left
        // thirteen fields over an eighth of the ground. The cut is what
        // makes the seam legible anyway — where two blocks ploughed
        // different ways meet, real country has a hard straight line
        const centre = middleOf(quad);
        if (furlongAt(centre[0], centre[1]) !== k) continue;

        const points = clipToFurlong(quad, k);
        // A cell caught edge-on by a boundary comes out of the clip as a
        // sliver a metre wide. That is not a field, it is a hedge with a
        // gap in it
        if (points.length < 3 || areaOf(points) < FIELD_MIN_AREA) continue;

        // Dry, clear of the village and inside the disc — measured on the
        // outline the cell actually ended up with. The channel is
        // narrower than a cell and a field can step clean over it corner
        // to corner, which is how the first cut came to hedge both banks
        // of the river as one pasture
        let keep = true;
        for (let c = 0; c < points.length && keep; c++) {
          const a = points[c];
          const b = points[(c + 1) % points.length];
          if (a === undefined || b === undefined) continue;
          const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
          for (let t = 0; t <= steps; t++) {
            const x = a[0] + (b[0] - a[0]) * (t / steps);
            const z = a[1] + (b[1] - a[1]) * (t / steps);
            if (x * x + z * z > FIELD_EDGE * FIELD_EDGE || onTheVillage(x, z) || wet(x, z)) {
              keep = false;
              break;
            }
          }
        }
        if (!keep) continue;

        // Deterministic use from the cell's own coordinates, so a field is
        // the same crop every session and neighbours differ
        const random = makeRandom(hashSeed(`field-${k}-${i}-${j}`));
        const draw = random();
        const use: FieldUse = draw < 0.44 ? 'pasture' : draw < 0.78 ? 'arable' : 'meadow';
        // Meadows are mown in turn, not all on the same morning
        const mown = use === 'meadow' && random() < 0.55;
        out.push({ id: `field-${k}-${i}-${j}`, furlong: k, i, j, points, use, mown, tint: random() });
      }
    }
  }

  return out;
}

function middleOf(points: ReadonlyArray<readonly [number, number]>): readonly [number, number] {
  let x = 0;
  let z = 0;
  for (const p of points) { x += p[0]; z += p[1]; }
  return [x / points.length, z / points.length];
}

/** Shoelace. Sign does not matter here, only size. */
function areaOf(points: ReadonlyArray<readonly [number, number]>): number {
  let twice = 0;
  for (let a = 0, b = points.length - 1; a < points.length; b = a++) {
    const p = points[a];
    const q = points[b];
    if (p === undefined || q === undefined) continue;
    twice += (q[0] + p[0]) * (q[1] - p[1]);
  }
  return Math.abs(twice) / 2;
}

/**
 * Cuts a cell back to its furlong's share of the valley.
 *
 * The share is the set of points nearer this furlong's centre than any
 * other, so its edges are the perpendicular bisectors between centres:
 * clip the cell by one half plane per other furlong and what is left is
 * exactly the part that belongs here. Sutherland and Hodgman, and it
 * stays convex because a cell and a half plane both are.
 */
function clipToFurlong(
  quad: ReadonlyArray<readonly [number, number]>,
  k: number,
): Array<readonly [number, number]> {
  const here = FURLONGS[k];
  if (here === undefined) return [];
  let poly: Array<readonly [number, number]> = [...quad];

  for (let m = 0; m < FURLONGS.length && poly.length > 0; m++) {
    const other = FURLONGS[m];
    if (m === k || other === undefined) continue;
    // Inside is the side of the bisector this furlong's centre is on
    const nx = other.x - here.x;
    const nz = other.z - here.z;
    const midX = (other.x + here.x) / 2;
    const midZ = (other.z + here.z) / 2;
    const signed = (p: readonly [number, number]): number => (p[0] - midX) * nx + (p[1] - midZ) * nz;

    const cut: Array<readonly [number, number]> = [];
    for (let a = 0, b = poly.length - 1; a < poly.length; b = a++) {
      const p = poly[a];
      const q = poly[b];
      if (p === undefined || q === undefined) continue;
      const sp = signed(p);
      const sq = signed(q);
      if (sq <= 0 !== sp <= 0) {
        const t = sq / (sq - sp);
        cut.push([q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t]);
      }
      if (sp <= 0) cut.push(p);
    }
    poly = cut;
  }

  return poly;
}

/** Cell key. No furlong's grid runs past a few hundred either way. */
const keyOf = (k: number, i: number, j: number): number => (k * 1024 + i + 512) * 1024 + (j + 512);

let index: Map<number, Field> | null = null;

function indexed(): Map<number, Field> {
  if (index !== null) return index;
  const built = new Map<number, Field>();
  for (const field of fields()) built.set(keyOf(field.furlong, field.i, field.j), field);
  index = built;
  return built;
}

/** Winding test on a quad. */
function inside(points: ReadonlyArray<readonly [number, number]>, x: number, z: number): boolean {
  let hit = false;
  for (let a = 0, b = points.length - 1; a < points.length; b = a++) {
    const p = points[a];
    const q = points[b];
    if (p === undefined || q === undefined) continue;
    if ((p[1] > z) !== (q[1] > z)
      && x < ((q[0] - p[0]) * (z - p[1])) / (q[1] - p[1]) + p[0]) hit = !hit;
  }
  return hit;
}

/**
 * The field a point stands in, or null.
 *
 * Only its own furlong is searched, and only the nine cells around it:
 * every cell lies wholly inside one furlong by construction, so a point
 * cannot be standing in a field belonging to a different block. The
 * jitter moves a corner by at most half of FIELD_JITTER, so a point can
 * only ever have wandered into a cell next door.
 */
export function fieldAt(x: number, z: number): Field | null {
  if (x * x + z * z > FIELD_EDGE * FIELD_EDGE) return null;
  const k = furlongAt(x, z);
  const f = FURLONGS[k];
  if (f === undefined) return null;
  const map = indexed();
  const [u, v] = toGrain(k, x, z);
  if (u === undefined || v === undefined) return null;
  const i0 = Math.floor(u / f.along);
  const j0 = Math.floor(v / f.across);
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const field = map.get(keyOf(k, i0 + di, j0 + dj));
      if (field !== undefined && inside(field.points, x, z)) return field;
    }
  }
  return null;
}

/** True inside any field, for anything that must keep out of them. */
export function inField(x: number, z: number): boolean {
  return fieldAt(x, z) !== null;
}

/** Shortest distance from a point to a polygon's boundary. */
export function toBoundary(
  points: ReadonlyArray<readonly [number, number]>,
  x: number,
  z: number,
): number {
  let best = Infinity;
  for (let a = 0, b = points.length - 1; a < points.length; b = a++) {
    const p = points[a];
    const q = points[b];
    if (p === undefined || q === undefined) continue;
    const dx = q[0] - p[0];
    const dz = q[1] - p[1];
    const len2 = dx * dx + dz * dz;
    const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (p[0] + dx * t), z - (p[1] + dz * t)));
  }
  return best;
}

/**
 * Scattered places inside a field, no closer than `margin` to its hedge.
 *
 * Rejection sampling against the field's own bounding box, capped so a
 * parcel that cannot hold what is asked of it gives up rather than spins.
 * Everything that stands in a field needs this — the beasts in a pasture,
 * the cocks in a meadow — and it belongs with the polygons rather than
 * copied into each of them.
 */
export function placesIn(
  field: Field,
  count: number,
  margin: number,
  random: () => number,
): Array<readonly [number, number]> {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const p of field.points) {
    x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]);
    z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]);
  }

  const out: Array<readonly [number, number]> = [];
  for (let tries = 0; tries < count * 40 && out.length < count; tries++) {
    const x = x0 + random() * (x1 - x0);
    const z = z0 + random() * (z1 - z0);
    if (fieldAt(x, z) !== field) continue;
    if (toBoundary(field.points, x, z) < margin) continue;
    out.push([x, z]);
  }
  return out;
}
