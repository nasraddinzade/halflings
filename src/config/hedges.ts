import { BURROWS, FACE_CLEARANCE, doorFacing, type Burrow } from './burrows';
import { HEDGE_FOOT, PLAYER_RADIUS, RIVER_WATER_DEPTH } from './constants';
import { fields } from './fields';
import { LANES, LANE_HALF_WIDTH, doorSpurs, type Lane } from './lanes';
import { DOOR_TOP } from '../world/burrow/profile';
import { groundHeight, riverCarve } from '../world/heightfield';

/**
 * Where the hedges run.
 *
 * A green reads as a room because it has continuous walls: the unbroken
 * line of plot boundaries facing it. That is the whole trick, and it is
 * why this is the highest-leverage thing in the plan — the same primitive
 * then draws every plot boundary in the village.
 *
 * Most of it is derived from the dwellings rather than written down, so a
 * dwelling that moves takes its boundaries with it.
 */

export interface HedgeRun {
  id: string;
  points: ReadonlyArray<readonly [number, number]>;
  /** Gaps in the line, as distances along it: [start, end] in metres. */
  gates?: ReadonlyArray<readonly [number, number]>;
}

/** Standing water over the ground at a point, without needing the player. */
function flooded(x: number, z: number): boolean {
  return riverCarve(x, z) > RIVER_WATER_DEPTH;
}

/**
 * A plot boundary runs UPHILL from the frontage, along the fall line.
 *
 * It used to be a ray from the origin, from r 22.6 to r 42, and the croft
 * rear was a circle at r 42. Both were ring ideas: they only make sense
 * if every dwelling sits on one circle facing the middle. With five foci
 * on five banks a ray from the origin crosses whatever it happens to
 * cross, and a circle at r 42 runs through three of them.
 *
 * A toft is the ground between two neighbours, and its edge is the line
 * that neither of them can plough: from the frontage, straight back up
 * the slope, to where the bank tops out. That is the same line a real
 * boundary follows, and it needs no bearings and no radii.
 */
function neighboursInFocus(): Array<[Burrow, Burrow]> {
  // Two dwellings are neighbours if nothing else stands between them and
  // they are close enough to share a boundary at all. 14 m is a little
  // over the widest frontage class; beyond that they are separate foci
  const pairs: Array<[Burrow, Burrow]> = [];
  for (let i = 0; i < BURROWS.length; i++) {
    for (let j = i + 1; j < BURROWS.length; j++) {
      const a = BURROWS[i];
      const b = BURROWS[j];
      if (a === undefined || b === undefined) continue;
      const apart = Math.hypot(a.x - b.x, a.z - b.z);
      if (apart > 14) continue;
      let between = false;
      for (const other of BURROWS) {
        if (other === a || other === b) continue;
        if (Math.hypot(other.x - a.x, other.z - a.z) < apart
          && Math.hypot(other.x - b.x, other.z - b.z) < apart) { between = true; break; }
      }
      if (!between) pairs.push([a, b]);
    }
  }
  return pairs;
}

export function toftBoundaries(): HedgeRun[] {
  const runs: HedgeRun[] = [];

  for (const [a, b] of neighboursInFocus()) {
    // The midpoint of the GAP, not of the centres: with unequal mounds
    // those are different points, and the centre midpoint can sit inside
    // the larger neighbour
    const apart = Math.hypot(b.x - a.x, b.z - a.z);
    const t = (apart + a.radius - b.radius) / (2 * apart);
    const mx = a.x + (b.x - a.x) * t;
    const mz = a.z + (b.z - a.z) * t;

    // Uphill is the way neither door looks. Take the two facings, average
    // them, and run the boundary against it
    const ax = Math.sin(doorFacing(a)) + Math.sin(doorFacing(b));
    const az = Math.cos(doorFacing(a)) + Math.cos(doorFacing(b));
    const len = Math.hypot(ax, az);
    if (len < 1e-6) continue;
    const ux = -ax / len;
    const uz = -az / len;

    // From just outside the frontage, back until the bank stops rising
    const from: [number, number] = [mx - ux * 2.2, mz - uz * 2.2];
    let reach = 4;
    let last = groundHeight(mx, mz);
    for (let d = 4; d <= 26; d += 0.5) {
      const y = groundHeight(mx + ux * d, mz + uz * d);
      if (y < last + 0.02) break;
      last = y;
      reach = d;
    }
    if (reach < 6) continue;
    const to: [number, number] = [mx + ux * reach, mz + uz * reach];
    if (flooded(to[0], to[1])) continue;
    runs.push({ id: `toft-${a.id}-${b.id}`, points: [from, to] });
  }

  return runs;
}

/**
 * The back of the crofts: an offset of the lane that serves their rears,
 * not a circle. A croft ends where the next thing begins, and behind the
 * knot that thing is the back lane.
 */
export function croftRear(): HedgeRun[] {
  const back = LANES.find((lane) => lane.id === 'back');
  if (back === undefined) return [];

  const points: Array<readonly [number, number]> = [];
  for (let i = 1; i < back.points.length; i++) {
    const a = back.points[i - 1];
    const b = back.points[i];
    if (a === undefined || b === undefined) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 1e-4) continue;
    // Offset to the uphill side of the lane, which is the side the crofts
    // are not on
    const nx = (-dz / length) * 2.4;
    const nz = (dx / length) * 2.4;
    if (i === 1) points.push([a[0] + nx, a[1] + nz]);
    points.push([b[0] + nx, b[1] + nz]);
  }
  if (points.length < 2) return [];
  return [{ id: 'croft-rear', points }];
}

/**
 * The green's own wall. Open on the east, where the cart lane forms the
 * edge — which is how a real green meets its street.
 */
export const GREEN_HEDGES: readonly HedgeRun[] = [
  {
    // Ten-sided, and it is a residual rather than a shape: what is left
    // inside the fork of the street, the millway and the fold lane. A
    // green is the ground nobody built on, which is why real ones are
    // never rectangles. 525 m2 against the old rectangle's 204
    id: 'green',
    points: [[16, -6.5], [14.5, 3], [13, 12], [10.5, 20], [11.5, 24.5], [21, 25.5],
             [30.5, 20], [32, 6], [28.5, -4], [21.5, -8], [16, -6.5]],
  },
];

/**
 * Where the ways break the boundaries.
 *
 * A gate is not decoration, it is the place a way crosses a hedge, so it
 * is derived from the two rather than written down. Written by hand they
 * went stale the moment a lane moved: three lanes were walled off — the
 * cart road into the green among them — by boundaries added after the
 * routes were solved.
 *
 * The opening is measured from the hedge's own centre line, which is
 * where its blocking circles sit, so an oblique crossing widens the gap
 * by itself: more of the hedge falls near the lane.
 */
function gatesFor(run: HedgeRun, ways: readonly Lane[]): Array<readonly [number, number]> {
  const STEP = 0.25;
  const gates: Array<[number, number]> = [];
  let open: [number, number] | null = null;
  let travelled = 0;

  for (let i = 1; i < run.points.length; i++) {
    const a = run.points[i - 1];
    const b = run.points[i];
    if (a === undefined || b === undefined) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length < 1e-4) continue;

    for (let d = 0; d <= length; d += STEP) {
      const t = d / length;
      const x = a[0] + (b[0] - a[0]) * t;
      const z = a[1] + (b[1] - a[1]) * t;
      const along = travelled + d;

      let breached = false;
      for (const way of ways) {
        // Room for the beaten track, and for a body, past the hedge foot
        const room = Math.max(LANE_HALF_WIDTH[way.kind], PLAYER_RADIUS) + HEDGE_FOOT / 2 + 0.1;
        if (distanceToWay(x, z, way) < room) { breached = true; break; }
      }

      if (breached) {
        if (open === null) open = [along, along];
        else open[1] = along;
      } else if (open !== null) {
        gates.push(open);
        open = null;
      }
    }
    travelled += length;
  }
  if (open !== null) gates.push(open);

  return gates;
}

function distanceToWay(x: number, z: number, way: Lane): number {
  let best = Infinity;
  for (let i = 1; i < way.points.length; i++) {
    const a = way.points[i - 1];
    const b = way.points[i];
    if (a === undefined || b === undefined) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    const t = len2 < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
  }
  return best;
}

/** Arc length of a polyline, and the cumulative length at each point. */
function measure(points: ReadonlyArray<readonly [number, number]>): number[] {
  const marks = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    if (a === undefined || b === undefined) continue;
    marks.push((marks[marks.length - 1] ?? 0) + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  return marks;
}

/** Re-cuts a polyline between two distances along itself. */
function trim(
  points: ReadonlyArray<readonly [number, number]>,
  from: number,
  to: number,
): Array<readonly [number, number]> {
  const marks = measure(points);
  const at = (d: number): [number, number] => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      const s = marks[i - 1];
      const e = marks[i];
      if (a === undefined || b === undefined || s === undefined || e === undefined) continue;
      if (d <= e || i === points.length - 1) {
        const t = e - s < 1e-6 ? 0 : (d - s) / (e - s);
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
    }
    const last = points[points.length - 1];
    return last === undefined ? [0, 0] : [last[0], last[1]];
  };

  const cut: Array<readonly [number, number]> = [at(from)];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const m = marks[i];
    if (p === undefined || m === undefined) continue;
    if (m > from && m < to) cut.push(p);
  }
  cut.push(at(to));
  return cut;
}

/**
 * The field boundaries.
 *
 * Every side of every parcel, each built once. Two fields sharing a side
 * name the same two corners, so keying on the pair — in whichever order —
 * is enough to tell a shared boundary from a new one. Two coincident
 * hedges are twice the triangles and a visible seam wherever their lumps
 * disagree.
 *
 * The pairing has to be a dedup rather than a rule about which sides a
 * cell owns. `west and south, plus north and east when nobody is next
 * door` worked while every parcel was a quad on one lattice; parcels are
 * now clipped to their furlong, so a cell can have five corners and its
 * neighbour along a boundary is not the cell at (i + 1, j).
 */
export function fieldBoundaries(): HedgeRun[] {
  const runs: HedgeRun[] = [];
  const built = new Set<string>();
  const name = (p: readonly [number, number]): string => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

  for (const field of fields()) {
    const p = field.points;
    for (let a = 0; a < p.length; a++) {
      const from = p[a];
      const to = p[(a + 1) % p.length];
      if (from === undefined || to === undefined) continue;
      const key = [name(from), name(to)].sort().join('|');
      if (built.has(key)) continue;
      built.add(key);
      runs.push({ id: `${field.id}-${a}`, points: [from, to] });
    }
  }
  return runs;
}

export function allHedges(): HedgeRun[] {
  const ways = [...LANES, ...doorSpurs()];
  const out: HedgeRun[] = [];

  for (const run of [...GREEN_HEDGES, ...toftBoundaries(), ...croftRear(), ...fieldBoundaries()]) {
    // Shorter than the ribbon's own step opens nothing — a sample that
    // merely grazed a lane, not a gateway
    const found = gatesFor(run, ways).filter((g) => g[1] - g[0] >= 0.5);
    const total = measure(run.points).pop() ?? 0;

    // A break at an end is not a gate. It means the boundary runs out of
    // the lane rather than across it — the mill lane leaves the village
    // between two tofts, and one toft boundary began on top of it. Left
    // as a gate that is an 8.8 m hole with a hedge stub floating past it
    let from = 0;
    let to = total;
    const middle: Array<readonly [number, number]> = [];
    for (const gate of found) {
      if (gate[0] <= 0.3) from = Math.max(from, gate[1]);
      else if (gate[1] >= total - 0.3) to = Math.min(to, gate[0]);
      else middle.push(gate);
    }
    if (to - from < 2) continue;

    const points = from > 0 || to < total ? trim(run.points, from, to) : run.points;
    const gates = [...(run.gates ?? []), ...middle].map(
      (g) => [g[0] - from, g[1] - from] as const,
    );
    out.push(gates.length > 0 ? { ...run, points, gates } : { ...run, points });
  }

  return out;
}

/** Used by the door spurs, kept here so the two agree on the geometry. */
export function doorReach(burrow: Burrow): number {
  return burrow.radius
    * Math.sqrt(Math.max(0, 1 - ((DOOR_TOP + FACE_CLEARANCE) / burrow.height) ** 2));
}
