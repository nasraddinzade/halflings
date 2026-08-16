import type * as THREE from 'three';


/** Сторона ячейки пространственной сетки, метры. */
const CELL = 8;

export interface Circle {
  x: number;
  z: number;
  radius: number;
}

/**
 * Препятствия на плоскости — круги, и только.
 *
 * Полноценный физдвижок проекту не нужен (CLAUDE.md): по рельефу ходят
 * лучом вниз, а всё, обо что можно стукнуться, круглое в плане — дверь,
 * житель, игрок. Разведение двух кругов — три строки и никакой
 * зависимости, тогда как физдвижок притащил бы мегабайт ради того же.
 *
 * Высоту не учитываем: перепрыгнуть жителя всё равно нельзя, а дверь
 * стоит на ровной площадке.
 */
export class Obstacles {
  /** Неподвижные и немногочисленные: двери нор. Проверяются перебором. */
  private readonly statics: Circle[] = [];
  /**
   * Стволы деревьев. Их за тысячу, и перебирать их каждый кадр нельзя —
   * раскладываем по сетке и смотрим только девять ячеек вокруг точки.
   */
  private readonly grid = new Map<number, Circle[]>();
  private readonly nearby: Circle[] = [];
  /** Подвижные: жители. Village обновляет их каждый кадр. */
  private dynamics: readonly Circle[] = [];

  /** Немногочисленные неподвижные круги: двери нор, реквизит. */
  addStatic(circles: readonly Circle[]): void {
    this.statics.push(...circles);
  }

  setDynamic(circles: readonly Circle[]): void {
    this.dynamics = circles;
  }

  /** Раскладывает неподвижные круги по сетке. Вызывается один раз. */
  addToGrid(circles: readonly Circle[]): void {
    for (const circle of circles) {
      const key = cellKey(circle.x, circle.z);
      const bucket = this.grid.get(key);
      if (bucket === undefined) this.grid.set(key, [circle]);
      else bucket.push(circle);
    }
  }

  /**
   * Круги из девяти ячеек вокруг точки. Возвращает переиспользуемый
   * массив: за кадр он читается сразу и наружу не утекает.
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
   * Выталкивает точку из всех кругов, в которые она залезла.
   * Меняет position на месте; возвращает true, если что-то подвинулось.
   */
  resolve(position: THREE.Vector3, radius: number, includeDynamic = true): boolean {
    let moved = false;
    moved = pushOut(position, radius, this.statics) || moved;
    moved = pushOut(position, radius, this.collectNearby(position.x, position.z)) || moved;
    if (includeDynamic) moved = pushOut(position, radius, this.dynamics) || moved;
    return moved;
  }

  /** Проверка без изменения — нужна, чтобы не заводить жителя в дверь. */
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

/** Ключ ячейки. Смещение делает индексы неотрицательными. */
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
      // Ровно в центре направление не определено — толкаем вбок,
      // иначе делили бы на ноль и получили NaN на весь трансформ
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
