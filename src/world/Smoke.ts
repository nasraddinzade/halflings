import * as THREE from 'three';

import {
  SMOKE_DRIFT,
  SMOKE_END_RADIUS,
  SMOKE_LIFETIME,
  SMOKE_OPACITY,
  SMOKE_PUFFS,
  SMOKE_RISE,
  SMOKE_START_RADIUS,
  WIND_BIAS,
  WIND_DIRECTION,
  WIND_GUST_LENGTH,
  WIND_GUST_SPEED,
} from '../config/constants';
import { PALETTE } from '../config/palette';
import { windTime } from '../render/wind';

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
export class Smoke {
  readonly mesh: THREE.InstancedMesh;

  constructor(chimneys: readonly THREE.Vector3[]) {
    const count = chimneys.length * SMOKE_PUFFS;
    const geometry = new THREE.IcosahedronGeometry(1, 0);

    // Two numbers per puff: where it is in its life, and a shape seed so
    // no two are the same lump drifting in formation
    const phase = new Float32Array(count);
    const seed = new Float32Array(count);
    for (let c = 0; c < chimneys.length; c++) {
      for (let p = 0; p < SMOKE_PUFFS; p++) {
        const i = c * SMOKE_PUFFS + p;
        // Evenly spread along the plume, nudged per chimney so the six of
        // them do not puff in lockstep
        phase[i] = (p / SMOKE_PUFFS + c * 0.37) % 1;
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
    material.uniforms['uSmoke'] = { value: new THREE.Color(PALETTE.smoke) };
    material.uniforms['uSmokeShade'] = { value: new THREE.Color(PALETTE.smokeShade) };

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
      for (let p = 0; p < SMOKE_PUFFS; p++) {
        // Translation only. Scale and offset change over a puff's life,
        // so they belong in the shader, not in a matrix written once
        matrix.makeTranslation(mouth.x, mouth.y, mouth.z);
        this.mesh.setMatrixAt(c * SMOKE_PUFFS + p, matrix);
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
  const dirX = n(Math.cos(WIND_DIRECTION));
  const dirZ = n(Math.sin(WIND_DIRECTION));
  const gustFrequency = n((Math.PI * 2) / WIND_GUST_LENGTH);

  return `
#include <common>
#include <fog_pars_vertex>

uniform float uWindTime;

attribute float aPhase;
attribute float aSeed;

varying float vLife;
varying vec3 vNormalWorld;

void main() {
  // One puff's life, 0 at the chimney mouth and 1 where it is gone.
  vLife = fract( uWindTime / ${n(SMOKE_LIFETIME)} + aPhase );

  // The anchor is the chimney mouth: the instance matrix is a pure
  // translation, so its fourth column is that point in world space.
  vec3 mouth = instanceMatrix[ 3 ].xyz;

  vec2 dir = vec2( ${dirX}, ${dirZ} );
  // The same gust the grass reads, sampled at the chimney rather than at
  // the puff — a plume leans as one thing, it does not ripple along itself
  float travel = dot( mouth.xz, dir ) * ${gustFrequency} - uWindTime * ${n(WIND_GUST_SPEED)};
  float gust = sin( travel ) * 0.62 + sin( travel * 2.3 + 1.7 ) * 0.38;
  float lean = ${n(WIND_BIAS)} + gust;

  // Rising slows a little as the puff cools and spreads, but only a
  // little: sqrt() threw the first puff a third of the way up the column
  // on its own and left a gap at the mouth. Drift builds up faster,
  // because the longer it is in the air the more of the wind it has felt
  float rise = ${n(SMOKE_RISE)} * pow( vLife, 0.85 );
  vec2 drift = dir * ( ${n(SMOKE_DRIFT)} * lean * vLife * vLife );
  // A slow curl so the column is not a ruler, and so consecutive puffs
  // do not sit on one axis where their seams would line up
  float curl = sin( vLife * 5.0 + aSeed * 6.2831 ) * 0.34 * vLife;

  float radius = mix( ${n(SMOKE_START_RADIUS)}, ${n(SMOKE_END_RADIUS)}, vLife );
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
  float alpha = ${SMOKE_OPACITY.toFixed(3)} * rising * gone * gone;

  gl_FragColor = vec4( color, alpha );

  #include <colorspace_fragment>
  #include <fog_fragment>
}`;
