import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  WHEEL_AXLE_RADIUS,
  WHEEL_FLOATS,
  WHEEL_BED_CLEARANCE,
  WHEEL_FLOAT_THICKNESS,
  WHEEL_RADIUS,
  WHEEL_SHAFT_OVERHANG,
  WHEEL_RIM_INNER,
  WHEEL_RPM,
  WHEEL_SPOKES,
  WHEEL_WIDTH,
} from '../../config/constants';
import { PALETTE } from '../../config/palette';
import { applyStyle } from '../../render/style';
import { heightAt } from '../heightfield';

/**
 * The mill wheel: the only thing in the valley that moves of its own
 * accord.
 *
 * Undershot, which is why there is no hydrology anywhere in this project.
 * An overshot wheel needs water delivered above its axle, and that means a
 * weir, a leat, a bay and a tailrace — a whole drainage system for one
 * prop. An undershot wheel just needs the stream to run past its bottom,
 * and the channel already does: the pit measures 0.29 m of standing water
 * 1.8 m from the mill's south wall, without a single metre of cutting.
 *
 * It cannot go in the shared PropBatch. The batch merges everything into
 * static geometry with its matrix composed once and never again, which is
 * the whole reason it is cheap — and this turns. Its own mesh, its own
 * outline, its own shadow: three draw calls, which is what the only moving
 * mechanism in the world is worth.
 *
 * Spokes are offset from the floats and the two rims sit at different
 * radii. Without that the silhouette repeats exactly every 15 degrees, and
 * a toon renderer has no motion blur to hide it with: a perfectly periodic
 * wheel reads as a wagon wheel wobbling in a film, not as a wheel turning.
 */
export class MillWheel {
  /**
   * The mesh hangs in a group of its own, and that is not tidiness.
   * applyStyle hangs the inverted-hull outline NEXT to the mesh, so it
   * needs the mesh to have a parent already — with none, the hull is
   * built and silently dropped, and the only moving thing in the valley
   * is the only thing with no contour. WorkSites carries the same warning
   * in a comment; the warning was not enough.
   */
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private readonly speed = (WHEEL_RPM * Math.PI * 2) / 60;

  constructor(x: number, z: number, shaftRun: number) {
    // Set from the BED, not from the water surface. Dipping the floats a
    // fixed depth put them 2 mm off the bottom — the pit happens to hold
    // 0.292 m and the intended dip was 0.29 — and on a mesh sampled every
    // 0.667 m that is a wheel grinding through the riverbed. The clearance
    // is the hard constraint; the dip is whatever is left of the water
    // From the HIGHEST bed under the wheel's own footprint, not from the
    // bed under its centre. The centre is the deepest point of a channel,
    // so setting the axle there gives the stated clearance in exactly one
    // place and less than none everywhere else — measured, two millimetres
    // at the middle and a quarter of a metre into the bank at the sides
    let bed = -Infinity;
    for (let along = -WHEEL_RADIUS; along <= WHEEL_RADIUS; along += 0.05) {
      for (let across = -WHEEL_WIDTH / 2; across <= WHEEL_WIDTH / 2; across += 0.1) {
        bed = Math.max(bed, heightAt(x + along, z + across));
      }
    }
    const axleY = bed + WHEEL_BED_CLEARANCE + WHEEL_RADIUS;

    const parts: THREE.BufferGeometry[] = [];

    // The shaft, not a stub. A wheel whose axle stops at its own hub
    // turns nothing: the shaft runs through the mill wall to the gearing
    // inside, and that is the entire reason the wheel is there. It reaches
    // from an outer bearing on the far side, through the hub, to just
    // inside the wall
    const reach = WHEEL_SHAFT_OVERHANG + shaftRun;
    const axle = new THREE.CylinderGeometry(WHEEL_AXLE_RADIUS, WHEEL_AXLE_RADIUS, reach, 8);
    // Along Z, to match the plane the rims and floats are built in. The
    // wheel's axis has to be across the flow, and the stream runs along x
    axle.rotateX(Math.PI / 2);
    // Centred on the run rather than on the hub: the mill is only on one
    // side of the wheel
    axle.translate(0, 0, (shaftRun - WHEEL_SHAFT_OVERHANG) / 2);
    parts.push(axle.toNonIndexed());

    // Two rims at different radii, so the outer edge is never a clean
    // circle and the eye has something to follow round
    for (const [radius, side] of [[WHEEL_RIM_INNER, -1], [WHEEL_RADIUS - 0.02, 1]] as const) {
      const rim = new THREE.TorusGeometry(radius, 0.045, 4, 24);
      rim.translate(0, 0, side * (WHEEL_WIDTH / 2 - 0.08));
      parts.push(rim.toNonIndexed());
    }

    for (let i = 0; i < WHEEL_SPOKES; i++) {
      // Offset half a float pitch: spokes lining up with paddles is what
      // makes the silhouette repeat
      const angle = (i / WHEEL_SPOKES) * Math.PI * 2 + Math.PI / WHEEL_FLOATS;
      const spoke = new THREE.BoxGeometry(0.06, WHEEL_RIM_INNER, 0.06);
      spoke.translate(0, WHEEL_RIM_INNER / 2, 0);
      spoke.rotateZ(angle);
      parts.push(spoke.toNonIndexed());
    }

    for (let i = 0; i < WHEEL_FLOATS; i++) {
      const angle = (i / WHEEL_FLOATS) * Math.PI * 2;
      const float = new THREE.BoxGeometry(WHEEL_FLOAT_THICKNESS, 0.35, WHEEL_WIDTH);
      float.translate(0, WHEEL_RADIUS - 0.175, 0);
      float.rotateZ(angle);
      parts.push(float.toNonIndexed());
    }

    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (merged === null) throw new Error('[wheel] could not merge the wheel geometry');
    merged.computeVertexNormals();
    merged.computeBoundingSphere();

    this.mesh = new THREE.Mesh(merged);
    this.mesh.name = 'mill_wheel';
    // Built in the XY plane, which is already the plane the water flows
    // through: the axle lies along z, across the stream
    this.mesh.position.set(x, axleY, z);
    this.group.name = 'mill_wheel_group';
    this.group.add(this.mesh);
    applyStyle(this.mesh, { color: PALETTE.woodDark, outline: true });

    // The hull copies the mesh's transform ONCE, at construction, because
    // every other object it has ever been asked to outline stands still.
    // This one turns, and as a sibling the hull was left standing while
    // the wheel span inside it. As a child it inherits the rotation for
    // free — and its own local transform has to be cleared, or it would
    // apply the mesh's placement twice
    const hull = this.group.children.find((child) => child !== this.mesh);
    if (hull !== undefined) {
      hull.position.set(0, 0, 0);
      hull.quaternion.identity();
      hull.scale.set(1, 1, 1);
      this.mesh.add(hull);
    }
  }

  update(delta: number): void {
    // About z, the axle's own axis. The stream runs east to west here, so
    // the floats at the bottom travel that way and the wheel turns with it
    this.mesh.rotation.z -= this.speed * delta;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }
}
