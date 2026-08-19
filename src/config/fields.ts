import { FIELD_ACROSS, FIELD_ALONG, FIELD_EDGE, FIELD_GRAIN, FIELD_JITTER, FIELD_SEED } from './constants';
import { CLEARINGS } from './scarps';
import { hashSeed, makeRandom } from '../core/random';

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
 * The grain runs with the land, not round it. Real field systems align to
 * the slope — along the contour and up the fall line — because that is how
 * you plough and how you drain, so the grid here is rotated to the bearing
 * of the scarps rather than to the world axes or to a radius from the
 * middle. Radial was the ring's mistake and is not repeated.
 *
 * Cells are long one way and short the other: a field is a strip before it
 * is a square, and equal squares read as farmland drawn by a machine.
 */

export type FieldUse = 'pasture' | 'arable' | 'meadow';

export interface Field {
  id: string;
  /** Its cell on the lattice, so a lookup does not have to parse the id. */
  i: number;
  j: number;
  /** Corners, world coordinates, in grid order. */
  points: ReadonlyArray<readonly [number, number]>;
  use: FieldUse;
  /** Its own shade, so two neighbouring pastures are not the same green. */
  tint: number;
}

const COS = Math.cos((FIELD_GRAIN * Math.PI) / 180);
const SIN = Math.sin((FIELD_GRAIN * Math.PI) / 180);

/** World to the field grid's own frame, and back. */
export const toGrain = (x: number, z: number): [number, number] => [x * COS + z * SIN, -x * SIN + z * COS];
const toWorld = (u: number, v: number): [number, number] => [u * COS - v * SIN, u * SIN + v * COS];

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
 * A lattice corner's own offset.
 *
 * Hashed from the corner's coordinates rather than drawn off one running
 * stream: both cells that meet at a corner have to get the same answer,
 * and a stream only manages that if every consumer walks the lattice in
 * the same order. `fieldAt` does not — it looks up single cells — so the
 * offset has to be a pure function of (i, j).
 */
function offsetAt(i: number, j: number): [number, number] {
  const random = makeRandom(hashSeed(`field-corner-${FIELD_SEED}-${i}-${j}`));
  return [(random() - 0.5) * FIELD_JITTER, (random() - 0.5) * FIELD_JITTER];
}

const CORNERS = [[0, 0], [1, 0], [1, 1], [0, 1]] as const;

/** A cell as a quad, whether or not it survives as a field. */
function quadOf(i: number, j: number): Array<readonly [number, number]> {
  const points: Array<readonly [number, number]> = [];
  for (const [di, dj] of CORNERS) {
    const off = offsetAt(i + di, j + dj);
    points.push(toWorld((i + di) * FIELD_ALONG + off[0], (j + dj) * FIELD_ACROSS + off[1]));
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
export function fields(): Field[] {
  const reach = Math.ceil(FIELD_EDGE / Math.min(FIELD_ALONG, FIELD_ACROSS)) + 1;
  const out: Field[] = [];

  for (let i = -reach; i < reach; i++) {
    for (let j = -reach; j < reach; j++) {
      const points = quadOf(i, j);
      let keep = true;
      for (const [x, z] of points) {
        if (Math.hypot(x, z) > FIELD_EDGE || onTheVillage(x, z)) { keep = false; break; }
      }
      if (!keep) continue;

      // Deterministic use from the cell's own coordinates, so a field is
      // the same crop every session and neighbours differ
      const random = makeRandom(hashSeed(`field-${i}-${j}`));
      const draw = random();
      const use: FieldUse = draw < 0.44 ? 'pasture' : draw < 0.78 ? 'arable' : 'meadow';
      out.push({ id: `field-${i}-${j}`, i, j, points, use, tint: random() });
    }
  }

  return out;
}

/** Cell key. The grid never runs past a few hundred either way. */
const keyOf = (i: number, j: number): number => (i + 512) * 1024 + (j + 512);

let index: Map<number, Field> | null = null;

function indexed(): Map<number, Field> {
  if (index !== null) return index;
  const built = new Map<number, Field>();
  for (const field of fields()) built.set(keyOf(field.i, field.j), field);
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
 * The jitter moves a corner by at most half of FIELD_JITTER, so a point
 * can only ever have wandered into a cell next door: nine lookups cover
 * every case, and the terrain painter asks this once per vertex.
 */
export function fieldAt(x: number, z: number): Field | null {
  if (x * x + z * z > FIELD_EDGE * FIELD_EDGE) return null;
  const map = indexed();
  const [u, v] = toGrain(x, z);
  const i0 = Math.floor(u / FIELD_ALONG);
  const j0 = Math.floor(v / FIELD_ACROSS);
  for (let di = -1; di <= 1; di++) {
    for (let dj = -1; dj <= 1; dj++) {
      const field = map.get(keyOf(i0 + di, j0 + dj));
      if (field !== undefined && inside(field.points, x, z)) return field;
    }
  }
  return null;
}

/** True inside any field, for anything that must keep out of them. */
export function inField(x: number, z: number): boolean {
  return fieldAt(x, z) !== null;
}
