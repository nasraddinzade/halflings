import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';

import { TERRAIN_PROBE_HEIGHT } from '../config/constants';

export interface GroundSample {
  /** Высота земли в запрошенной точке. */
  height: number;
  /** Нормаль поверхности, мировая. */
  normal: THREE.Vector3;
  /** Угол между нормалью и вертикалью, радианы. */
  slope: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Запросы к рельефу: высота под точкой и препятствия на пути луча.
 *
 * Высоту можно было бы взять из heightAt() напрямую и дешевле, но меш —
 * это кусочно-линейная аппроксимация той функции, и на сетке в метр они
 * расходятся на сантиметры. Персонаж должен стоять на том, что нарисовано,
 * поэтому спрашиваем именно геометрию.
 */
export class Ground {
  private readonly ray = new THREE.Ray();
  private readonly down = new THREE.Vector3(0, -1, 0);
  private readonly sampleResult: GroundSample = {
    height: 0,
    normal: new THREE.Vector3(0, 1, 0),
    slope: 0,
  };

  constructor(private readonly bvh: MeshBVH) {}

  /**
   * Земля под точкой (x, z). Возвращает переиспользуемый объект —
   * копируйте, если нужно сохранить между кадрами.
   * null означает, что точка вне долины.
   */
  sample(x: number, z: number): GroundSample | null {
    this.ray.origin.set(x, TERRAIN_PROBE_HEIGHT, z);
    this.ray.direction.copy(this.down);

    const hit = this.bvh.raycastFirst(this.ray, THREE.FrontSide);
    if (hit === null || hit.face === null || hit.face === undefined) return null;

    this.sampleResult.height = hit.point.y;
    this.sampleResult.normal.copy(hit.face.normal);
    this.sampleResult.slope = this.sampleResult.normal.angleTo(UP);
    return this.sampleResult;
  }

  /**
   * Первое попадание луча в рельеф. Нужно камере, чтобы не заезжать
   * внутрь холма. Возвращает расстояние до удара или null.
   */
  raycastDistance(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): number | null {
    this.ray.origin.copy(origin);
    this.ray.direction.copy(direction).normalize();

    const hit = this.bvh.raycastFirst(this.ray, THREE.DoubleSide, 0, maxDistance);
    return hit === null ? null : hit.distance;
  }
}
