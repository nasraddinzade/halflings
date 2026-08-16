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

    const face = new THREE.Mesh(built.face);
    face.name = 'burrow_faces';
    this.group.add(face);
    applyStyle(face, {
      color: PALETTE.plaster,
      vertexColors: true,
      outline: false,
      castShadow: false,
      receiveShadow: true,
    });

    for (const [color, geometry] of built.parts) {
      const mesh = new THREE.Mesh(geometry);
      mesh.name = `burrow_part_${color.toString(16)}`;
      this.group.add(mesh);
      applyStyle(mesh, { color, outline: true, castShadow: false, receiveShadow: true });
    }
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
  }
}
