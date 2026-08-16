import * as THREE from 'three';

import { OUTLINE_DARKEN, OUTLINE_THICKNESS } from '../config/constants';

/**
 * Inverted hull outline (decision #5).
 *
 * The idea: a copy of the mesh is placed beside it, inflated along the
 * normals and drawn with back faces only. The copy's front faces are
 * culled, so all that shows is what sticks out past the original's
 * silhouette — and that reads as an outline. No post-processing needed,
 * it works on any hardware and costs one extra draw call per object.
 *
 * The subtleties that break a naive implementation:
 *
 * 1. Inflate in view space, not in local space. The player model is
 *    scaled to 0.5, and in local coordinates its outline would come out
 *    twice as thin as on objects at natural size.
 * 2. Compute the normal ourselves rather than via the
 *    `defaultnormal_vertex` chunk: with `side: BackSide` three sets
 *    FLIP_SIDED and flips it, so the copy would inflate inwards and the
 *    outline would disappear.
 * 3. Inflate along a smoothed normal, not the one the shader shades with.
 *    On KayKit heads 23–45% of the vertices sit on hard-edge seams: several
 *    vertices at one point with different normals, up to 148° apart. Along
 *    such normals the hull splits open, and through the gaps you see its
 *    own dark back faces — like dirty smudges around the eyes and mouth.
 *    Averaging the normals over coincident positions makes the hull solid.
 * 4. For skinned meshes the copy shares the skeleton with the original —
 *    otherwise the outline would not keep up with the animation.
 * 5. If the object has a texture, the outline samples that same texture
 *    and darkens it — then it really is "a darkened version of the
 *    object's own colour" and not one shared dark tone. The texture has
 *    to be decoded by hand: three does not do it for us in a custom
 *    shader, and without sRGBTransferEOTF the colour would be off.
 */

const vertexShader = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
#include <fog_pars_vertex>

uniform float thickness;

/** Normal averaged over coincident positions: no splits at the seams. */
attribute vec3 smoothNormal;

#ifdef OUTLINE_USE_MAP
varying vec2 vOutlineUv;
#endif

void main() {
  #include <beginnormal_vertex>

  // Swap the normal in before skinning so the bones rotate it as well
  objectNormal = smoothNormal;

  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>

  // Our own normal in view space, without FLIP_SIDED
  vec3 outlineNormal = normalize( normalMatrix * objectNormal );

  vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
  mvPosition.xyz += outlineNormal * thickness;

  gl_Position = projectionMatrix * mvPosition;

  #ifdef OUTLINE_USE_MAP
  vOutlineUv = uv;
  #endif

  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
// colorspace_pars_fragment is not included: three prepends it to every
// fragment shader on its own, and an explicit include would duplicate the
// function bodies — the shader would fail to compile
#include <fog_pars_fragment>

uniform vec3 outlineColor;
uniform float darkenFactor;

#ifdef OUTLINE_USE_MAP
uniform sampler2D outlineMap;
varying vec2 vOutlineUv;
#endif

void main() {
  #ifdef OUTLINE_USE_MAP
  // The texture is in sRGB, but the maths must be done in linear space
  vec3 base = sRGBTransferEOTF( texture2D( outlineMap, vOutlineUv ) ).rgb;
  #else
  vec3 base = outlineColor;
  #endif

  gl_FragColor = vec4( base * darkenFactor, 1.0 );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Materials are cached: one program per colour or per texture. */
const materials = new Map<string, THREE.ShaderMaterial>();

function outlineMaterial(
  color: number,
  thickness: number,
  map: THREE.Texture | null,
): THREE.ShaderMaterial {
  const key = map === null ? `c${color}:${thickness}` : `m${map.uuid}:${thickness}`;
  const cached = materials.get(key);
  if (cached !== undefined) return cached;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    // clone, not merge: merge mangles Color objects, and fog brings its
    // own uniforms, without which the fog_* chunks will not compile
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      thickness: { value: thickness },
      darkenFactor: { value: OUTLINE_DARKEN },
      outlineColor: { value: new THREE.Color(color) },
      outlineMap: { value: map },
    },
    defines: map === null ? {} : { OUTLINE_USE_MAP: '' },
    side: THREE.BackSide,
    fog: true,
  });

  materials.set(key, material);
  return material;
}

/**
 * Computes the smoothNormal attribute: normals averaged over vertices that
 * sit at the same point. The attribute goes into the geometry shared with
 * the original — the toon material simply never reads it.
 */
function ensureSmoothNormals(geometry: THREE.BufferGeometry): void {
  if (geometry.getAttribute('smoothNormal') !== undefined) return;

  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');

  // Rounded to 1e-5: the exporter writes float32, so exact matches cannot
  // be expected, and at this tolerance neighbouring vertices do not yet
  // stick together
  const keyOf = (i: number): string =>
    `${Math.round(position.getX(i) * 1e5)},${Math.round(position.getY(i) * 1e5)},${Math.round(position.getZ(i) * 1e5)}`;

  const sums = new Map<string, THREE.Vector3>();
  const keys: string[] = new Array<string>(position.count);

  for (let i = 0; i < position.count; i++) {
    const key = keyOf(i);
    keys[i] = key;
    const existing = sums.get(key);
    if (existing === undefined) {
      sums.set(key, new THREE.Vector3(normal.getX(i), normal.getY(i), normal.getZ(i)));
    } else {
      existing.x += normal.getX(i);
      existing.y += normal.getY(i);
      existing.z += normal.getZ(i);
    }
  }

  const data = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const key = keys[i];
    const sum = key === undefined ? undefined : sums.get(key);
    if (sum === undefined) continue;
    // A zero sum is possible with opposing normals — keep our own then
    const length = sum.length();
    if (length < 1e-6) {
      data[i * 3] = normal.getX(i);
      data[i * 3 + 1] = normal.getY(i);
      data[i * 3 + 2] = normal.getZ(i);
    } else {
      data[i * 3] = sum.x / length;
      data[i * 3 + 1] = sum.y / length;
      data[i * 3 + 2] = sum.z / length;
    }
  }

  geometry.setAttribute('smoothNormal', new THREE.BufferAttribute(data, 3));
}

export interface OutlineOptions {
  /** Flat outline colour. Ignored when a texture is passed. */
  color: number;
  /** The object's texture: the outline takes it and darkens it. */
  map?: THREE.Texture | undefined;
  thickness?: number;
}

/**
 * Builds the outline mesh for a single mesh. Returns null if the geometry
 * is unusable (no normals — nothing to inflate along).
 */
export function createOutline(source: THREE.Mesh, options: OutlineOptions): THREE.Mesh | null {
  if (source.geometry.getAttribute('normal') === undefined) return null;
  ensureSmoothNormals(source.geometry);

  const { color, map = null, thickness = OUTLINE_THICKNESS } = options;
  const material = outlineMaterial(color, thickness, map);

  // The copy sits beside the original under the same parent, so it has to
  // repeat the original's local transform: on KayKit it is identity, but
  // we cannot rely on that — props will be different
  const copyTransform = (target: THREE.Object3D): void => {
    target.position.copy(source.position);
    target.quaternion.copy(source.quaternion);
    target.scale.copy(source.scale);
  };

  const finish = (outline: THREE.Mesh): THREE.Mesh => {
    copyTransform(outline);
    outline.frustumCulled = source.frustumCulled;
    // The outline casts no shadow: it is not the object, just its silhouette
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.renderOrder = source.renderOrder - 1;
    outline.name = `${source.name}_outline`;
    return outline;
  };

  if (source instanceof THREE.SkinnedMesh) {
    const outline = new THREE.SkinnedMesh(source.geometry, material);
    finish(outline);
    // Shared skeleton: the copy has no skinning of its own, it repeats the pose
    outline.bind(source.skeleton, source.bindMatrix);
    outline.bindMode = source.bindMode;
    return outline;
  }

  return finish(new THREE.Mesh(source.geometry, material));
}
