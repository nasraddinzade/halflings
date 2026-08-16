import * as THREE from 'three';

import { OUTLINE_DARKEN, TOON_STEPS } from '../config/constants';
import { darken } from '../config/palette';
import { createOutline } from './Outline';

/**
 * The single styling entry point (decision #6). Everything that ends up in
 * the scene goes through applyStyle: the material that came with the asset
 * is thrown away and replaced with a toon one from the project palette.
 */

/**
 * Lighting ramp for MeshToonMaterial.
 *
 * MeshToonMaterial takes the illumination computed the usual way and,
 * instead of applying it smoothly, uses it to look up a colour in this
 * one-dimensional texture. NearestFilter turns the gradient into steps:
 * three texels — three light levels, shadow / midtone / light. Without
 * Nearest we would get the same gradient, only routed through a texture.
 */
function createToonGradient(steps: number): THREE.DataTexture {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    data[i] = Math.round(((i + 1) / steps) * 255);
  }
  const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const gradientMap = createToonGradient(TOON_STEPS);

/** Materials are cached: same colour or same atlas — one program. */
const surfaces = new Map<string, THREE.MeshToonMaterial>();

export function toonSurface(color: number, map: THREE.Texture | null = null): THREE.MeshToonMaterial {
  const key = map === null ? `c${color}` : `m${map.uuid}`;
  const cached = surfaces.get(key);
  if (cached !== undefined) return cached;

  const material = new THREE.MeshToonMaterial({
    // With a texture the colour must be white: MeshToonMaterial multiplies
    // color by map, and any other tint would stain the whole atlas
    color: map === null ? color : 0xffffff,
    gradientMap,
    fog: true,
    ...(map === null ? {} : { map }),
  });
  surfaces.set(key, material);
  return material;
}

/**
 * Material for geometry with the colour baked into the vertices.
 *
 * Trees need it: trunk and crown are different colours, yet it is one
 * instanced mesh. Colouring them separately would mean two InstancedMeshes
 * per chunk — twice the draw calls for the sake of two colours.
 */
let vertexColored: THREE.MeshToonMaterial | null = null;

export function toonVertexColored(): THREE.MeshToonMaterial {
  if (vertexColored === null) {
    vertexColored = new THREE.MeshToonMaterial({
      color: 0xffffff,
      vertexColors: true,
      gradientMap,
      fog: true,
    });
  }
  return vertexColored;
}

export interface StyleOptions {
  /** Colour from the palette. No other colour source is allowed here. */
  color: number;
  /** Colour comes from a vertex attribute, not one flat palette tone. */
  vertexColors?: boolean;
  /** The project atlas — for villagers whose colour is set by the UVs. */
  map?: THREE.Texture | undefined;
  /** Inverted hull outline. The ground needs none — it makes no sense there. */
  outline?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Walks the subtree, swaps the materials and optionally attaches outlines.
 * The outlines are collected into a list and added after the walk: adding
 * children inside traverse means traversing them too.
 *
 * Returns the outlines it created: they get faded out by distance (step 6),
 * and that needs references to them.
 */
export function applyStyle(root: THREE.Object3D, options: StyleOptions): THREE.Mesh[] {
  const {
    color, map, vertexColors = false,
    outline = false, castShadow = true, receiveShadow = true,
  } = options;

  const material = vertexColors ? toonVertexColored() : toonSurface(color, map ?? null);
  // Without a texture the outline is the object's darkened colour; with
  // one it darkens the texture itself, per pixel (see Outline.ts)
  const outlineColor = darken(color, OUTLINE_DARKEN);
  const pending: Array<{ parent: THREE.Object3D; outline: THREE.Mesh }> = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.name.endsWith('_outline')) return;

    child.material = material;
    child.castShadow = castShadow;
    child.receiveShadow = receiveShadow;

    if (!outline) return;
    const hull = createOutline(child, { color: outlineColor, map });
    if (hull !== null && child.parent !== null) {
      pending.push({ parent: child.parent, outline: hull });
    }
  });

  for (const { parent, outline: hull } of pending) parent.add(hull);
  return pending.map((entry) => entry.outline);
}
