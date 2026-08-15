import type * as THREE from 'three';

import { DOOR_BLOCK_RADIUS } from '../config/constants';
import { BURROWS, doorPosition } from '../config/burrows';

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
  /** Неподвижные: двери нор. Список строится один раз. */
  private readonly statics: Circle[] = [];
  /** Подвижные: жители. Village обновляет их каждый кадр. */
  private dynamics: readonly Circle[] = [];

  constructor() {
    for (const burrow of BURROWS) {
      const door = doorPosition(burrow);
      this.statics.push({ x: door.x, z: door.z, radius: DOOR_BLOCK_RADIUS });
    }
  }

  setDynamic(circles: readonly Circle[]): void {
    this.dynamics = circles;
  }

  /**
   * Выталкивает точку из всех кругов, в которые она залезла.
   * Меняет position на месте; возвращает true, если что-то подвинулось.
   */
  resolve(position: THREE.Vector3, radius: number, includeDynamic = true): boolean {
    let moved = false;
    moved = pushOut(position, radius, this.statics) || moved;
    if (includeDynamic) moved = pushOut(position, radius, this.dynamics) || moved;
    return moved;
  }

  /** Проверка без изменения — нужна, чтобы не заводить жителя в дверь. */
  blocked(x: number, z: number, radius: number): boolean {
    for (const circle of this.statics) {
      const limit = circle.radius + radius;
      if ((x - circle.x) ** 2 + (z - circle.z) ** 2 < limit * limit) return true;
    }
    return false;
  }
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
