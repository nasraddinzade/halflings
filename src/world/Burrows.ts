import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  BURROWS,
  DOOR_CENTER_HEIGHT,
  DOOR_FRAME_RADIUS,
  DOOR_FRAME_TUBE,
  DOOR_RADIUS,
  doorFacing,
  doorPosition,
} from '../config/burrows';
import { PALETTE } from '../config/palette';
import { applyStyle } from '../render/style';
import { heightAt } from './heightfield';

/**
 * Круглые двери нор.
 *
 * Холмы делает рельеф (heightfield.ts), а здесь только фасад: створка,
 * наличник, ручка, тёмная глубина за дверью и порог. Врезать саму
 * дверь в террейн бессмысленно — сетка у него метровая, дверной проём
 * в метр тридцать на ней просто не выразить.
 *
 * Все шесть нор склеиваются в один меш на цвет: шесть отдельных нор
 * стоили бы под тридцать draw call'ов вместе с обводкой, а так их пять.
 */
export class Burrows {
  readonly group = new THREE.Group();

  constructor() {
    this.group.name = 'burrows';

    // По куску геометрии на цвет: внутри цвета всё сливается в один меш
    const byColor = new Map<number, THREE.BufferGeometry[]>();
    const add = (color: number, geometry: THREE.BufferGeometry): void => {
      const bucket = byColor.get(color);
      if (bucket === undefined) byColor.set(color, [geometry]);
      else bucket.push(geometry);
    };

    for (const burrow of BURROWS) {
      const door = doorPosition(burrow);
      const yaw = doorFacing(burrow);
      const base = heightAt(door.x, door.z);

      // Локальная система двери: она смотрит в +Z, потом всё поворачивается
      const place = (geometry: THREE.BufferGeometry): THREE.BufferGeometry => {
        geometry.rotateY(yaw);
        geometry.translate(door.x, base, door.z);
        return geometry;
      };

      // Тёмная подложка под створкой. Сперва здесь был цилиндр вглубь
      // холма — и торчал из склона чёрной плитой: площадка перед дверью
      // срезает землю и на полметра позади дверной плоскости, так что
      // хоронить в холме нечего. Плоский диск задачу решает тем же:
      // по краю створки видна темнота, а снаружи его просто нет,
      // потому что задние грани отсекаются.
      const recess = new THREE.CircleGeometry(DOOR_FRAME_RADIUS, 20);
      recess.translate(0, DOOR_CENTER_HEIGHT, -0.04);
      add(PALETTE.ink, place(recess));

      const panel = new THREE.CircleGeometry(DOOR_RADIUS, 20);
      panel.translate(0, DOOR_CENTER_HEIGHT, 0.02);
      add(PALETTE.wood, place(panel));

      const frame = new THREE.TorusGeometry(DOOR_FRAME_RADIUS, DOOR_FRAME_TUBE, 8, 20);
      frame.translate(0, DOOR_CENTER_HEIGHT, 0);
      add(PALETTE.woodDark, place(frame));

      // Ручка посреди створки — примета круглой двери
      const knob = new THREE.SphereGeometry(0.06, 8, 6);
      knob.translate(0, DOOR_CENTER_HEIGHT, 0.07);
      add(PALETTE.thatch, place(knob));

      const step = new THREE.BoxGeometry(1.5, 0.12, 0.6);
      step.translate(0, 0.05, 0.4);
      add(PALETTE.rock, place(step));
    }

    for (const [color, geometries] of byColor) {
      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();
      if (merged === null) throw new Error('[burrows] не удалось склеить геометрию');

      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged);
      mesh.name = `burrow_parts_${color.toString(16)}`;
      // Сначала в граф, потом стилизация: обводку applyStyle вешает
      // рядом с мешем, то есть родитель ему нужен уже сейчас
      this.group.add(mesh);
      applyStyle(mesh, { color, outline: true });
    }
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
  }
}
