import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import {
  BURROWS,
  DOOR_CENTER_HEIGHT,
  DOOR_FRAME_RADIUS,
  DOOR_FRAME_TUBE,
  DOOR_RADIUS,
  FACE_OFFSET,
  PATH_STONES,
  type Burrow,
} from '../../config/burrows';
import { PALETTE } from '../../config/palette';
import { hashSeed, makeRandom } from '../../core/random';
import { buildMoundMesh } from './mesh';
import { DOOR_TOP, faceOf, type BurrowFace } from './profile';

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
  /** Mouth of each chimney. Smoke is emitted from exactly these points. */
  chimneys: THREE.Vector3[];
}

export function buildBurrows(valleyFloorAt: (x: number, z: number) => number): BurrowBuild {
  const mounds: THREE.BufferGeometry[] = [];
  const byColor = new Map<number, THREE.BufferGeometry[]>();
  const blockers: BurrowBuild['blockers'] = [];
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
    for (const part of windows(face)) add(part.color, place(part.geometry, FACE_OFFSET + part.out));

    // A hood over the door, on two brackets. Every door that opens into a
    // hillside has one or the rain runs down the face and in
    for (const part of porch()) add(part.color, place(part.geometry, FACE_OFFSET + part.out));

    const knob = new THREE.SphereGeometry(0.07, 8, 6);
    knob.translate(0, DOOR_CENTER_HEIGHT, 0);
    add(PALETTE.thatch, place(knob, FACE_OFFSET + 0.14));

    for (const stone of pathStones(random)) add(PALETTE.rock, place(stone, FACE_OFFSET));

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
    for (const part of frontGarden(random)) add(part.color, place(part.geometry, FACE_OFFSET));

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

  return { mounds: merged, parts, blockers, chimneys };
}

/** Thick wooden arch with spokes — the mark of a round door. */
function doorFrame(): Array<{ geometry: THREE.BufferGeometry; color: number }> {
  const parts: Array<{ geometry: THREE.BufferGeometry; color: number }> = [];

  const ring = new THREE.TorusGeometry(DOOR_FRAME_RADIUS, DOOR_FRAME_TUBE, 8, 24);
  ring.translate(0, DOOR_CENTER_HEIGHT, 0);
  parts.push({ geometry: ring, color: PALETTE.wood });

  // Spokes fanned out like a wheel's
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI * i) / 5;
    const spoke = new THREE.BoxGeometry(DOOR_FRAME_RADIUS * 1.9, 0.055, 0.05);
    spoke.rotateZ(angle);
    spoke.translate(0, DOOR_CENTER_HEIGHT, 0);
    parts.push({ geometry: spoke, color: PALETTE.woodDark });
  }

  return parts;
}

/** Flagstones in front of the door. */
function pathStones(random: () => number): THREE.BufferGeometry[] {
  const stones: THREE.BufferGeometry[] = [];
  for (let i = 0; i < PATH_STONES; i++) {
    const size = 0.5 + random() * 0.25;
    const stone = new THREE.BoxGeometry(size, 0.08, size * 0.7);
    stone.rotateY((random() - 0.5) * 0.6);
    stone.translate((random() - 0.5) * 0.5, 0.04, 0.75 + i * 0.72);
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
function windows(face: BurrowFace): Array<{ geometry: THREE.BufferGeometry; color: number; out: number }> {
  const parts: Array<{ geometry: THREE.BufferGeometry; color: number; out: number }> = [];
  const radius = 0.32;
  const across = DOOR_FRAME_RADIUS + radius + 0.34;
  if (across + radius > face.halfWidth - 0.18) return parts;

  const height = DOOR_CENTER_HEIGHT + 0.14;
  for (const side of [-1, 1]) {
    const glass = new THREE.CircleGeometry(radius, 16);
    glass.translate(side * across, height, 0);
    parts.push({ geometry: glass, color: PALETTE.ink, out: 0.02 });

    const ring = new THREE.TorusGeometry(radius, 0.055, 6, 18);
    ring.translate(side * across, height, 0);
    parts.push({ geometry: ring, color: PALETTE.wood, out: 0.06 });

    // A pair of bars, so the light reads as glazed rather than as a hole
    for (const angle of [0, Math.PI / 2]) {
      const bar = new THREE.BoxGeometry(radius * 2, 0.04, 0.04);
      bar.rotateZ(angle);
      bar.translate(side * across, height, 0);
      parts.push({ geometry: bar, color: PALETTE.woodDark, out: 0.05 });
    }

    // A sill, which is what stops a round window looking like a porthole
    const sill = new THREE.BoxGeometry(radius * 2.3, 0.07, 0.16);
    sill.translate(side * across, height - radius - 0.02, 0);
    parts.push({ geometry: sill, color: PALETTE.wood, out: 0.08 });
  }
  return parts;
}

/** A hood over the door, on two brackets. */
function porch(): Array<{ geometry: THREE.BufferGeometry; color: number; out: number }> {
  const parts: Array<{ geometry: THREE.BufferGeometry; color: number; out: number }> = [];
  const top = DOOR_CENTER_HEIGHT + DOOR_FRAME_RADIUS + 0.16;

  const hood = new THREE.BoxGeometry(DOOR_FRAME_RADIUS * 2.5, 0.09, 0.52);
  hood.rotateX(-0.16);
  hood.translate(0, top, 0);
  parts.push({ geometry: hood, color: PALETTE.thatch, out: 0.26 });

  for (const side of [-1, 1]) {
    const bracket = new THREE.BoxGeometry(0.07, 0.34, 0.07);
    bracket.rotateX(0.5);
    bracket.translate(side * DOOR_FRAME_RADIUS * 1.05, top - 0.2, 0);
    parts.push({ geometry: bracket, color: PALETTE.woodDark, out: 0.14 });
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
function frontGarden(random: () => number): Array<{ geometry: THREE.BufferGeometry; color: number }> {
  const parts: Array<{ geometry: THREE.BufferGeometry; color: number }> = [];
  const radius = 3.4;
  const height = 0.62;
  // Measured in the face's own frame: the path runs straight out on z
  const gate = 0.24;

  for (let i = 0; i <= 26; i++) {
    const t = i / 26;
    const angle = (-1.02 + t * 2.04);
    if (Math.abs(angle) < gate) continue;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const pale = new THREE.BoxGeometry(0.07, height + random() * 0.05, 0.07);
    pale.rotateY(-angle);
    pale.translate(x, height / 2, z);
    parts.push({ geometry: pale, color: PALETTE.wood });
  }

  // Two rails behind the pales, and a post either side of the gateway
  for (const y of [height * 0.32, height * 0.78]) {
    for (const half of [-1, 1]) {
      for (let i = 0; i < 12; i++) {
        const a0 = half * (gate + (1.02 - gate) * (i / 12));
        const a1 = half * (gate + (1.02 - gate) * ((i + 1) / 12));
        const mid = (a0 + a1) / 2;
        const rail = new THREE.BoxGeometry(0.04, 0.05, radius * Math.abs(a1 - a0) + 0.02);
        rail.rotateY(-mid + Math.PI / 2);
        rail.translate(Math.sin(mid) * radius, y, Math.cos(mid) * radius);
        parts.push({ geometry: rail, color: PALETTE.woodDark });
      }
    }
  }
  for (const side of [-1, 1]) {
    const post = new THREE.BoxGeometry(0.11, height + 0.22, 0.11);
    post.rotateY(-side * gate);
    post.translate(Math.sin(side * gate) * radius, (height + 0.22) / 2, Math.cos(side * gate) * radius);
    parts.push({ geometry: post, color: PALETTE.woodDark });
  }
  return parts;
}
