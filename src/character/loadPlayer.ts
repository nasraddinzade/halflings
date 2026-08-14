import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { CHARACTER_SCALE, NEUTRAL_CHARACTER } from '../config/constants';
import { PLAYER_MODEL_URL } from '../config/assets';

export interface Player {
  /** Двигают его; модель внутри отмасштабирована и трогать её не нужно. */
  readonly root: THREE.Group;
  readonly model: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
}

/**
 * Загружает базовую модель игрока.
 *
 * Масштаб ставится в коде и только на корне модели: внутри GLB он остаётся
 * родным. Клипы лежат в том же родном масштабе, и если отмасштабировать
 * файл, смещения костей разойдутся со смещениями в треках — ноги начнут
 * проскальзывать, а персонаж проваливаться сквозь землю.
 *
 * Шесть мешей намеренно не склеиваются: склейка (решение №1) нужна для
 * NPC, которых будут десятки. Игрок один, и его шесть draw calls ничего
 * не решают — счётчик на шаге 2 это покажет.
 */
export async function loadPlayer(loader: GLTFLoader): Promise<Player> {
  const gltf = await loader.loadAsync(PLAYER_MODEL_URL);

  const model = gltf.scene;
  model.scale.setScalar(CHARACTER_SCALE);

  // Серый материал вместо паковой текстуры: в срезе оцениваем движение,
  // а не картинку. Свои цвета ассет принесёт не раньше шага 3.
  const material = new THREE.MeshStandardMaterial({
    color: NEUTRAL_CHARACTER,
    roughness: 0.85,
    metalness: 0,
  });

  model.traverse((child) => {
    if (child instanceof THREE.Mesh) {
      child.material = material;
      child.castShadow = true;
      child.receiveShadow = true;
      // Персонаж почти всегда в кадре, а его bounding sphere из-за
      // скиннинга считается по рест-позе и врёт при анимации
      child.frustumCulled = false;
    }
  });

  const root = new THREE.Group();
  root.name = 'player';
  root.add(model);

  return { root, model, mixer: new THREE.AnimationMixer(model) };
}
