import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { CHARACTER_SCALE, CHARACTERS_RECEIVE_SHADOW } from '../config/constants';
import { PLAYER_MODEL_URL } from '../config/assets';
import { PALETTE } from '../config/palette';
import { applyStyle } from '../render/style';

export interface Player {
  /** This is what you move; the model inside is scaled — leave it alone. */
  readonly root: THREE.Group;
  readonly model: THREE.Object3D;
  readonly mixer: THREE.AnimationMixer;
}

/**
 * Loads the base player model.
 *
 * The scale is set in code and only on the model root: inside the GLB it
 * stays native. The clips are authored at that same native scale, and if
 * the file were scaled, bone offsets would diverge from the offsets in the
 * tracks — the feet would start sliding and the character would sink
 * through the ground.
 *
 * The six meshes are deliberately not merged: merging (decision #1) is for
 * the NPCs, of which there will be dozens. There is one player, and his six
 * draw calls decide nothing — the counter in step 2 will show that.
 */
export async function loadPlayer(loader: GLTFLoader): Promise<Player> {
  const gltf = await loader.loadAsync(PLAYER_MODEL_URL);

  const model = gltf.scene;
  model.scale.setScalar(CHARACTER_SCALE);

  // The character is almost always on screen, and because of skinning his
  // bounding sphere is computed from the rest pose and lies once animated.
  // Set this before applyStyle so the outline inherits the same flag.
  model.traverse((child) => {
    if (child instanceof THREE.Mesh) child.frustumCulled = false;
  });

  // The pack texture is thrown away: colour comes only from the palette.
  // For now the whole character is one colour — per-part colouring arrives
  // in step 4, together with assembling villagers from a config.
  applyStyle(model, {
    color: PALETTE.shirt,
    outline: true,
    receiveShadow: CHARACTERS_RECEIVE_SHADOW,
  });

  const root = new THREE.Group();
  root.name = 'player';
  root.add(model);

  return { root, model, mixer: new THREE.AnimationMixer(model) };
}
