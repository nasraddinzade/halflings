import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';

import { DECK_REACH, TERRAIN_PROBE_HEIGHT } from '../config/constants';
import { deckHeightAt } from './bridge';

export interface GroundSample {
  /** Ground height at the requested point. */
  height: number;
  /** Surface normal, in world space. */
  normal: THREE.Vector3;
  /** Angle between the normal and vertical, in radians. */
  slope: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Terrain queries: the height under a point and whatever a ray hits.
 *
 * The height could be read from heightAt() directly, and more cheaply,
 * but the mesh is a piecewise-linear approximation of that function, and
 * on a one-meter grid the two drift apart by centimeters. The character
 * has to stand on what is actually drawn, so we ask the geometry itself.
 *
 * The footbridge is the one surface that is NOT terrain. Its deck is drawn
 * as props and the BVH has never heard of it, so before this the player
 * crossed the river on the bed with his own planks over his head. It is
 * asked separately, and only where it exists.
 */
export class Ground {
  private readonly ray = new THREE.Ray();
  private readonly down = new THREE.Vector3(0, -1, 0);
  private readonly sampleResult: GroundSample = {
    height: 0,
    normal: new THREE.Vector3(0, 1, 0),
    slope: 0,
  };

  constructor(private readonly bvh: MeshBVH) {}

  /**
   * The ground under point (x, z). Returns a reused object — copy it if
   * you need to keep the value between frames.
   * null means the point is outside the valley.
   */
  sample(x: number, z: number, feetY = Infinity): GroundSample | null {
    this.ray.origin.set(x, TERRAIN_PROBE_HEIGHT, z);
    this.ray.direction.copy(this.down);

    const hit = this.bvh.raycastFirst(this.ray, THREE.FrontSide);
    if (hit === null || hit.face === null || hit.face === undefined) return null;

    this.sampleResult.height = hit.point.y;
    this.sampleResult.normal.copy(hit.face.normal);
    this.sampleResult.slope = this.sampleResult.normal.angleTo(UP);

    // The deck, when there is one and when the feet are near enough to be
    // standing on it. The height term is what stops the bridge stealing
    // the surface from somebody wading underneath it and hoisting him up
    // through his own planks — the default of Infinity is for callers that
    // are asking about the ground itself, like the camera
    const deck = deckHeightAt(x, z);
    if (deck !== null && deck > this.sampleResult.height && deck <= feetY + DECK_REACH) {
      this.sampleResult.height = deck;
      this.sampleResult.normal.copy(UP);
      this.sampleResult.slope = 0;
    }
    return this.sampleResult;
  }

  /**
   * First hit of a ray against the terrain. The camera needs it so it
   * does not slide inside a hill. Returns the distance to the hit, or null.
   */
  raycastDistance(origin: THREE.Vector3, direction: THREE.Vector3, maxDistance: number): number | null {
    this.ray.origin.copy(origin);
    this.ray.direction.copy(direction).normalize();

    const hit = this.bvh.raycastFirst(this.ray, THREE.DoubleSide, 0, maxDistance);
    return hit === null ? null : hit.distance;
  }
}
