import * as THREE from 'three';

import {
  SMOKE_DRIFT,
  SMOKE_END_RADIUS,
  SMOKE_LIFETIME,
  SMOKE_OPACITY,
  SMOKE_PUFFS,
  SMOKE_RISE,
  SMOKE_GUST_RATE,
  SMOKE_GUST_SHARE,
  SMOKE_LEAN,
  SMOKE_START_RADIUS,
  SPRAY_END_RADIUS,
  SPRAY_LIFETIME,
  SPRAY_OPACITY,
  SPRAY_PUFFS,
  SPRAY_RISE,
  SPRAY_START_RADIUS,
  WIND_ENABLED,
} from '../config/constants';
import { PALETTE } from '../config/palette';
import { gustGLSL, windTime } from '../render/wind';

/**
 * Smoke from the burrow chimneys.
 *
 * The cheapest "somebody lives here" signal there is, and the pipe that
 * carries it was already modelled and doing nothing. Six plumes read from
 * eighty metres, which is exactly the distance at which the valley
 * otherwise looks like a kit laid out on a table.
 *
 * Blobs rather than sprites or points. A toon frame has no soft edges
 * anywhere else in it, so a soft particle would be the one blurred thing
 * on screen — and the usual failure of low-poly smoke is that it reads as
 * floating dumplings, which is a reason to use few and large ones, not a
 * reason to use round ones.
 *
 * Nothing moves on the CPU. Every puff's whole life is a function of one
 * shared clock and its own birth offset, so the cost is a uniform write
 * per frame however many chimneys the valley grows.
 *
 * The clock is the wind's, not its own. That is the point of sharing it:
 * the gust that lays the grass over leans the plumes at the same instant,
 * and a scene whose motion agrees with itself reads as authored.
 */
/** What a plume is: the numbers that differ between smoke and spray. */
export interface PlumeKind {
  puffs: number;
  lifetime: number;
  rise: number;
  drift: number;
  startRadius: number;
  endRadius: number;
  opacity: number;
  color: number;
  shade: number;
}

export const CHIMNEY_SMOKE: PlumeKind = {
  puffs: SMOKE_PUFFS,
  lifetime: SMOKE_LIFETIME,
  rise: SMOKE_RISE,
  drift: SMOKE_DRIFT,
  startRadius: SMOKE_START_RADIUS,
  endRadius: SMOKE_END_RADIUS,
  opacity: SMOKE_OPACITY,
  color: PALETTE.smoke,
  shade: PALETTE.smokeShade,
};

/**
 * Spray at the foot of the mill wheel.
 *
 * Short-lived, small, and it does not drift: thrown water falls where it
 * was thrown. It exists because a wheel touching an opaque water plane
 * reads as a wheel resting on one — the geometry was measured right and
 * still looked wrong, and this is the part that says the two are in
 * contact.
 */
export const WHEEL_SPRAY: PlumeKind = {
  puffs: SPRAY_PUFFS,
  lifetime: SPRAY_LIFETIME,
  rise: SPRAY_RISE,
  drift: 0,
  startRadius: SPRAY_START_RADIUS,
  endRadius: SPRAY_END_RADIUS,
  opacity: SPRAY_OPACITY,
  color: PALETTE.smoke,
  shade: PALETTE.water,
};

export class Smoke {
  readonly mesh: THREE.InstancedMesh;

  constructor(chimneys: readonly THREE.Vector3[], kind: PlumeKind = CHIMNEY_SMOKE) {
    const count = chimneys.length * kind.puffs;
    const geometry = new THREE.IcosahedronGeometry(1, 0);

    // Two numbers per puff: where it is in its life, and a shape seed so
    // no two are the same lump drifting in formation
    const phase = new Float32Array(count);
    const seed = new Float32Array(count);
    for (let c = 0; c < chimneys.length; c++) {
      for (let p = 0; p < kind.puffs; p++) {
        const i = c * kind.puffs + p;
        // Evenly spread along the plume, nudged per chimney so the six of
        // them do not puff in lockstep
        phase[i] = (p / kind.puffs + c * 0.37) % 1;
        seed[i] = ((c * 7 + p * 13) % 17) / 17;
      }
    }
    geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    geometry.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));

    const material = new THREE.ShaderMaterial({
      transparent: true,
      // Puffs overlap constantly. Writing depth would make each one carve
      // a hole in the plume behind it
      depthWrite: false,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib['fog']]),
      vertexShader: vertex(),
      fragmentShader: FRAGMENT,
    });
    // After the merge, not inside it: merge clones, and a cloned clock
    // would tick on its own and drift away from the grass
    material.uniforms['uWindTime'] = windTime;
    material.uniforms['uSmoke'] = { value: new THREE.Color(kind.color) };
    material.uniforms['uSmokeShade'] = { value: new THREE.Color(kind.shade) };
    // Uniforms, not literals baked into the source. Baked, spray with its
    // own lifetime would compile a second shader program for the same
    // twelve lines of GLSL — the trap Water.ts already had to be dug out
    // of. As uniforms both plumes share one program and differ by value
    material.uniforms['uLifetime'] = { value: kind.lifetime };
    material.uniforms['uRise'] = { value: kind.rise };
    material.uniforms['uDrift'] = { value: kind.drift };
    material.uniforms['uStartRadius'] = { value: kind.startRadius };
    material.uniforms['uEndRadius'] = { value: kind.endRadius };
    material.uniforms['uOpacity'] = { value: kind.opacity };

    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.name = 'smoke';
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = false;
    // Never goes through applyStyle, so it never gets an outline — a dark
    // rim around something meant to be half-transparent air.
    //
    // Culling is off because the instance matrices say every puff sits on
    // its chimney, while the shader has them three metres up and drifting.
    // The bounding sphere would be a lie, and the plumes would vanish at
    // the edge of the screen. One draw call of 720 triangles is cheaper
    // than any correct answer to that
    this.mesh.frustumCulled = false;

    const matrix = new THREE.Matrix4();
    for (let c = 0; c < chimneys.length; c++) {
      const mouth = chimneys[c];
      if (mouth === undefined) continue;
      for (let p = 0; p < kind.puffs; p++) {
        // Translation only. Scale and offset change over a puff's life,
        // so they belong in the shader, not in a matrix written once
        matrix.makeTranslation(mouth.x, mouth.y, mouth.z);
        this.mesh.setMatrixAt(c * kind.puffs + p, matrix);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.dispose();
  }
}

function vertex(): string {
  const n = (value: number): string => value.toFixed(5);
  // With the wind switched off the plume goes straight up rather than
  // leaning on a gust that is not blowing
  const lean = WIND_ENABLED
    ? `${n(SMOKE_LEAN)} + windGust( mouth.xz, birth * ${n(SMOKE_GUST_RATE)}, 0.0 ) * ${n(SMOKE_GUST_SHARE)}`
    : '0.0';

  return `
#include <common>
#include <fog_pars_vertex>

uniform float uWindTime;
uniform float uLifetime;
uniform float uRise;
uniform float uDrift;
uniform float uStartRadius;
uniform float uEndRadius;

${gustGLSL()}

attribute float aPhase;
attribute float aSeed;

varying float vLife;
varying vec3 vNormalWorld;

void main() {
  // One puff's life, 0 at the chimney mouth and 1 where it is gone.
  vLife = fract( uWindTime / uLifetime + aPhase );

  // The anchor is the chimney mouth: the instance matrix is a pure
  // translation, so its fourth column is that point in world space.
  vec3 mouth = instanceMatrix[ 3 ].xyz;

  vec2 dir = windDirection();
  // The wind this puff left the chimney in, frozen. Read at the present
  // instant instead, every puff shares one value and the whole plume
  // swings like a wiper; frozen at birth, the column carries the history
  // of the gust up itself, which is what a plume actually is.
  float birth = uWindTime - vLife * uLifetime;
  float lean = ${lean};

  // Rising slows a little as the puff cools and spreads, but only a
  // little: sqrt() threw the first puff a third of the way up the column
  // on its own and left a gap at the mouth. Drift builds up faster,
  // because the longer it is in the air the more of the wind it has felt
  float rise = uRise * pow( vLife, 0.85 );
  vec2 drift = dir * ( uDrift * lean * vLife * vLife );
  // A slow curl so the column is not a ruler, and so consecutive puffs
  // do not sit on one axis where their seams would line up
  float curl = sin( vLife * 5.0 + aSeed * 6.2831 ) * 0.34 * vLife;

  float radius = mix( uStartRadius, uEndRadius, vLife );
  // Lumps, not spheres: squash each puff differently on its own axes
  vec3 lump = vec3( 1.0 + aSeed * 0.35, 0.82, 1.0 - aSeed * 0.3 );

  vec3 local = position * lump * radius;
  vec3 offset = vec3( drift.x + curl, rise, drift.y - curl );

  // instanceMatrix is translation only, so adding here lands the puff at
  // mouth + offset with the lump around it
  vec3 transformed = local + offset;
  vNormalWorld = normalize( normal / lump );

  vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4( transformed, 1.0 );
  gl_Position = projectionMatrix * mvPosition;

  #include <fog_vertex>
}`;
}

const FRAGMENT = `
#include <common>
#include <fog_pars_fragment>

uniform float uOpacity;

uniform vec3 uSmoke;
uniform vec3 uSmokeShade;

varying float vLife;
varying vec3 vNormalWorld;

void main() {
  // Two tones with a hard edge between them, the same vocabulary as the
  // three lighting steps. No light is sampled: smoke this thin scatters
  // rather than catching a terminator, and a lit blob would sit oddly
  // against the flat sky behind it.
  float up = dot( normalize( vNormalWorld ), vec3( 0.0, 1.0, 0.0 ) );
  vec3 color = mix( uSmokeShade, uSmoke, step( 0.05, up ) );

  // Up fast out of the pipe, then a long dissolve. Squared on the way out
  // so the tail thins rather than switching off.
  float rising = smoothstep( 0.0, 0.12, vLife );
  float gone = 1.0 - vLife;
  float alpha = uOpacity * rising * gone * gone;

  gl_FragColor = vec4( color, alpha );

  // three's own order is tonemapping then colorspace then fog. Tone
  // mapping is off today, so this chunk expands to nothing — but leaving
  // it out would make the smoke one of the only surfaces in the frame not
  // mapped on the day it is switched on
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
