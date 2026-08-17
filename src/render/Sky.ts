import * as THREE from 'three';

import {
  SKY_RADIUS,
  SKY_STOP_DEGREES,
  SKY_SUN_LIFT,
  SUN_DISC_ANGLE,
  SUN_DISC_FEATHER,
  SUN_GLOW_GAIN,
  SUN_GLOW_INNER,
  SUN_GLOW_OUTER,
} from '../config/constants';
import { PALETTE } from '../config/palette';

/**
 * The sky, as a dome riding with the camera.
 *
 * It replaces scene.background, which was a single flat colour. The camera
 * tilts up to 65 degrees, so the sky is the largest area in most frames —
 * it grades the whole image whether or not anyone looks at it directly.
 *
 * Three things do the work, and none of them is the gradient on its own:
 *
 * 1. A flat plate below the first stop, in exactly the fog colour, so a
 *    fogged ridge dissolves into a sky that matches it at any elevation
 *    the ridge can reach — not at one tuned angle.
 * 2. A lift of the whole ramp towards the sun, so the dome knows which way
 *    it is facing. Without it, turning 180 degrees gave a byte-identical
 *    image and nothing in the sky agreed the sun existed.
 * 3. An aureole added around the sun rather than mixed in, and a small
 *    disc with a soft rim.
 *
 * The first version of this file banded the gradient into five hard steps
 * on the theory that a toon world wants a toon sky. See the note on
 * SKY_STOP_DEGREES for why that was wrong; the short version is that a
 * cel step traces a surface and a sky band traces nothing, which is why
 * the bands bowed into arcs the moment the camera tilted.
 *
 * This is the one surface that does not go through applyStyle. A toon
 * material would light it, and the sky is not a lit object — it emits.
 * Its colours still come from the palette, which is what decision #6
 * actually asks for.
 */
export class Sky {
  readonly mesh: THREE.Mesh;

  constructor(sunDirection: THREE.Vector3) {
    const direction = sunDirection.clone().normalize();
    const geometry = new THREE.SphereGeometry(SKY_RADIUS, 32, 16);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      // Painted first as a backdrop, with everything else drawn over it.
      // Without this the dome would have to be larger than the farthest
      // terrain or it would occlude the hills instead of sitting behind
      // them — and the valley is 256 m across
      depthWrite: false,
      depthTest: false,
      fog: false,
      uniforms: {
        uHaze: { value: new THREE.Color(PALETTE.skyHorizon) },
        uLow: { value: new THREE.Color(PALETTE.skyLow) },
        uMid: { value: new THREE.Color(PALETTE.skyMid) },
        uZenith: { value: new THREE.Color(PALETTE.skyZenith) },
        uSunGlow: { value: new THREE.Color(PALETTE.sunGlow) },
        uSunDisc: { value: new THREE.Color(PALETTE.sunDisc) },
        uSunDirection: { value: direction },
        uSunAzimuth: {
          value: new THREE.Vector2(direction.x, direction.z).normalize(),
        },
      },
      vertexShader: VERTEX,
      fragmentShader: fragment(),
    });

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'sky';
    this.mesh.renderOrder = -1;
    this.mesh.frustumCulled = false;
  }

  /**
   * The dome rides with the camera. It has to: the shader reads a vertex
   * position as a direction, which only holds while the camera is at the
   * centre. Let it stay put and the sky would slide past as you walk.
   */
  update(cameraPosition: THREE.Vector3): void {
    this.mesh.position.copy(cameraPosition);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

const VERTEX = `
varying vec3 vDirection;

void main() {
  // The dome is centred on the camera, so a vertex position is already
  // the direction to look in — no need to reconstruct one.
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}`;

function fragment(): string {
  const n = (value: number): string => value.toFixed(6);
  // The ramp is driven by sin(elevation), which is just dir.y.
  const stop = SKY_STOP_DEGREES.map((degrees) => n(Math.sin((degrees * Math.PI) / 180)));
  // Chord length between two directions: 2 sin(theta / 2).
  const chord = (degrees: number): string => n(2 * Math.sin((degrees * Math.PI) / 360));
  const discInner = chord(SUN_DISC_ANGLE - SUN_DISC_FEATHER / 2);
  const discOuter = chord(SUN_DISC_ANGLE + SUN_DISC_FEATHER / 2);

  return `
uniform vec3 uHaze;
uniform vec3 uLow;
uniform vec3 uMid;
uniform vec3 uZenith;
uniform vec3 uSunGlow;
uniform vec3 uSunDisc;
uniform vec3 uSunDirection;
uniform vec2 uSunAzimuth;

varying vec3 vDirection;

void main() {
  vec3 dir = normalize( vDirection );

  // Below the eye there is nothing but terrain, so the dome bottoms out
  // at the horizon rather than wrapping under the valley.
  float h = clamp( dir.y, 0.0, 1.0 );
  float f = 1.0 - h;
  float ff = f * f;

  // Slide the ramp up on the sun's side. This only moves along a ramp
  // that is already authored, so it can never produce a colour that is
  // not in the palette. ff kills it overhead, where the horizontal part
  // of the direction degenerates and an azimuth means nothing.
  vec2 flat2 = dir.xz;
  float az = max( dot( flat2 / max( length( flat2 ), 1e-4 ), uSunAzimuth ), 0.0 );
  float hr = h * ( 1.0 - ${n(SKY_SUN_LIFT)} * az * ff );

  // Chained smoothsteps rather than a piecewise lerp: smoothstep has zero
  // derivative at both ends, so every stop is a soft plateau and there is
  // no slope break anywhere. A slope break in a large flat field is what
  // Mach banding latches onto — it draws a faint line even where the
  // colour itself is perfectly continuous.
  float w1 = smoothstep( ${stop[0]}, ${stop[1]}, hr );
  float w2 = smoothstep( ${stop[1]}, ${stop[2]}, hr );
  float w3 = smoothstep( ${stop[2]}, ${stop[3]}, hr );
  vec3 color = mix( mix( mix( uHaze, uLow, w1 ), uMid, w2 ), uZenith, w3 );

  // Chord, not acos: within a tenth of a percent of the angle below ten
  // degrees, and one sqrt instead of an inverse trig call.
  float ang = length( dir - uSunDirection );

  // Two exponential lobes, added. Gated by w1 so the glow is exactly zero
  // on the plate and cannot shift the fog match by a single 8-bit level.
  float glow = 0.62 * exp( -ang / ${n(SUN_GLOW_INNER)} )
             + 0.38 * exp( -ang / ${n(SUN_GLOW_OUTER)} );
  color += uSunGlow * ( ${n(SUN_GLOW_GAIN)} * glow * w1 );

  // The one hard edge in the sky, and the only one that traces a shape
  // rather than a contour. Ungated, which is safe only while the sun sits
  // high; drop it near the horizon and this needs the w1 gate too.
  color = mix( color, uSunDisc, 1.0 - smoothstep( ${discInner}, ${discOuter}, ang ) );

  gl_FragColor = vec4( color, 1.0 );

  // Ahead of the colour space conversion, the order three uses itself.
  // A no-op while tone mapping is off, and one less surface to remember
  // on the day it is turned on
  #include <tonemapping_fragment>
  #include <colorspace_fragment>

  // Interleaved gradient noise at one 8-bit level peak to peak, after the
  // encode because that is where the truncation happens. A smooth ramp
  // across a large field steps visibly in 8 bits — and it steps worst
  // exactly at the stops, where smoothstep's derivative goes to zero and
  // the contours spread furthest apart. Pixel coordinates, never UVs.
  float ign = fract( 52.9829189 * fract( dot( gl_FragCoord.xy, vec2( 0.06711056, 0.00583715 ) ) ) );
  gl_FragColor.rgb += ( ign - 0.5 ) / 255.0;
}`;
}
