import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  BUSH_COUNT,
  BUSH_RADIUS,
  GRASS_COUNT,
  GRASS_HEIGHT,
  VALLEY_RADIUS,
  VEGETATION_CHUNKS,
  VEGETATION_MAX_SLOPE,
  VEGETATION_SEED,
  TREE_CLEARING_RADIUS,
  TREE_COUNT,
  TREE_DOOR_CLEARANCE,
  TREE_MAX_SLOPE,
  TREE_TRUNK_RADIUS,
  WIND_BUSH_SWAY,
  WIND_ENABLED,
  WIND_GRASS_SWAY,
  WIND_TREE_SWAY,
} from '../config/constants';
import { BURROWS } from '../config/burrows';
import { facePoint } from './burrow/profile';
import { PALETTE, darken } from '../config/palette';
import { makeRandom } from '../core/random';
import { toonSurface, toonVertexColored } from '../render/style';
import { maxSway, windDepthMaterial, windMaterial, type WindProfile } from '../render/wind';
import type { Circle } from './Obstacles';
import { riverCarve } from './heightfield';
import type { Ground } from './Ground';

/**
 * Grass and bushes by instancing.
 *
 * InstancedMesh draws thousands of copies of one geometry in a single
 * draw call: the GPU is handed the geometry plus an array of matrices,
 * not a thousand objects. Twelve thousand grass tufts as ordinary meshes
 * would cost twelve thousand calls and kill the frame; here it's dozens.
 *
 * The split into chunks exists precisely for culling. A single
 * InstancedMesh for the whole valley would have a bounding sphere the
 * size of the valley — meaning it would always be visible and drawn in
 * full, even with a couple of bushes on screen. A chunk covers its own
 * piece of the map, and three quarters of the valley behind the camera
 * get culled for free.
 *
 * Vegetation has no outline on purpose: a contour on a thirty-centimetre
 * tuft doesn't read, and it would double the draw calls.
 */
export class Vegetation {
  private readonly chunks: THREE.InstancedMesh[] = [];
  /** Materials cloned for the wind. Shared ones must never be disposed. */
  private readonly materials: THREE.Material[] = [];
  /** Trunks as obstacles: you can't walk through a tree. */
  readonly treeTrunks: Circle[] = [];

  constructor(scene: THREE.Scene, ground: Ground) {
    const random = makeRandom(VEGETATION_SEED);

    const grass = grassGeometry();
    const bush = bushGeometry();

    // Bucket into chunks up front so we know the size of each one
    const grassByChunk = scatter(GRASS_COUNT, ground, random);
    const bushByChunk = scatter(BUSH_COUNT, ground, random);

    this.addTrees(scene, ground, random);

    this.addChunks(scene, grass, grassByChunk, PALETTE.grass, PALETTE.grassDry,
      windProfile('grass', grass, WIND_GRASS_SWAY));
    // Bushes are darker and greener than the grass. In olive-grey they
    // read as boulders, the flattened ones especially
    this.addChunks(scene, bush, bushByChunk, darken(PALETTE.grass, 0.85), PALETTE.door,
      windProfile('bush', bush, WIND_BUSH_SWAY));
  }

  get drawCallCount(): number {
    return this.chunks.length;
  }

  dispose(): void {
    for (const chunk of this.chunks) {
      chunk.geometry.dispose();
      chunk.dispose();
    }
    for (const material of this.materials) material.dispose();
  }

  private addTrees(scene: THREE.Scene, ground: Ground, random: () => number): void {
    addTreesTo(scene, ground, random, this.treeTrunks, this.chunks, this.materials);
  }

  private addChunks(
    scene: THREE.Scene,
    geometry: THREE.BufferGeometry,
    byChunk: Map<number, Placement[]>,
    colorA: number,
    colorB: number,
    profile: WindProfile,
  ): void {
    // toonSurface caches by colour, so grass and bushes are handed the
    // very same material object — patching it would sway the whole scene
    const material = WIND_ENABLED
      ? windMaterial(toonSurface(0xffffff), profile)
      : toonSurface(0xffffff);
    if (WIND_ENABLED) this.materials.push(material);

    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    const tint = new THREE.Color();

    for (const [key, placements] of byChunk) {
      if (placements.length === 0) continue;

      // The geometry is shared by all chunks: we copy the reference,
      // not the data
      const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
      mesh.name = `${profile.key}_chunk_${key}`;
      mesh.castShadow = false;
      // Grass does receive shadow: without it, it glows on shaded ground
      mesh.receiveShadow = true;

      placements.forEach((placement, index) => {
        matrix.compose(placement.position, placement.rotation, placement.scale);
        mesh.setMatrixAt(index, matrix);
        // Per-instance colour breaks a single-tone field into two shades
        color.set(colorA).lerp(tint.set(colorB), placement.tint);
        mesh.setColorAt(index, color);
      });

      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
      // The sphere is computed from this chunk's instances and is
      // therefore tight — which was the whole point of the exercise
      mesh.computeBoundingSphere();
      inflateForWind(mesh, profile);

      scene.add(mesh);
      this.chunks.push(mesh);
    }
  }
}

/**
 * Trees. Trunk and crown are different colours, yet this is one instanced
 * mesh: the colour is baked into the vertices instead of being set by the
 * material. Otherwise every chunk would need two InstancedMeshes just to
 * get two colours.
 */
function addTreesTo(
  scene: THREE.Scene,
  ground: Ground,
  random: () => number,
  trunks: Circle[],
  chunks: THREE.InstancedMesh[],
  materials: THREE.Material[],
): void {
  const doors = BURROWS.map((burrow) => facePoint(burrow));
  const geometry = treeGeometry();
  const profile = windProfile('tree', geometry, WIND_TREE_SWAY);

  let material: THREE.Material = toonVertexColored();
  // The shadow pass draws with its own shader, which knows nothing about
  // the displacement. Without a matching depth material the crown sways
  // and its shadow stands still, which is worse than no wind at all
  let depth: THREE.MeshDepthMaterial | null = null;
  if (WIND_ENABLED) {
    material = windMaterial(toonVertexColored(), profile);
    depth = windDepthMaterial(profile);
    materials.push(material, depth);
  }

  const chunkSize = (VALLEY_RADIUS * 2) / VEGETATION_CHUNKS;
  const byChunk = new Map<number, Placement[]>();

  for (let i = 0; i < TREE_COUNT; i++) {
    const radius = Math.sqrt(random()) * VALLEY_RADIUS * 0.92;
    const angle = random() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    // The middle of the valley stays open: village and square are there
    if (radius < TREE_CLEARING_RADIUS) continue;

    const sample = ground.sample(x, z);
    if (sample === null || sample.slope > TREE_MAX_SLOPE) continue;
    if (riverCarve(x, z) > 0.05) continue;
    if (BURROWS.some((b) => Math.hypot(x - b.x, z - b.z) < b.radius + 1.5)) continue;
    if (doors.some((d) => Math.hypot(x - d.x, z - d.z) < TREE_DOOR_CLEARANCE)) continue;

    const scale = 0.75 + random() * 0.65;
    byChunk.set(0, byChunk.get(0) ?? []);
    const placement: Placement = {
      position: new THREE.Vector3(x, sample.height, z),
      rotation: new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 1, 0),
        random() * Math.PI * 2,
      ),
      scale: new THREE.Vector3(scale, scale * (0.85 + random() * 0.4), scale),
      tint: random(),
    };

    const key = Math.floor((z + VALLEY_RADIUS) / chunkSize) * VEGETATION_CHUNKS
      + Math.floor((x + VALLEY_RADIUS) / chunkSize);
    const bucket = byChunk.get(key);
    if (bucket === undefined) byChunk.set(key, [placement]);
    else bucket.push(placement);

    trunks.push({ x, z, radius: TREE_TRUNK_RADIUS * scale });
  }
  byChunk.delete(0);

  const matrix = new THREE.Matrix4();
  for (const [key, placements] of byChunk) {
    if (placements.length === 0) continue;
    const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
    mesh.name = `tree_chunk_${key}`;
    // Tree shadows hold the valley together; the shadow box is small,
    // so only the nearby chunks make it into the pass
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    if (depth !== null) mesh.customDepthMaterial = depth;

    placements.forEach((placement, index) => {
      matrix.compose(placement.position, placement.rotation, placement.scale);
      mesh.setMatrixAt(index, matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    inflateForWind(mesh, profile);

    scene.add(mesh);
    chunks.push(mesh);
  }
}

/**
 * The wind weights its bend by height, so the height has to be measured
 * off the geometry rather than assumed: change a cone or an icosahedron
 * here and the sway follows on its own.
 */
function windProfile(key: string, geometry: THREE.BufferGeometry, sway: number): WindProfile {
  geometry.computeBoundingBox();
  return { key, height: geometry.boundingBox?.max.y ?? 1, sway };
}

/**
 * The cull sphere was measured around vertices that had not moved yet.
 * Leave it and a chunk pops out of existence while a corner of it is
 * still on screen — the more visible the stronger the wind.
 */
function inflateForWind(mesh: THREE.InstancedMesh, profile: WindProfile): void {
  if (!WIND_ENABLED || mesh.boundingSphere === null) return;
  mesh.boundingSphere.radius += maxSway(profile);
}

/** Trunk and two crowns, colour goes into the vertex attribute. */
function treeGeometry(): THREE.BufferGeometry {
  const paint = (geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry => {
    const color = new THREE.Color(hex);
    const count = geometry.getAttribute('position').count;
    const data = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      data[i * 3] = color.r;
      data[i * 3 + 1] = color.g;
      data[i * 3 + 2] = color.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(data, 3));
    return geometry;
  };

  // The cylinder is indexed, the icosahedron is not: mergeGeometries
  // demands that either everyone has an index or no one does. We settle
  // on "no one" — going the other way via mergeVertices would weld the
  // faceted crowns smooth
  const trunk = new THREE.CylinderGeometry(0.17, 0.26, 2.3, 6).toNonIndexed();
  trunk.translate(0, 1.15, 0);

  const lower = new THREE.IcosahedronGeometry(1.5, 0);
  lower.scale(1, 1.1, 1);
  lower.translate(0, 3.1, 0);

  const upper = new THREE.IcosahedronGeometry(1.05, 0);
  upper.translate(0.22, 4.35, -0.12);

  const merged = mergeGeometries([
    paint(trunk, PALETTE.woodDark),
    paint(lower, darken(PALETTE.grass, 0.82)),
    paint(upper, darken(PALETTE.grass, 0.95)),
  ], false);
  if (merged === null) throw new Error('[vegetation] could not merge the tree geometry');
  return merged;
}

interface Placement {
  position: THREE.Vector3;
  rotation: THREE.Quaternion;
  scale: THREE.Vector3;
  tint: number;
}

/** Scatters points across the valley and groups them into chunks. */
function scatter(count: number, ground: Ground, random: () => number): Map<number, Placement[]> {
  const byChunk = new Map<number, Placement[]>();
  const axis = new THREE.Vector3(0, 1, 0);
  const chunkSize = (VALLEY_RADIUS * 2) / VEGETATION_CHUNKS;

  for (let i = 0; i < count; i++) {
    // The square root on the radius gives even density per unit area:
    // without it everything would bunch up towards the centre
    const radius = Math.sqrt(random()) * VALLEY_RADIUS * 0.95;
    const angle = random() * Math.PI * 2;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;

    const sample = ground.sample(x, z);
    if (sample === null) continue;
    // Grass won't hold on a steep slope — and it leaves the rim bare too
    if (sample.slope > VEGETATION_MAX_SLOPE) continue;
    // Nor in the river: tufts poking out of the water give the fake away
    if (riverCarve(x, z) > 0.05) continue;
    // Nor inside a burrow: the hill is a mesh now, the ground under it
    // is flat, and tufts would sprout straight through the roof
    if (BURROWS.some((b) => Math.hypot(x - b.x, z - b.z) < b.radius + 0.6)) continue;

    const scale = 0.7 + random() * 0.6;
    const placement: Placement = {
      position: new THREE.Vector3(x, sample.height, z),
      rotation: new THREE.Quaternion().setFromAxisAngle(axis, random() * Math.PI * 2),
      scale: new THREE.Vector3(scale, scale * (0.8 + random() * 0.5), scale),
      tint: random(),
    };

    const cx = Math.floor((x + VALLEY_RADIUS) / chunkSize);
    const cz = Math.floor((z + VALLEY_RADIUS) / chunkSize);
    const key = cz * VEGETATION_CHUNKS + cx;

    const bucket = byChunk.get(key);
    if (bucket === undefined) byChunk.set(key, [placement]);
    else bucket.push(placement);
  }

  return byChunk;
}

/**
 * A grass tuft: a four-sided pyramid with no bottom cap — four triangles.
 * The cap is pressed against the ground anyway, and across thirty
 * thousand instances that is half as much geometry.
 */
function grassGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.ConeGeometry(GRASS_HEIGHT * 0.3, GRASS_HEIGHT, 4, 1, true);
  // The cone is built around its centre, but it has to be planted with
  // its base on the ground
  geometry.translate(0, GRASS_HEIGHT / 2, 0);
  return geometry;
}

/**
 * Bush: a faceted sphere a little taller than it is wide. The flattened
 * version read as a rock — shape matters more than colour here.
 */
function bushGeometry(): THREE.BufferGeometry {
  const geometry = new THREE.IcosahedronGeometry(BUSH_RADIUS, 0);
  geometry.scale(1, 1.15, 1);
  geometry.translate(0, BUSH_RADIUS * 0.8, 0);
  return geometry;
}
