import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { CHARACTER_SCALE, CHARACTERS_RECEIVE_SHADOW } from '../config/constants';
import { PLAYER_MODEL_URL } from '../config/assets';
import { PALETTE } from '../config/palette';
import { applyStyle } from '../render/style';
import type { ZoneAtlas } from '../render/atlas';
import { PLAYER_PART_FILE, type VillagerConfig } from '../config/villagers';

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

  const root = new THREE.Group();
  root.name = 'player';
  root.add(model);

  return { root, model, mixer: new THREE.AnimationMixer(model) };
}

/**
 * Dresses the player out of the project atlas, the same way a villager is.
 *
 * He used to be painted one flat tone with a comment promising that
 * per-part colour would "arrive in step 4, together with assembling
 * villagers from a config". Step 4 arrived; the villagers got their skin,
 * hair, shirt and trousers, and the player was left a solid terracotta
 * silhouette standing among them. In every screenshot of the green he was
 * the only figure in the frame with no face.
 *
 * He is not assembled from parts — he is one file, PLAYER_MODEL_URL, cut
 * from the pack's Rogue — so there is nothing to merge. What he needs is
 * exactly what `mergeSkinned.preparePart` does to a villager's parts:
 * every vertex UV rewritten from the pack's own atlas into a texel of
 * ours. His six meshes carry the pack's names, so which texel each part
 * takes is decided by the same rule the villagers use.
 *
 * With no atlas — villagers switched off — he keeps the flat tone, which
 * is the only thing left to give him.
 */
export function dressPlayer(player: Player, atlas: ZoneAtlas | null, config: VillagerConfig): void {
  if (atlas === null) {
    applyStyle(player.model, {
      color: PALETTE.shirt,
      outline: true,
      receiveShadow: CHARACTERS_RECEIVE_SHADOW,
    });
    return;
  }

  player.model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const variant = variantFor(child.name, config);
    const uv = child.geometry.getAttribute('uv');
    if (uv === undefined) return;
    // The geometry came out of one file and is not shared with anything,
    // so it can be rewritten in place
    for (let i = 0; i < uv.count; i++) {
      const [u, v] = atlas.remap(PLAYER_PART_FILE, variant, uv.getX(i), uv.getY(i));
      uv.setXY(i, u, v);
    }
    uv.needsUpdate = true;
  });

  applyStyle(player.model, {
    // White, because the tone now comes out of the atlas per texel — any
    // other colour here would stain the whole character
    color: 0xffffff,
    map: atlas.texture,
    outline: true,
    receiveShadow: CHARACTERS_RECEIVE_SHADOW,
  });
}

/**
 * Which clothing variant a mesh takes.
 *
 * Sleeves go with the torso, exactly as in buildVillager: a shirt whose
 * arms are a different colour from its body is not a shirt.
 */
function variantFor(meshName: string, config: VillagerConfig): number {
  const name = meshName.toLowerCase();
  if (name.includes('head')) return config.palette.head;
  if (name.includes('leg')) return config.palette.legs;
  return config.palette.body;
}
