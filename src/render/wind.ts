import * as THREE from 'three';

import {
  WIND_BIAS,
  WIND_DIRECTION,
  WIND_FLUTTER_SPEED,
  WIND_GUST_LENGTH,
  WIND_GUST_SPEED,
  WIND_PHASE_SPREAD,
  WIND_STIFFNESS_SPREAD,
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
  /**
   * Local-space height at which the bend reaches full strength.
   *
   * This is the shape parameter that matters most, and getting it wrong
   * is what made the first pass look like rubber. Below the pivot the
   * plant bends; above it every vertex moves by the same amount, so that
   * part travels rigidly. For a blade of grass the pivot is the tip —
   * the whole blade should curve. For a tree it is the base of the
   * crown: the trunk bends and the crown balls are carried along
   * undeformed. Put the pivot at the top of a tree instead and the
   * crown's underside lags behind its top, which on a faceted ball
   * reads as the thing inflating and deflating.
   */
  pivot: number;
  /** Sideways travel at full bend, in metres. */
  amplitude: number;
  /** Share of the motion that is fast per-plant jitter, not gust. */
  flutter: number;
  /** Multiplier on the clock. Heavy things swing slowly. */
  rate: number;
}

/**
 * The one clock. Everything that moves with the wind reads this exact
 * object, so a gust that bends the grass leans the smoke at the same
 * moment — which is the whole reason the module exists rather than the
 * vegetation keeping a clock of its own.
 */
export const windTime = { value: 0 };

/**
 * Advanced once per frame from the game loop, unconditionally. Do not
 * gate this on WIND_ENABLED: the chimney smoke reads the same clock for
 * its own animation and would freeze in mid-air.
 */
export function advanceWind(delta: number): void {
  windTime.value += delta;
}

/**
 * The gust wave, as GLSL. Anything that leans with the wind has to go
 * through this exact function.
 *
 * Sharing the clock is only half of what makes the scene agree with
 * itself — the curve has to be shared too. The smoke used to carry its
 * own hand-copied copy of these two sines, which agreed with the grass by
 * coincidence and would have stopped agreeing, silently and with no
 * compile error, the first time either was retuned.
 *
 * `t` is deliberately a parameter rather than the clock: grass reads the
 * gust at the present instant, smoke reads it at the moment each puff
 * left the chimney and on a slower scale, and both are the same wave.
 */
export function gustGLSL(): string {
  const n = (value: number): string => value.toFixed(5);
  return `
vec2 windDirection() {
  return vec2( ${n(Math.cos(WIND_DIRECTION))}, ${n(Math.sin(WIND_DIRECTION))} );
}

// A wave rolling across the valley: the phase depends on how far along
// the wind you stand, so a crest visibly crosses the field. Drop the
// position term and everything breathes at once. Two frequencies at an
// incommensurate ratio, because one sine alone has an obvious period once
// you have watched it for a few seconds.
float windGust( vec2 at, float t, float phase ) {
  float travel = dot( at, windDirection() ) * ${n((Math.PI * 2) / WIND_GUST_LENGTH)}
    - t * ${n(WIND_GUST_SPEED)} + phase;
  return sin( travel ) * 0.62 + sin( travel * 2.3 + 1.7 ) * 0.38;
}`;
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
  // along: bias + both gust terms at their peak + flutter; across: flutter.
  // Both taken at the stiffest a plant is allowed to be.
  const along = WIND_BIAS + 1 + profile.flutter;
  const across = profile.flutter * SIDE_SHARE;
  const stiffest = 1 + WIND_STIFFNESS_SPREAD;
  return profile.amplitude * stiffest * Math.hypot(along, across);
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
    compiled.uniforms['uWindTime'] = windTime;
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

  const common = `
uniform float uWindTime;

${gustGLSL()}

// One pseudo-random number per plant, from where it is rooted. Two plants
// never share a spot, so this is stable and needs no extra attribute.
float windHash( vec2 at ) {
  return fract( sin( dot( at, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
}

// Sideways offset, in world axes, for a plant rooted at \`at\` (world xz),
// taken at bend weight \`w\`.
vec2 windOffset( vec2 at, float w ) {
  vec2 dir = windDirection();
  vec2 side = vec2( -dir.y, dir.x );

  // Each plant gets its own phase and its own stiffness. The gust below
  // is a smooth function of position, so without this every plant the
  // same distance along the wind moves exactly alike and the field
  // twitches as one body. The phase offset stays small on purpose:
  // scatter it fully and the travelling gust stops being readable.
  float h = windHash( at );
  float stiffness = 1.0 + ( h - 0.5 ) * ${n(WIND_STIFFNESS_SPREAD * 2)};
  float phase = h * 6.28318;

  float t = uWindTime * ${n(profile.rate)};

  float gust = windGust( at, t, phase * ${n(WIND_PHASE_SPREAD)} );

  // Much faster, and keyed to the plant itself rather than to the gust.
  // Grass has plenty of it, a tree has none: a three-metre crown that
  // jitters looks like a bush glued to a stick.
  float flutter = sin( t * ${n(WIND_FLUTTER_SPEED)} + phase * 6.0 );

  float along = ( ${n(WIND_BIAS)} + gust + flutter * ${n(profile.flutter)} ) * w * stiffness;
  float across = flutter * w * stiffness * ${n(profile.flutter * SIDE_SHARE)};
  return ( dir * along + side * across ) * ${n(profile.amplitude)};
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
  // near the pivot. A uniform offset would slide the whole plant sideways
  // and tear it out of the ground it grows from.
  //
  // The clamp is what keeps anything above the pivot rigid. That is the
  // difference between a tree crown that is carried by its trunk and one
  // that stretches and squashes every time the wind changes its mind.
  float windW = clamp( transformed.y / ${n(profile.pivot)}, 0.0, 1.0 );
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
