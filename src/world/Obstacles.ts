import type * as THREE from 'three';


/** Side of a spatial grid cell, in meters. */
const CELL = 8;

export interface Circle {
  x: number;
  z: number;
  radius: number;
}

/**
 * Obstacles on the plane — circles, and nothing else.
 *
 * The project does not need a real physics engine (CLAUDE.md): the
 * terrain is walked with a downward ray, and everything you can bump
 * into is a circle in plan — a door, a villager, the player. Separating
 * two circles is three lines and no dependency, whereas a physics engine
 * would drag in a megabyte for the same result.
 *
 * Height is ignored: you cannot jump over a villager anyway, and a door
 * stands on flat ground.
 */
export class Obstacles {
  /** Static and few in number: burrow doors. Checked by brute force. */
  private readonly statics: Circle[] = [];
  /**
   * Tree trunks. There are over a thousand of them, and scanning them all
   * every frame is out — we bin them into a grid and look at only the
   * nine cells around the point.
   */
  private readonly grid = new Map<number, Circle[]>();
  private readonly nearby: Circle[] = [];
  /** Moving ones: villagers. Village refreshes them every frame. */
  private dynamics: readonly Circle[] = [];

  /** A handful of static circles: burrow doors, props. */
  addStatic(circles: readonly Circle[]): void {
    this.statics.push(...circles);
  }

  setDynamic(circles: readonly Circle[]): void {
    this.dynamics = circles;
  }

  /** Bins static circles into the grid. Called once. */
  addToGrid(circles: readonly Circle[]): void {
    for (const circle of circles) {
      const key = cellKey(circle.x, circle.z);
      const bucket = this.grid.get(key);
      if (bucket === undefined) this.grid.set(key, [circle]);
      else bucket.push(circle);
    }
  }

  /**
   * Circles from the nine cells around the point. Returns a reused
   * array: within a frame it is read right away and never escapes.
   */
  private collectNearby(x: number, z: number): Circle[] {
    this.nearby.length = 0;
    const cx = Math.floor(x / CELL);
    const cz = Math.floor(z / CELL);
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const bucket = this.grid.get(pack(cx + dx, cz + dz));
        if (bucket !== undefined) this.nearby.push(...bucket);
      }
    }
    return this.nearby;
  }

  /**
   * Pushes the point out of every circle it has ended up inside.
   * Mutates position in place; returns true if anything moved.
   */
  resolve(position: THREE.Vector3, radius: number, includeDynamic = true): boolean {
    let moved = false;
    moved = pushOut(position, radius, this.statics) || moved;
    moved = pushOut(position, radius, this.collectNearby(position.x, position.z)) || moved;
    if (includeDynamic) moved = pushOut(position, radius, this.dynamics) || moved;
    return moved;
  }

  /** A read-only check — keeps a villager from being walked into a door. */
  blocked(x: number, z: number, radius: number): boolean {
    if (overlaps(x, z, radius, this.statics)) return true;
    return overlaps(x, z, radius, this.collectNearby(x, z));
  }
}

function overlaps(x: number, z: number, radius: number, circles: readonly Circle[]): boolean {
  for (const circle of circles) {
    const limit = circle.radius + radius;
    if ((x - circle.x) ** 2 + (z - circle.z) ** 2 < limit * limit) return true;
  }
  return false;
}

/** Cell key. The offset keeps the indices non-negative. */
function pack(cx: number, cz: number): number {
  return (cz + 4096) * 8192 + (cx + 4096);
}

function cellKey(x: number, z: number): number {
  return pack(Math.floor(x / CELL), Math.floor(z / CELL));
}

function pushOut(position: THREE.Vector3, radius: number, circles: readonly Circle[]): boolean {
  let moved = false;

  for (const circle of circles) {
    const dx = position.x - circle.x;
    const dz = position.z - circle.z;
    const limit = circle.radius + radius;
    const squared = dx * dx + dz * dz;
    if (squared >= limit * limit) continue;

    const distance = Math.sqrt(squared);
    if (distance < 1e-4) {
      // Dead center leaves the direction undefined — shove sideways,
      // otherwise we would divide by zero and NaN the whole transform
      position.x += limit;
      moved = true;
      continue;
    }

    const push = (limit - distance) / distance;
    position.x += dx * push;
    position.z += dz * push;
    moved = true;
  }

  return moved;
}
