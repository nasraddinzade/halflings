import { BURROWS, FACE_CLEARANCE, type Burrow } from './burrows';
import { HEDGE_FOOT, PLAYER_RADIUS, RIVER_WATER_DEPTH } from './constants';
import { LANES, LANE_HALF_WIDTH, doorSpurs, type Lane } from './lanes';
import { DOOR_TOP } from '../world/burrow/profile';
import { groundHeight, riverCarve, riverCenterZ } from '../world/heightfield';

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

/** Where the crofts end and the wood begins. */
export const CROFT_REAR = 42;
/** Where a boundary starts, just clear of the frontage. */
export const TOFT_INNER = 22.6;

const bearingOf = (x: number, z: number): number =>
  ((Math.atan2(x, z) * 180) / Math.PI + 360) % 360;
const onArc = (r: number, deg: number): [number, number] =>
  [Math.sin((deg * Math.PI) / 180) * r, Math.cos((deg * Math.PI) / 180) * r];

/** Standing water over the ground at a point, without needing the player. */
function flooded(x: number, z: number): boolean {
  const carve = riverCarve(x, z);
  if (carve <= RIVER_WATER_DEPTH) return false;
  return groundHeight(x, z) - RIVER_WATER_DEPTH > groundHeight(x, z) - carve;
}

/** The inn takes a frontage on the ring like any household. */
const INN_SEAT: Burrow = { id: 'inn', x: -0.1, z: 27, radius: 4.4, height: 4.14 };

function ringSeats(): Array<{ seat: Burrow; deg: number }> {
  return [...BURROWS.filter((b) => b.z > riverCenterZ(b.x)), INN_SEAT]
    .map((seat) => ({ seat, deg: bearingOf(seat.x, seat.z) }))
    .sort((a, b) => a.deg - b.deg);
}

/** The one wide opening in the ring, where the river cuts through it. */
function ringGap(ring: ReturnType<typeof ringSeats>): { from: number; span: number } {
  let widest = { from: 0, span: -1 };
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a === undefined || b === undefined) continue;
    const span = ((b.deg - a.deg) + 360) % 360;
    if (span > widest.span) widest = { from: a.deg, span };
  }
  return widest;
}

/**
 * Boundaries between neighbours, running outward from the frontage.
 *
 * Down the middle of the GAP, not along the angular bisector. With
 * unequal mound radii those are different lines, and the bisector came
 * within 0.88 m of a mound — half of that is inside the hedge itself.
 */
export function toftBoundaries(): HedgeRun[] {
  const ring = ringSeats();
  const gap = ringGap(ring);
  const runs: HedgeRun[] = [];

  for (let i = 0; i < ring.length; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (a === undefined || b === undefined) continue;
    const span = ((b.deg - a.deg) + 360) % 360;
    // No boundary across the river gap: there is nothing to divide there
    if (span >= gap.span) continue;

    const apart = Math.hypot(b.seat.x - a.seat.x, b.seat.z - a.seat.z);
    const t = (apart + a.seat.radius - b.seat.radius) / (2 * apart);
    const deg = bearingOf(
      a.seat.x + (b.seat.x - a.seat.x) * t,
      a.seat.z + (b.seat.z - a.seat.z) * t,
    );

    // Stop short of the water if this bearing runs into it
    let outer = CROFT_REAR;
    for (let r = TOFT_INNER; r <= CROFT_REAR; r += 0.5) {
      const [x, z] = onArc(r, deg);
      if (flooded(x, z)) { outer = r - 1.5; break; }
    }
    if (outer <= TOFT_INNER + 2) continue;

    runs.push({ id: `toft-${a.seat.id}`, points: [onArc(TOFT_INNER, deg), onArc(outer, deg)] });
  }

  return runs;
}

/** The back of the crofts, cut wherever it would meet the water. */
export function croftRear(): HedgeRun[] {
  const ring = ringSeats();
  const gap = ringGap(ring);
  const runs: HedgeRun[] = [];
  let open: Array<readonly [number, number]> | null = null;

  for (let deg = 0; deg <= 360; deg += 1.5) {
    const [x, z] = onArc(CROFT_REAR, deg);
    const behindTheRing = (((deg - gap.from) + 360) % 360) > gap.span;
    if (behindTheRing && !flooded(x, z)) {
      if (open === null) open = [];
      open.push([x, z]);
    } else if (open !== null) {
      if (open.length > 2) runs.push({ id: `rear-${runs.length + 1}`, points: open });
      open = null;
    }
  }
  if (open !== null && open.length > 2) runs.push({ id: `rear-${runs.length + 1}`, points: open });

  return runs;
}

/**
 * The green's own wall. Open on the east, where the cart lane forms the
 * edge — which is how a real green meets its street.
 */
export const GREEN_HEDGES: readonly HedgeRun[] = [
  { id: 'green-west', points: [[-10, 3], [-10, 15]] },
  { id: 'green-north', points: [[-10, 15], [5, 15]] },
  { id: 'green-south', points: [[-10, 3], [7, 3]] },
  { id: 'green-east', points: [[7, 3], [7, 11]] },
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

export function allHedges(): HedgeRun[] {
  const ways = [...LANES, ...doorSpurs()];
  const out: HedgeRun[] = [];

  for (const run of [...GREEN_HEDGES, ...toftBoundaries(), ...croftRear()]) {
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
