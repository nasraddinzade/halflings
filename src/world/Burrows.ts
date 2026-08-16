import * as THREE from 'three';

import { PALETTE } from '../config/palette';
import { applyStyle } from '../render/style';
import { buildBurrows } from './burrow/build';
import { valleyFloor } from './heightfield';
import type { Circle } from './Obstacles';

/**
 * Норы: холм даёт рельеф, фасад и столярку — генератор в burrow/.
 *
 * Тени нора не отбрасывает намеренно. Фасад лежит заподлицо с холмом,
 * солнце скользит вдоль него, и карта теней при 1.4 см на тексель
 * размазывала от наличника грязные пятна по всему склону. Тень на землю
 * здесь ничего не добавляет, а артефакты убирает целиком.
 */
export class Burrows {
  readonly group = new THREE.Group();
  readonly blockers: Circle[];

  constructor() {
    this.group.name = 'burrows';

    const built = buildBurrows(valleyFloor);
    this.blockers = built.blockers;

    const mounds = new THREE.Mesh(built.mounds);
    mounds.name = 'burrow_mounds';
    this.group.add(mounds);
    // Холм — часть пейзажа, поэтому без обводки, как и земля.
    // Тень отбрасывает, но не принимает: ниша под дверь утоплена, купол
    // затеняет сам себя, и при 1.4 см на тексель это не мягкое
    // затемнение, а жёсткая тёмная дуга поперёк всего фасада.
    applyStyle(mounds, {
      color: PALETTE.grass,
      vertexColors: true,
      outline: false,
      castShadow: true,
      receiveShadow: false,
    });

    for (const [color, geometry] of built.parts) {
      const mesh = new THREE.Mesh(geometry);
      mesh.name = `burrow_part_${color.toString(16)}`;
      this.group.add(mesh);
      // Столярка лежит в нише: тень на неё падала бы от её же краёв
      applyStyle(mesh, { color, outline: true, castShadow: false, receiveShadow: false });
    }
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
  }
}
