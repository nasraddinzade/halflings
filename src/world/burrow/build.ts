import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  BURROWS,
  DOOR_CENTER_HEIGHT,
  DOOR_FRAME_RADIUS,
  DOOR_FRAME_TUBE,
  DOOR_BATTEN_AT,
  DOOR_BOARDS,
  DOOR_RADIUS,
  FACE_OFFSET,
  PATH_STONES,
  PATH_STONE_THICKNESS,
  type Burrow,
} from '../../config/burrows';
import { PALETTE } from '../../config/palette';
import { heightAt } from '../heightfield';
import { hashSeed, makeRandom } from '../../core/random';
import { buildMoundMesh, moundForward } from './mesh';
import { DOOR_TOP, faceOf, type BurrowFace } from './profile';
import type { Circle } from '../Obstacles';

/**
 * Burrow builder. Turns four numbers per burrow into a finished house.
 *
 * The mound is built by mesh.ts — facade included, as a single mesh.
 * Only what hangs off it lives here: the door leaf, the spoked arch
 * modelled on the classic round village doors, the knob, the dark
 * depth behind the door, the path flagstones and the chimney.
 *
 * There is no separate flat facade panel any more: while the mound and
 * the facade were different objects, the panel had to be flat, and from
 * any angle but head-on it read as a board propped against the hill.
 */

export interface BurrowBuild {
  /** Mounds with their pressed-in facades, color in the vertices. */
  mounds: THREE.BufferGeometry;
  /** Joinery and path stone, grouped by color. */
  parts: Map<number, THREE.BufferGeometry>;
  blockers: Array<{ x: number; z: number; radius: number }>;
  /**
   * The garden palings, kept apart from the blockers above.
   *
   * Four hundred circles, against fifteen mounds and fifteen doorways.
   * The mounds go into the obstacle grid's static list, which is scanned
   * in full every frame; four hundred more would be paid for on every
   * step the player takes anywhere in the valley. These go into the grid,
   * which is what the grid is for — it already bins the tree trunks and
   * the hedges the same way.
   */
  palings: Circle[];
  /** Mouth of each chimney. Smoke is emitted from exactly these points. */
  chimneys: THREE.Vector3[];
}

export function buildBurrows(valleyFloorAt: (x: number, z: number) => number): BurrowBuild {
  const mounds: THREE.BufferGeometry[] = [];
  const byColor = new Map<number, THREE.BufferGeometry[]>();
  const blockers: BurrowBuild['blockers'] = [];
  const palings: Circle[] = [];
  const chimneys: THREE.Vector3[] = [];

  const add = (color: number, geometry: THREE.BufferGeometry): void => {
    const bucket = byColor.get(color);
    if (bucket === undefined) byColor.set(color, [geometry]);
    else bucket.push(geometry);
  };

  for (const burrow of BURROWS) {
    const face = faceOf(burrow, valleyFloorAt);
    checkFits(burrow, face);

    const random = makeRandom(hashSeed(burrow.id));
    const place = (geometry: THREE.BufferGeometry, forward: number): THREE.BufferGeometry => {
      geometry.translate(0, 0, forward);
      geometry.rotateY(face.yaw);
      geometry.translate(face.x, face.base, face.z);
      return geometry;
    };

    mounds.push(buildMoundMesh(burrow, face));

    // Dark depth behind the door leaf
    const recess = new THREE.CircleGeometry(DOOR_FRAME_RADIUS, 22);
    recess.translate(0, DOOR_CENTER_HEIGHT, 0);
    add(PALETTE.ink, place(recess, FACE_OFFSET + 0.01));

    const leaf = new THREE.CircleGeometry(DOOR_RADIUS, 22);
    leaf.translate(0, DOOR_CENTER_HEIGHT, 0);
    add(PALETTE.wood, place(leaf, FACE_OFFSET + 0.07));

    for (const part of doorFrame()) add(part.color, place(part.geometry, FACE_OFFSET + 0.06));

    // Round windows either side. After the door itself this is the most
    // recognisable thing a halfling dwelling has, and there were none:
    // fifteen blank green domes with a disc on the front read as bunkers,
    // not as houses somebody lives in
    for (const part of windows(burrow, face)) add(part.color, place(part.geometry, FACE_OFFSET + part.out));

    // A hood over the door, on two brackets. Every door that opens into a
    // hillside has one or the rain runs down the face and in
    for (const part of porch(burrow, face)) add(part.color, place(part.geometry, FACE_OFFSET + part.out));

    const knob = new THREE.SphereGeometry(0.07, 8, 6);
    knob.translate(0, DOOR_CENTER_HEIGHT, 0);
    add(PALETTE.thatch, place(knob, FACE_OFFSET + 0.14));

    // Already in world coordinates: they were put on the ground, and
    // place() would lift them straight back off it
    for (const stone of pathStones(random, face, heightAt)) add(PALETTE.rock, stone);

    // The step. The sill sits a third of a metre above the ground on every
    // one of them — which is a step — and there was nothing under it but
    // grass, so the whole front read as hung in the air
    for (const part of doorstep()) add(part.color, place(part.geometry, FACE_OFFSET + part.out));

    // Chimney on the crown of the mound. Its mouth is handed out so the
    // smoke starts exactly where the pipe ends, rather than at a height
    // guessed from the burrow data and drifting the day someone edits it
    // A stack, not a pipe. A grey tube on a grass dome says nothing; a
    // squared shaft with a course of stone on top says a hearth
    const stackHeight = 0.78;
    const stackFoot = face.base + burrow.height - 0.3;
    const shaft = new THREE.BoxGeometry(0.34, stackHeight, 0.34);
    shaft.rotateY(face.yaw);
    shaft.translate(burrow.x, stackFoot + stackHeight / 2, burrow.z);
    add(PALETTE.rock, shaft);
    const cap = new THREE.BoxGeometry(0.46, 0.1, 0.46);
    cap.rotateY(face.yaw);
    cap.translate(burrow.x, stackFoot + stackHeight + 0.05, burrow.z);
    add(PALETTE.woodDark, cap);
    chimneys.push(new THREE.Vector3(burrow.x, stackFoot + stackHeight + 0.16, burrow.z));

    // The front garden. A dwelling with no plot around it is a hole in a
    // hill; the paling and its gate are what make it somebody's
    for (const part of frontGarden(random, face, heightAt, palings)) add(part.color, part.geometry);

    // The mound is a mesh now, not terrain, so impassability is set by
    // a circle: otherwise you could walk straight through the burrow
    blockers.push({ x: burrow.x, z: burrow.z, radius: burrow.radius * 0.85 });
    blockers.push({ x: face.x, z: face.z, radius: DOOR_FRAME_RADIUS + 0.4 });
  }

  const merged = mergeGeometries(mounds, false);
  for (const geometry of mounds) geometry.dispose();
  if (merged === null) throw new Error('[burrow] could not merge the mound geometry');
  merged.computeBoundingSphere();

  const parts = new Map<number, THREE.BufferGeometry>();
  for (const [color, geometries] of byColor) {
    const merged = mergeGeometries(geometries, false);
    for (const geometry of geometries) geometry.dispose();
    if (merged === null) throw new Error('[burrow] could not merge the part geometry');
    merged.computeBoundingSphere();
    parts.set(color, merged);
  }

  return { mounds: merged, parts, blockers, palings, chimneys };
}

/**
 * The round door: a boarded leaf in a thick wooden arch.
 *
 * It was spokes, fanned out from the middle, and the comment above them
 * said so — "like a wheel's". It read exactly like a wheel: fifteen cart
 * wheels set in fifteen hillsides, and from any distance the village had
 * no doors at all. This is the signature shape of the whole idiom and it
 * was the ugliest thing in the valley.
 *
 * A round door is BOARDED. Vertical boards, two battens across them, and
 * the knob in the middle — which is the one detail that says this door and
 * no other. Each groove is cut to the chord of the circle at its own
 * offset, so the boarding fills the disc instead of overhanging it, and
 * nothing needs clipping.
 */
function doorFrame(): Array<{ geometry: THREE.BufferGeometry; color: number }> {
  const parts: Array<{ geometry: THREE.BufferGeometry; color: number }> = [];

  const ring = new THREE.TorusGeometry(DOOR_FRAME_RADIUS, DOOR_FRAME_TUBE, 8, 24);
  ring.translate(0, DOOR_CENTER_HEIGHT, 0);
  parts.push({ geometry: ring, color: PALETTE.wood });

  // The joints between the boards, as grooves rather than boards: the leaf
  // behind is already one disc of wood, so a dark line at each joint is the
  // whole of the boarding, at four thin boxes instead of five wide ones.
  // Thin — the first cut made them 25 mm of woodDark standing 20 mm proud,
  // which crossed the two battens and turned the door into a window
  const step = (DOOR_RADIUS * 2) / DOOR_BOARDS;
  for (let i = 1; i < DOOR_BOARDS; i++) {
    const across = -DOOR_RADIUS + i * step;
    const half = Math.sqrt(Math.max(0, DOOR_RADIUS ** 2 - across ** 2));
    if (half < 0.02) continue;
    const groove = new THREE.BoxGeometry(0.014, half * 2, 0.012);
    groove.translate(across, DOOR_CENTER_HEIGHT, 0);
    parts.push({ geometry: groove, color: PALETTE.woodDark });
  }

  // Two battens across the boards. That is what holds a boarded door
  // together, and what makes it read as carpentry rather than as a disc
  for (const at of [-DOOR_BATTEN_AT, DOOR_BATTEN_AT]) {
    const half = Math.sqrt(Math.max(0, DOOR_RADIUS ** 2 - at ** 2));
    const batten = new THREE.BoxGeometry(half * 2 - 0.16, 0.06, 0.03);
    batten.translate(0, DOOR_CENTER_HEIGHT + at, 0);
    parts.push({ geometry: batten, color: PALETTE.woodDark });
  }

  return parts;
}

/**
 * Flagstones in front of the door, each bedded on the ground under itself.
 *
 * They used to be laid at a fixed height above the threshold, and the
 * ground falls away from a threshold — that is what a threshold IS. The
 * far stones hung up to 0.71 m in the air. This is the fifth time this
 * project has laid something off one height sample and watched it float;
 * the others were the hedge feet, the bridge piles, the garden palings and
 * a haycock. The rule, by now: sample under the thing itself.
 *
 * Returned in world coordinates, so these skip `place()` — a stone already
 * put on the ground must not then be lifted back off it by the face.
 */
function pathStones(
  random: () => number,
  face: BurrowFace,
  groundAt: (x: number, z: number) => number,
): THREE.BufferGeometry[] {
  const stones: THREE.BufferGeometry[] = [];
  const outX = Math.sin(face.yaw);
  const outZ = Math.cos(face.yaw);
  const leftX = Math.cos(face.yaw);
  const leftZ = -Math.sin(face.yaw);

  for (let i = 0; i < PATH_STONES; i++) {
    const size = 0.5 + random() * 0.25;
    const turn = (random() - 0.5) * 0.6;
    const side = (random() - 0.5) * 0.5;
    const along = 0.75 + i * 0.72;
    const x = face.x + outX * along + leftX * side;
    const z = face.z + outZ * along + leftZ * side;

    const stone = new THREE.BoxGeometry(size, PATH_STONE_THICKNESS, size * 0.7);
    stone.rotateY(face.yaw + turn);
    // Set into the turf rather than laid on it: a slab standing proud of
    // the grass by its whole thickness reads as dropped, not as laid
    stone.translate(x, groundAt(x, z) + PATH_STONE_THICKNESS * 0.25, z);
    stones.push(stone);
  }
  return stones;
}

/**
 * A check I used to do by eye and got wrong three times: does the door
 * fit into the cut. The generator has to catch this itself.
 */
function checkFits(burrow: Burrow, face: BurrowFace): void {
  if (face.height < DOOR_TOP) {
    console.error(
      `[burrow] ${burrow.id}: arch is ${face.height.toFixed(2)} m tall, ` +
      `the door frame needs ${DOOR_TOP.toFixed(2)} m — raise height`,
    );
  }
  if (face.halfWidth < DOOR_FRAME_RADIUS + 0.45) {
    console.error(
      `[burrow] ${burrow.id}: cut is ${(face.halfWidth * 2).toFixed(2)} m wide — ` +
      'no room around the door frame, increase radius',
    );
  }
}

/**
 * Round windows either side of the door.
 *
 * Skipped where the cut is too narrow to hold them — the mounds differ in
 * radius, and a window running off the edge of the face reads worse than
 * no window at all.
 */
function windows(
  burrow: Burrow,
  face: BurrowFace,
): Array<{ geometry: THREE.BufferGeometry; color: number; out: number }> {
  const parts: Array<{ geometry: THREE.BufferGeometry; color: number; out: number }> = [];
  const radius = 0.32;
  const across = DOOR_FRAME_RADIUS + radius + 0.34;
  if (across + radius > face.halfWidth - 0.18) return parts;

  const height = DOOR_CENTER_HEIGHT + 0.14;
  // How far the hill has already come forward of the door plane out here.
  // Everything in this window is pushed out by that much, so it sits on
  // the surface instead of being half swallowed by it. Taken at the OUTER
  // edge, because that is the part that gets eaten first
  const bulge = Math.max(
    0,
    moundForward(burrow, face.distance, across + radius, height) - face.distance,
  );
  for (const side of [-1, 1]) {
    // Pale, not ink. A black disc in a wooden ring is a hole in a wall;
    // what says window is a pane catching the sky, which at this distance
    // is simply a light cool tone against dark timber
    const glass = new THREE.CircleGeometry(radius, 16);
    glass.translate(side * across, height, 0);
    parts.push({ geometry: glass, color: PALETTE.glass, out: bulge + 0.02 });

    const ring = new THREE.TorusGeometry(radius, 0.055, 6, 18);
    ring.translate(side * across, height, 0);
    parts.push({ geometry: ring, color: PALETTE.wood, out: bulge + 0.06 });

    // A pair of bars, so the light reads as glazed rather than as a hole
    for (const angle of [0, Math.PI / 2]) {
      const bar = new THREE.BoxGeometry(radius * 2, 0.04, 0.04);
      bar.rotateZ(angle);
      bar.translate(side * across, height, 0);
      parts.push({ geometry: bar, color: PALETTE.woodDark, out: bulge + 0.05 });
    }

    // A sill, which is what stops a round window looking like a porthole
    const sill = new THREE.BoxGeometry(radius * 2.3, 0.07, 0.16);
    sill.translate(side * across, height - radius - 0.02, 0);
    parts.push({ geometry: sill, color: PALETTE.wood, out: bulge + 0.08 });
  }
  return parts;
}

/**
 * The step under the door.
 *
 * DOOR_CENTER_HEIGHT less DOOR_FRAME_RADIUS puts the sill 0.31 m up, which
 * on a 1.1 m halfling is a proper step — and until now there was nothing
 * under it. Two courses, the upper set back, so it reads as built rather
 * than as a slab shoved against the hill.
 */
function doorstep(): Array<{ geometry: THREE.BufferGeometry; color: number; out: number }> {
  const parts: Array<{ geometry: THREE.BufferGeometry; color: number; out: number }> = [];
  const sill = DOOR_CENTER_HEIGHT - DOOR_FRAME_RADIUS;

  const lower = new THREE.BoxGeometry(DOOR_FRAME_RADIUS * 2.1, sill * 0.55, 0.62);
  lower.translate(0, sill * 0.275, 0);
  parts.push({ geometry: lower, color: PALETTE.rock, out: 0.3 });

  const upper = new THREE.BoxGeometry(DOOR_FRAME_RADIUS * 1.7, sill * 0.5, 0.42);
  upper.translate(0, sill * 0.75, 0);
  parts.push({ geometry: upper, color: PALETTE.rock, out: 0.2 });

  return parts;
}

/** A hood over the door, on two brackets. */
function porch(
  burrow: Burrow,
  face: BurrowFace,
): Array<{ geometry: THREE.BufferGeometry; color: number; out: number }> {
  const parts: Array<{ geometry: THREE.BufferGeometry; color: number; out: number }> = [];
  const top = DOOR_CENTER_HEIGHT + DOOR_FRAME_RADIUS + 0.16;
  // The hood is wider and higher than the door, so like the windows it
  // reaches ground the dimple has already let go of
  const bulge = Math.max(
    0,
    moundForward(burrow, face.distance, DOOR_FRAME_RADIUS * 1.25, top) - face.distance,
  );

  const hood = new THREE.BoxGeometry(DOOR_FRAME_RADIUS * 2.5, 0.09, 0.52);
  hood.rotateX(-0.16);
  hood.translate(0, top, 0);
  parts.push({ geometry: hood, color: PALETTE.thatch, out: bulge + 0.26 });

  for (const side of [-1, 1]) {
    const bracket = new THREE.BoxGeometry(0.07, 0.34, 0.07);
    bracket.rotateX(0.5);
    bracket.translate(side * DOOR_FRAME_RADIUS * 1.05, top - 0.2, 0);
    parts.push({ geometry: bracket, color: PALETTE.woodDark, out: bulge + 0.14 });
  }
  return parts;
}

/**
 * The front garden: a paling fence in an arc before the door, open where
 * the path comes through.
 *
 * This is the piece that turns fifteen doors in fifteen hills into fifteen
 * households. A boundary you can see over is the point — it says *mine*
 * without shutting the village out, which is exactly what a cottage paling
 * is for.
 */
function frontGarden(
  random: () => number,
  face: BurrowFace,
  groundAt: (x: number, z: number) => number,
  blockers: Circle[],
): Array<{ geometry: THREE.BufferGeometry; color: number }> {
  const parts: Array<{ geometry: THREE.BufferGeometry; color: number }> = [];
  const radius = 3.4;
  const height = 0.62;
  const gate = 0.24;

  // Every piece is set on the ground UNDER ITSELF, and on the ground as
  // BUILT — heightAt, with the pads and the carves in — not on the bare
  // valleyFloor the face is measured from. Lifted to face.base the whole
  // fence stands at one height, and a garden on a bank is a fence with
  // half its pales in the air; measured against bare terrain instead, the
  // forecourt pad rises under it and buries them. The hedges learned this
  // twice over and this still repeated it
  const at = (angle: number, radiusOut: number): { x: number; z: number; y: number } => {
    const lx = Math.sin(angle) * radiusOut;
    const lz = Math.cos(angle) * radiusOut;
    const x = face.x + Math.sin(face.yaw) * lz + Math.cos(face.yaw) * lx;
    const z = face.z + Math.cos(face.yaw) * lz - Math.sin(face.yaw) * lx;
    return { x, z, y: groundAt(x, z) };
  };

  for (let i = 0; i <= 26; i++) {
    const angle = -1.02 + (i / 26) * 2.04;
    if (Math.abs(angle) < gate) continue;
    const p = at(angle, radius);
    const tall = height + random() * 0.05;
    const pale = new THREE.BoxGeometry(0.07, tall, 0.07);
    pale.rotateY(face.yaw - angle);
    // Sunk a little, so no pale ever shows daylight under its own foot
    pale.translate(p.x, p.y + tall / 2 - 0.05, p.z);
    parts.push({ geometry: pale, color: PALETTE.wood });
    // A fence you can walk through is not a boundary, and the gap left in
    // the arc for the path means nothing if the whole arc is walkable.
    // Every pale, both gateposts — nothing here blocked anything before
    blockers.push({ x: p.x, z: p.z, radius: 0.05 });
  }

  // Two rails, PITCHED between their own two pales.
  //
  // They used to be horizontal boxes dropped at the height of the ground
  // under their own midpoint, and the ground under a burrow's forecourt is
  // not level — the pad holds it flat by the door and it falls away at the
  // arc, so adjacent pales differ by a good fraction of a metre. A level
  // rail between two of those floats clear of one and buries itself in the
  // other, which is why every garden in the valley had rails hanging in
  // mid-air beside pales of every height. The bridge planks were the same
  // fault, found the same way: by looking.
  const forward = new THREE.Vector3(0, 0, 1);
  const line = new THREE.Vector3();
  const turn = new THREE.Quaternion();
  for (const share of [0.32, 0.78]) {
    for (const half of [-1, 1]) {
      for (let i = 0; i < 12; i++) {
        const a0 = half * (gate + (1.02 - gate) * (i / 12));
        const a1 = half * (gate + (1.02 - gate) * ((i + 1) / 12));
        const p0 = at(a0, radius);
        const p1 = at(a1, radius);
        const y0 = p0.y + height * share;
        const y1 = p1.y + height * share;
        line.set(p1.x - p0.x, y1 - y0, p1.z - p0.z);
        const length = line.length();
        if (length < 1e-4) continue;
        turn.setFromUnitVectors(forward, line.clone().normalize());
        const rail = new THREE.BoxGeometry(0.04, 0.05, length + 0.02);
        rail.applyQuaternion(turn);
        rail.translate((p0.x + p1.x) / 2, (y0 + y1) / 2, (p0.z + p1.z) / 2);
        parts.push({ geometry: rail, color: PALETTE.woodDark });
      }
    }
  }

  for (const side of [-1, 1]) {
    const p = at(side * gate, radius);
    const tall = height + 0.22;
    const post = new THREE.BoxGeometry(0.11, tall, 0.11);
    post.rotateY(face.yaw - side * gate);
    post.translate(p.x, p.y + tall / 2 - 0.05, p.z);
    parts.push({ geometry: post, color: PALETTE.woodDark });
    blockers.push({ x: p.x, z: p.z, radius: 0.06 });
  }
  return parts;
}
