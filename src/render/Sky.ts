import * as THREE from 'three';

import {
  SKY_BANDS,
  SKY_CURVE,
  SKY_RADIUS,
  SUN_DISC_ANGLE,
  SUN_HALO_ANGLE,
} from '../config/constants';
import { PALETTE } from '../config/palette';

/**
 * The sky, as a banded dome.
 *
 * It replaces scene.background, which was a single flat colour. The camera
 * tilts up to 65 degrees, so that flat fill is the first thing anyone sees
 * when they look around, and it is the largest area in most frames — it
 * grades the whole image whether or not anyone looks at it directly.
 *
 * The gradient is quantised rather than smooth. That is the same decision
 * the lighting ramp makes with NearestFilter (render/style.ts): a smooth
 * sky over a stepped world is not a subtler version of the art direction,
 * it is a different one.
 *
 * This is the one surface that does not go through applyStyle. A toon
 * material would light it, and the sky is not a lit object — it emits.
 * Its colours still come from the palette, which is what decision #6
 * actually asks for.
 */
export class Sky {
  readonly mesh: THREE.Mesh;

  constructor(sunDirection: THREE.Vector3) {
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
        uHorizon: { value: new THREE.Color(PALETTE.skyHorizon) },
        uZenith: { value: new THREE.Color(PALETTE.skyZenith) },
        uSunColor: { value: new THREE.Color(PALETTE.sunDisc) },
        uSunDirection: { value: sunDirection.clone().normalize() },
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
  const bands = n(SKY_BANDS);
  const discCos = n(Math.cos((SUN_DISC_ANGLE * Math.PI) / 180));
  const haloCos = n(Math.cos((SUN_HALO_ANGLE * Math.PI) / 180));

  return `
uniform vec3 uHorizon;
uniform vec3 uZenith;
uniform vec3 uSunColor;
uniform vec3 uSunDirection;

varying vec3 vDirection;

void main() {
  vec3 direction = normalize( vDirection );

  // Below the eye there is nothing but terrain, so the sky bottoms out
  // at the horizon rather than wrapping under the valley.
  float height = clamp( direction.y, 0.0, 1.0 );
  float t = pow( height, ${n(SKY_CURVE)} );

  // floor() is the whole difference between a toon sky and a gradient.
  float band = clamp( floor( t * ${bands} ) / ( ${bands} - 1.0 ), 0.0, 1.0 );
  vec3 color = mix( uHorizon, uZenith, band );

  // A hard disc with one ring around it. A soft bloom would be the only
  // smooth thing in the frame, which is why the ring is a step too.
  float towards = dot( direction, uSunDirection );
  color = mix( color, uSunColor, step( ${haloCos}, towards ) * 0.22 );
  color = mix( color, uSunColor, step( ${discCos}, towards ) );

  gl_FragColor = vec4( color, 1.0 );
  #include <colorspace_fragment>
}`;
}
