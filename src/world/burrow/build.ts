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

    const knob = new THREE.SphereGeometry(0.07, 8, 6);
    knob.translate(0, DOOR_CENTER_HEIGHT, 0);
    add(PALETTE.thatch, place(knob, FACE_OFFSET + 0.14));

    for (const stone of pathStones(random)) add(PALETTE.rock, place(stone, FACE_OFFSET));

    // Chimney on the crown of the mound. Its mouth is handed out so the
    // smoke starts exactly where the pipe ends, rather than at a height
    // guessed from the burrow data and drifting the day someone edits it
    const pipeHeight = 0.6;
    const pipeCentre = face.base + burrow.height - 0.15;
    const pipe = new THREE.CylinderGeometry(0.13, 0.16, pipeHeight, 8);
    pipe.translate(burrow.x, pipeCentre, burrow.z);
    add(PALETTE.rock, pipe);
    chimneys.push(new THREE.Vector3(burrow.x, pipeCentre + pipeHeight / 2, burrow.z));

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
