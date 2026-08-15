import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';

import { VALLEY_SEGMENTS, VALLEY_SIZE } from '../config/constants';
import { PALETTE } from '../config/palette';
import { applyStyle } from '../render/style';
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

    this.mesh = new THREE.Mesh(geometry);
    this.mesh.name = 'terrain';
    // Обводки у земли нет: inverted hull имеет смысл для предметов
    // с силуэтом, а не для поверхности, на которой всё стоит
    applyStyle(this.mesh, {
      color: PALETTE.grass,
      outline: false,
      castShadow: false,
      receiveShadow: true,
    });
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
  }

  dispose(): void {
    // Материал не трогаем: он общий, живёт в кэше render/style.ts
    // и может быть занят другими объектами сцены
    this.mesh.geometry.dispose();
  }
}
