import * as THREE from 'three';

import {
  WIND_BIAS,
  WIND_DIRECTION,
  WIND_FLUTTER,
  WIND_FLUTTER_SPEED,
  WIND_GUST_LENGTH,
  WIND_GUST_SPEED,
} from '../config/constants';

/**
 * Wind, as a term in the vertex shader.
 *
 * Thirty thousand grass tufts cannot be moved from JavaScript: that would
 * be thirty thousand matrix writes and an instance buffer upload every
 * frame. Instead the geometry is left alone and the GPU displaces the
 * vertices as it draws them, driven by a single number that advances with
 * the clock. The cost is one uniform update per frame, no matter how much
 * vegetation there is — no extra draw calls, no extra memory, no CPU.
 *
 * three does not expose a slot for this, so the stock toon shader is
 * patched through onBeforeCompile, the same way the river waves are done
 * (world/River.ts). The tuning values are baked into the source as
 * literals rather than passed as uniforms: they never change at runtime,
 * and a literal lets the compiler fold the arithmetic.
 *
 * Everything animated shares uWindTime. That is the point of the module:
 * when smoke or a flag is added later, the same clock makes them lean
 * into the same gust that is bending the grass, and a scene where the
 * motion agrees with itself reads as authored rather than assembled.
 */

export interface WindProfile {
  /**
   * Distinguishes the compiled program. Two profiles bake different
   * numbers into the source, so they must not share a cache entry.
   */
  key: string;
  /** Height of the tallest vertex in local space; the bend is weighted by it. */
  height: number;
  /** Peak sideways travel at that height, as a share of it. */
  sway: number;
}

/** The one clock. Everything that moves with the wind reads it. */
const uniforms = { uWindTime: { value: 0 } };

export function advanceWind(delta: number): void {
  uniforms.uWindTime.value += delta;
}

/**
 * Worst-case sideways travel, in metres.
 *
 * Chunk bounding spheres are deliberately tight — that was the whole
 * point of chunking the vegetation — so displaced vertices poke outside
 * their own sphere and the chunk blinks out at the edge of the screen
 * while it is still visible. The radius has to grow by this much.
 */
export function maxSway(profile: WindProfile): number {
  const amplitude = profile.height * profile.sway;
  // along: bias + both gust terms at their peak + flutter; across: flutter
  const along = WIND_BIAS + 1 + WIND_FLUTTER;
  const across = SIDE_SHARE;
  return amplitude * Math.hypot(along, across);
}

/** How much of the sway goes across the wind rather than along it. */
const SIDE_SHARE = 0.35;

/**
 * A copy of `base` that sways. Always a copy, never the original:
 * toonSurface() hands out one cached material per colour, so grass, bushes
 * and every future white object are literally the same object. Patching it
 * in place would set the whole scene swaying.
 */
export function windMaterial<T extends THREE.Material>(base: T, profile: WindProfile): T {
  const material = base.clone() as T;
  patch(material, profile);
  return material;
}

/**
 * Depth material for the shadow pass.
 *
 * The shadow map is drawn with a separate, much simpler shader that knows
 * nothing about our displacement. Without this a swaying crown would throw
 * a rigid shadow — the tree moves and its shadow stands still, which is
 * more obviously wrong than no wind at all.
 */
export function windDepthMaterial(profile: WindProfile): THREE.MeshDepthMaterial {
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  patch(material, profile);
  return material;
}

function patch(material: THREE.Material, profile: WindProfile): void {
  const glsl = shader(profile);

  material.onBeforeCompile = (compiled) => {
    compiled.uniforms['uWindTime'] = uniforms.uWindTime;
    compiled.vertexShader = compiled.vertexShader
      .replace('#include <common>', `#include <common>\n${glsl.common}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${glsl.vertex}`);
  };

  // three keys its program cache on material parameters, and
  // onBeforeCompile is not one of them. Without a key of its own the grass
  // could be handed the bush's program — or hand its own to a plain toon
  // material, and every white surface in the valley would start bending
  material.customProgramCacheKey = () => `wind-${profile.key}`;
  material.needsUpdate = true;
}

function shader(profile: WindProfile): { common: string; vertex: string } {
  const n = (value: number): string => value.toFixed(5);

  const dirX = n(Math.cos(WIND_DIRECTION));
  const dirZ = n(Math.sin(WIND_DIRECTION));
  const frequency = n((Math.PI * 2) / WIND_GUST_LENGTH);
  const amplitude = n(profile.height * profile.sway);

  const common = `
uniform float uWindTime;

// Sideways offset, in world axes, for a plant rooted at \`at\` (world xz),
// taken at height weight \`w\`.
vec2 windOffset( vec2 at, float w ) {
  vec2 dir = vec2( ${dirX}, ${dirZ} );
  vec2 side = vec2( -dir.y, dir.x );

  // The gust is a wave rolling across the valley: its phase depends on how
  // far along the wind the plant stands, so a crest visibly crosses the
  // field. Drop the position term and the whole meadow breathes in unison,
  // which reads as a pulse, not as weather.
  float travel = dot( at, dir ) * ${frequency} - uWindTime * ${n(WIND_GUST_SPEED)};
  // Two frequencies at an incommensurate ratio: one sine alone has an
  // obvious period once you have watched it for a few seconds.
  float gust = sin( travel ) * 0.62 + sin( travel * 2.3 + 1.7 ) * 0.38;

  // Much faster, and keyed to the plant's own position rather than to the
  // gust. Without it neighbours move as one sheet of cloth.
  float flutter = sin( uWindTime * ${n(WIND_FLUTTER_SPEED)} + at.x * 3.1 + at.y * 2.7 );

  float along = ( ${n(WIND_BIAS)} + gust + flutter * ${n(WIND_FLUTTER)} ) * w;
  float across = flutter * w * ${n(SIDE_SHARE)};
  return ( dir * along + side * across ) * ${amplitude};
}`;

  const vertex = `
{
  #ifdef USE_INSTANCING
    vec3 windAt = ( modelMatrix * instanceMatrix[ 3 ] ).xyz;
    vec2 windCol0 = instanceMatrix[ 0 ].xz;
    vec2 windCol2 = instanceMatrix[ 2 ].xz;
  #else
    vec3 windAt = ( modelMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
    vec2 windCol0 = modelMatrix[ 0 ].xz;
    vec2 windCol2 = modelMatrix[ 2 ].xz;
  #endif

  // Squared, so the bend is a cantilever: nothing at the root, most of it
  // at the tip. A uniform offset would slide the whole tuft sideways and
  // tear it out of the ground it grows from.
  float windW = clamp( transformed.y / ${n(profile.height)}, 0.0, 1.0 );
  windW *= windW;

  vec2 windWorld = windOffset( windAt.xz, windW );

  // windWorld is in world axes, but \`transformed\` is still in the
  // instance's own space, and every instance carries a random yaw and a
  // scale. Added as is, each tuft would bend whichever way it happens to
  // be turned. The xz block of the instance matrix is a rotation times a
  // scale that is equal on x and z, and the inverse of that is its
  // transpose over the squared scale — so no inverse() is needed, and the
  // world displacement comes out the same for every instance.
  float windS2 = dot( windCol0, windCol0 );
  transformed.xz += vec2( dot( windCol0, windWorld ), dot( windCol2, windWorld ) ) / windS2;
}`;

  return { common, vertex };
}
