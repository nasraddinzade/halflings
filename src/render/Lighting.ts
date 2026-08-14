import * as THREE from 'three';

import { SHADOW_EXTENT, SHADOW_MAP_SIZE } from '../config/constants';

/**
 * Временный свет: нейтральный, без настроения. Задача — видеть форму
 * рельефа и тень под ногами, чтобы судить о попадании в землю. Настоящее
 * освещение приходит на шаге 3 вместе с toon-шейдером.
 */
export class Lighting {
  private readonly sun: THREE.DirectionalLight;
  private readonly sunOffset = new THREE.Vector3(18, 26, 12);

  constructor(scene: THREE.Scene) {
    // Небо сверху, отражённый от земли снизу — дёшево и сразу читаемо
    scene.add(new THREE.HemisphereLight(0xcdd6dd, 0x4a4a46, 1.5));

    this.sun = new THREE.DirectionalLight(0xffffff, 1.9);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(SHADOW_MAP_SIZE);

    // Карта теней покрывает не всю долину, а коробку вокруг игрока:
    // на 256 метров разрешения не хватило бы, тень стала бы кашей
    const shadowCamera = this.sun.shadow.camera;
    shadowCamera.left = -SHADOW_EXTENT;
    shadowCamera.right = SHADOW_EXTENT;
    shadowCamera.top = SHADOW_EXTENT;
    shadowCamera.bottom = -SHADOW_EXTENT;
    shadowCamera.near = 1;
    shadowCamera.far = 90;
    shadowCamera.updateProjectionMatrix();
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.02;

    scene.add(this.sun);
    scene.add(this.sun.target);
  }

  /** Коробка теней едет за игроком, иначе он из неё выйдет. */
  update(focus: THREE.Vector3): void {
    this.sun.target.position.copy(focus);
    this.sun.target.updateMatrixWorld();
    this.sun.position.copy(focus).add(this.sunOffset);
  }
}
