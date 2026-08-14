import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

import { NEUTRAL_TERRAIN, VALLEY_SEGMENTS, VALLEY_SIZE } from '../config/constants';
import { heightAt } from './heightfield';

/**
 * Меш долины плюс BVH к нему.
 *
 * BVH (bounding volume hierarchy) — дерево вложенных коробок над
 * треугольниками. Без него луч проверялся бы против всех 131 тыс.
 * треугольников; с ним — против десятка коробок и горстки треугольников.
 * Строится один раз при старте.
 */
export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly bvh: MeshBVH;

  constructor() {
    const geometry = new THREE.PlaneGeometry(
      VALLEY_SIZE,
      VALLEY_SIZE,
      VALLEY_SEGMENTS,
      VALLEY_SEGMENTS,
    );

    // Поворот печём в саму геометрию, а не в объект. Тогда локальные
    // координаты меша совпадают с мировыми, и лучи можно слать в BVH
    // без перевода систем координат.
    geometry.rotateX(-Math.PI / 2);

    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      position.setY(i, heightAt(position.getX(i), position.getZ(i)));
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    this.bvh = new MeshBVH(geometry);

    const material = new THREE.MeshStandardMaterial({
      color: NEUTRAL_TERRAIN,
      roughness: 1,
      metalness: 0,
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
