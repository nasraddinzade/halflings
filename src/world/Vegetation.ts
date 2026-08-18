import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  BUSH_COUNT,
  BUSH_RADIUS,
  CART_AVENUE_FROM,
  CART_AVENUE_OFFSET,
  CART_AVENUE_TO,
  GRASS_COUNT,
  GRASS_HEIGHT,
  GREEN_PLANTING,
  HEDGEROW_GATE_CLEARANCE,
  HEDGEROW_SEED,
  HEDGEROW_SPACING,
  HEDGEROW_WORK_CLEARANCE,
  PLAYER_RADIUS,
  VALLEY_RADIUS,
  VEGETATION_CHUNKS,
  VEGETATION_MAX_SLOPE,
  VEGETATION_SEED,
  TREE_CLEARING_RADIUS,
  TREE_COUNT,
  TREE_DOOR_CLEARANCE,
  TREE_MAX_SLOPE,
  TREE_CROWN_BASE,
  TREE_CROWN_RADIUS,
  TREE_TRUNK_HEIGHT,
  TREE_TRUNK_RADIUS,
  WIND_BUSH_AMPLITUDE,
  WIND_BUSH_FLUTTER,
  WIND_BUSH_RATE,
  WIND_ENABLED,
  WIND_GRASS_AMPLITUDE,
  WIND_GRASS_FLUTTER,
  WIND_GRASS_RATE,
  WIND_TREE_AMPLITUDE,
  WIND_TREE_FLUTTER,
  WIND_TREE_RATE,
} from '../config/constants';
import { BURROWS } from '../config/burrows';
import { allHedges } from '../config/hedges';
import { OAK } from '../config/green';
import { LANES, LANE_HALF_WIDTH, doorSpurs, type Lane } from '../config/lanes';
import { WORK_POINTS, propPosition } from '../config/work';
import { facePoint } from './burrow/profile';
import { PALETTE, darken } from '../config/palette';
import { makeRandom } from '../core/random';
import { toonSurface, toonVertexColored } from '../render/style';
import { maxSway, windDepthMaterial, windMaterial, type WindProfile } from '../render/wind';
import type { Circle } from './Obstacles';
import { pondCarve, riverCarve } from './heightfield';
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

    // A blade bends along its whole length, so the pivot is the tip
    this.addChunks(scene, grass, grassByChunk, PALETTE.grass, PALETTE.grassDry, {
      key: 'grass',
      pivot: topOf(grass),
      amplitude: WIND_GRASS_AMPLITUDE,
      flutter: WIND_GRASS_FLUTTER,
      rate: WIND_GRASS_RATE,
    });
    // Bushes are darker and greener than the grass. In olive-grey they
    // read as boulders, the flattened ones especially
    this.addChunks(scene, bush, bushByChunk, darken(PALETTE.grass, 0.85), PALETTE.door, {
      key: 'bush',
      // Low pivot: a bush is a dense ball sitting on the ground, and only
      // its top gives. Pivot it at the crown and it squashes instead
      pivot: topOf(bush) * 0.45,
      amplitude: WIND_BUSH_AMPLITUDE,
      flutter: WIND_BUSH_FLUTTER,
      rate: WIND_BUSH_RATE,
    });
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
    const kit = treeKit(this.materials);
    addTreesTo(scene, ground, random, this.treeTrunks, this.chunks, kit);
    addHedgerowTrees(scene, ground, this.treeTrunks, this.chunks, kit);
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
interface TreeKit {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  depth: THREE.MeshDepthMaterial | null;
  profile: WindProfile;
}

/**
 * Geometry, material and wind profile, built once and shared by both
 * tree passes. Two materials would mean two shader programs compiled for
 * the same tree, and two wind curves to keep in step by hand.
 */
function treeKit(materials: THREE.Material[]): TreeKit {
  const profile: WindProfile = {
    key: 'tree',
    // The crown, not the treetop. Everything above this height moves as
    // one piece, so the trunk bends and the two balls ride along without
    // deforming. Pivoting at the treetop instead made the crowns stretch
    // and shrink — a low-poly ball has no business changing shape
    pivot: TREE_CROWN_BASE,
    amplitude: WIND_TREE_AMPLITUDE,
    flutter: WIND_TREE_FLUTTER,
    rate: WIND_TREE_RATE,
  };

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

  return { geometry: treeGeometry(), material, depth, profile };
}

function addTreesTo(
  scene: THREE.Scene,
  ground: Ground,
  random: () => number,
  trunks: Circle[],
  chunks: THREE.InstancedMesh[],
  kit: TreeKit,
): void {
  const doors = BURROWS.map((burrow) => facePoint(burrow));
  const { geometry, material, depth, profile } = kit;

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
    if (riverCarve(x, z) > 0.05 || pondCarve(x, z) > 0.05) continue;
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
 * Trees standing in the boundaries.
 *
 * The cheapest thing in the plan and the one that does the most. A hedge
 * on its own is 1.1 m against a green 17 m across — a line on the floor,
 * not a wall. Put a five-metre tree in it every dozen metres and the
 * green has a ceiling edge: the same enclosure a room gets from its
 * cornice. Same geometry, same material, one extra draw call.
 *
 * They are not scattered and then filtered onto the lines — they are
 * walked along the lines, which is how a hedgerow standard grows. What
 * is filtered is where a tree must NOT stand: in a gateway, in a lane,
 * against a door, in the water.
 */
function addHedgerowTrees(
  scene: THREE.Scene,
  ground: Ground,
  trunks: Circle[],
  chunks: THREE.InstancedMesh[],
  kit: TreeKit,
): void {
  // Its own stream, not the one the scattered trees are drawing from.
  // Sharing it would move every tree in the village whenever anything
  // upstream took one more number — and these stand in fixed places that
  // the plan in docs/ has to be able to show
  const random = makeRandom(HEDGEROW_SEED);
  const doors = BURROWS.map((burrow) => facePoint(burrow));
  const ways = [...LANES, ...doorSpurs()];
  const workSpots = WORK_POINTS.flatMap((point) => [
    { x: point.x, z: point.z },
    propPosition(point),
  ]);
  const placements: Placement[] = [];
  const standing: Array<{ x: number; z: number; crown: number }> = [];

  // The standard oak on the green goes in first, and it goes in HERE
  // rather than into a prop module: as one more instance of the same
  // geometry the biggest thing in the village costs no draw call at all.
  // First, because the cull sphere and the wind inflation are computed
  // from the placements after this loop — appended afterwards, the tallest
  // tree would pop out at the edge of frame and stand dead still in a gale
  const oakGround = ground.sample(OAK.x, OAK.z);
  if (oakGround !== null) {
    placements.push({
      position: new THREE.Vector3(OAK.x, oakGround.height, OAK.z),
      rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.7),
      // No vertical jitter, unlike its neighbours. A tree whose height is
      // uncertain by three metres cannot be framed, and this one is placed
      // to cross the top of the load frame
      scale: new THREE.Vector3(OAK.scale, OAK.scale, OAK.scale),
      tint: 0.35,
    });
    standing.push({ x: OAK.x, z: OAK.z, crown: TREE_CROWN_RADIUS * OAK.scale });
    trunks.push({ x: OAK.x, z: OAK.z, radius: TREE_TRUNK_RADIUS * OAK.scale });
  }

  for (const line of hedgerowLines()) {
    // Half a step in, not a random fraction of one. On a fifteen-metre
    // run with two gateways in it there are only a couple of places a
    // tree can stand at all, and a random phase missed them
    let target = line.spacing * 0.5;
    let travelled = 0;

    for (let i = 1; i < line.points.length; i++) {
      const a = line.points[i - 1];
      const b = line.points[i];
      if (a === undefined || b === undefined) continue;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 1e-4) continue;

      while (target <= travelled + length) {
        // Where this one stands, kept before the walker moves on: the
        // gate test has to be about this tree, not the next one
        const at = target;
        const t = (at - travelled) / length;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        target += line.spacing * (0.8 + random() * 0.5);

        // A tree in a gateway is a gate that does not open. Beside one is
        // another matter: a gate under a tree is the ordinary arrangement
        const clear = HEDGEROW_GATE_CLEARANCE;
        if (line.gates.some(([from, to]) => at >= from - clear && at <= to + clear)) continue;
        if (BURROWS.some((m) => Math.hypot(x - m.x, z - m.z) < m.radius + 1.5)) continue;
        if (doors.some((d) => Math.hypot(x - d.x, z - d.z) < TREE_DOOR_CLEARANCE)) continue;
        // A work point is a place someone stands; the bench or bed is a
        // couple of metres in front of them. Both need keeping clear —
        // the trunk missed the nearest work point by 1.7 m, but the bed
        // it belongs to reaches a metre out from its own centre
        if (workSpots.some((w) => Math.hypot(x - w.x, z - w.z) < HEDGEROW_WORK_CLEARANCE)) continue;
        if (riverCarve(x, z) > 0.05 || pondCarve(x, z) > 0.05) continue;

        const scale = 0.95 + random() * 0.5;

        // Crowding is about crowns, not about the planting interval.
        // Measured against the interval, one tree a metre inside a corner
        // banned the next four metres of the hedge that turns there — and
        // that hedge was the far side of the green, the side you look at
        const crown = TREE_CROWN_RADIUS * scale;
        if (standing.some((s) => Math.hypot(x - s.x, z - s.z) < (crown + s.crown) * 0.8)) continue;
        // Wide enough for a body to pass, measured against the trunk it
        // is actually going to grow, not the average one
        const room = TREE_TRUNK_RADIUS * scale + PLAYER_RADIUS + 0.2;
        if (ways.some((way) => distanceToWay(x, z, way) < LANE_HALF_WIDTH[way.kind] + room)) continue;

        const sample = ground.sample(x, z);
        if (sample === null || sample.slope > TREE_MAX_SLOPE) continue;

        standing.push({ x, z, crown });
        placements.push({
          position: new THREE.Vector3(x, sample.height, z),
          rotation: new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            random() * Math.PI * 2,
          ),
          scale: new THREE.Vector3(scale, scale * (0.9 + random() * 0.35), scale),
          tint: random(),
        });
        trunks.push({ x, z, radius: TREE_TRUNK_RADIUS * scale });
      }
      travelled += length;
    }
  }

  if (placements.length === 0) return;

  // One mesh, not one per chunk. They all stand inside the village, so a
  // per-chunk split would buy nothing: the camera is never far enough
  // from the middle for any of it to leave the frustum
  const mesh = new THREE.InstancedMesh(kit.geometry, kit.material, placements.length);
  mesh.name = 'hedgerow_trees';
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (kit.depth !== null) mesh.customDepthMaterial = kit.depth;

  const matrix = new THREE.Matrix4();
  placements.forEach((placement, index) => {
    matrix.compose(placement.position, placement.rotation, placement.scale);
    mesh.setMatrixAt(index, matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
  inflateForWind(mesh, kit.profile);

  scene.add(mesh);
  chunks.push(mesh);
}

/**
 * The lines a hedgerow tree may grow along, where they are broken, and
 * how thickly they are planted.
 *
 * The spacing is not one number. Out in the crofts a standard every
 * dozen metres is a hedgerow; around the green the same interval put two
 * trees on forty-six metres of boundary and enclosed nothing, which is
 * the one place the whole exercise exists to fix. A green is planted
 * closer than a field because it was planted deliberately.
 */
function hedgerowLines(): Array<{
  points: ReadonlyArray<readonly [number, number]>;
  gates: ReadonlyArray<readonly [number, number]>;
  spacing: number;
}> {
  const lines = allHedges().map((run) => ({
    points: run.points,
    gates: run.gates ?? [],
    spacing: run.id.startsWith('green-') ? HEDGEROW_SPACING * GREEN_PLANTING : HEDGEROW_SPACING,
  }));

  // Both verges of the cart lane where it crosses the open middle. There
  // is no hedge to stand in there and nothing else to give the road an
  // edge, which is exactly where an avenue does its work
  const cart = LANES.find((lane) => lane.id === 'cart');
  if (cart !== undefined) {
    for (const side of [-1, 1]) {
      const verge: Array<readonly [number, number]> = [];
      for (let i = 1; i < cart.points.length; i++) {
        const a = cart.points[i - 1];
        const b = cart.points[i];
        if (a === undefined || b === undefined) continue;
        if (a[1] > CART_AVENUE_FROM || a[1] < CART_AVENUE_TO) continue;
        const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (length < 1e-4) continue;
        const nx = (-(b[1] - a[1]) / length) * side * CART_AVENUE_OFFSET;
        const nz = ((b[0] - a[0]) / length) * side * CART_AVENUE_OFFSET;
        verge.push([a[0] + nx, a[1] + nz], [b[0] + nx, b[1] + nz]);
      }
      // An avenue is planted to a rhythm, or it is not an avenue
      if (verge.length > 1) {
        lines.push({ points: verge, gates: [], spacing: HEDGEROW_SPACING * GREEN_PLANTING });
      }
    }
  }

  return lines;
}

function distanceToWay(x: number, z: number, way: Lane): number {
  let best = Infinity;
  for (let i = 1; i < way.points.length; i++) {
    const a = way.points[i - 1];
    const b = way.points[i];
    if (a === undefined || b === undefined) continue;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len2 = dx * dx + dz * dz;
    const t = len2 < 1e-8 ? 0 : Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / len2));
    best = Math.min(best, Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t)));
  }
  return best;
}

/**
 * Height of the tallest vertex. Measured off the geometry rather than
 * assumed, so reshaping a cone or an icosahedron carries the wind with it.
 */
function topOf(geometry: THREE.BufferGeometry): number {
  geometry.computeBoundingBox();
  return geometry.boundingBox?.max.y ?? 1;
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
  const trunk = new THREE.CylinderGeometry(0.17, 0.26, TREE_TRUNK_HEIGHT, 6).toNonIndexed();
  trunk.translate(0, TREE_TRUNK_HEIGHT / 2, 0);

  // Placed by its underside rather than its centre: TREE_CROWN_BASE is
  // also the height the wind pivots about, and the two must not drift
  const lowerRadius = TREE_CROWN_RADIUS;
  const lowerSquash = 1.1;
  const lower = new THREE.IcosahedronGeometry(lowerRadius, 0);
  lower.scale(1, lowerSquash, 1);
  lower.translate(0, TREE_CROWN_BASE + lowerRadius * lowerSquash, 0);

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
    // Nor in the water, river or pond: tufts poking out of the surface
    // give the fake away. Six square metres of the pond is shallower than
    // a grass blade is tall, so without the second test the whole margin
    // stands up through the waterline
    if (riverCarve(x, z) > 0.05 || pondCarve(x, z) > 0.05) continue;
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
