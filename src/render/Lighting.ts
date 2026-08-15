import * as THREE from 'three';

import { SHADOW_EXTENT, SHADOW_MAP_SIZE } from '../config/constants';
import { PALETTE } from '../config/palette';

/**
 * Свет под toon-шейдер.
 *
 * Ступени рампы рисует направленный источник: именно его вклад
 * MeshToonMaterial раскладывает на три уровня. Заполняющий свет держим
 * заметно слабее — подними его, и всё уедет на верхнюю ступень, картинка
 * станет плоской и ступеней вообще не будет видно.
 */
export class Lighting {
  private readonly sun: THREE.DirectionalLight;
  private readonly sunOffset = new THREE.Vector3(18, 26, 12);

  constructor(scene: THREE.Scene) {
    scene.add(new THREE.HemisphereLight(PALETTE.skyBounce, PALETTE.groundBounce, 0.9));

    this.sun = new THREE.DirectionalLight(PALETTE.sunlight, 2.6);
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
    // 2 см были нужны против самозатенения персонажей; теперь они
    // тени не принимают, и большой сдвиг только отрывал бы тень от ног
    this.sun.shadow.normalBias = 0.008;

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
