import * as THREE from 'three';

import {
  FRAME_BRACE,
  FRAME_PANEL_INSET,
  FRAME_PLINTH,
  FRAME_PLINTH_BURY,
  FRAME_POST,
  FRAME_RAIL,
  FRAME_STUD,
  FRAME_STUD_GAP,
  FRAME_DOOR_HEIGHT,
  FRAME_DOOR_WIDTH,
  FRAME_STOREY,
  ROOF_COAT,
  ROOF_OVERHANG,
  ROOF_RIDGE_BAND,
  STACK_CLEARANCE,
  STACK_WIDTH,
} from '../../config/constants';
import { buildingLength, type Building } from '../../config/buildings';
import { PALETTE } from '../../config/palette';
import type { Circle } from '../Obstacles';
import { heightAt } from '../heightfield';
import type { PropBatch } from '../props/batch';

/**
 * A timber-framed building, from a description.
 *
 * A timber frame is not a box with beams drawn on it: it IS the beams, and
 * the panels are what is left between them. Every member here is a real
 * one — sill, post, wall plate, tie beam, rail, stud, brace — because the
 * silhouette of a frame comes from the frame, and because the panels are
 * set back behind the timber face by FRAME_PANEL_INSET, which is what
 * gives a three-step toon shader a shadow line down every stud without a
 * single texture.
 *
 * Written for the inn and for the mill, which is why bays, depth, pitch
 * and the show face are parameters and everything else is not: two
 * buildings in a fifteen-dwelling village do not justify a joinery
 * library, and a parameter nobody varies is a lie about generality.
 *
 * Nothing here makes a mesh. Parts go into the shared PropBatch, so the
 * frame's timber merges with the sawbenches and its stone with the pound.
 */
export interface BuiltBuilding {
  /** Where a plume of smoke should start, or null for a hearthless one. */
  chimney: THREE.Vector3 | null;
  blockers: Circle[];
  /** Floor level, so anything standing against the wall can find it. */
  floorY: number;
}

export function timberBuilding(building: Building, batch: PropBatch): BuiltBuilding {
  const length = buildingLength(building);
  const { depth, yaw } = building;
  const half = length / 2;
  const halfDepth = depth / 2;

  // The floor sits on the HIGHEST ground under the footprint and the
  // plinth reaches down past the LOWEST — and it is measured, not assumed.
  //
  // The comment that used to stand here said a pad holds this ground level
  // to within about 17 cm, so a fixed 30 cm plinth would swallow it with
  // 13 cm still buried. That was true of the inn, whose site is level to
  // 9 cm. It was never true of the mill: it stands on a bank that falls
  // 1.31 m across its own footprint, so 99% of that footprint had ground
  // BELOW the plinth and you could see straight through underneath the
  // building — 0.59 m of daylight at mid-span, at 70 of 79 stations along
  // its length. Three separate comments asserted the invariant and nothing
  // checked it.
  //
  // Widening the pad instead was tried and measured: every radius that
  // levels the footprint gouges a crater into the rising ground north of
  // the mill (50 to 67 degrees, against a MAX_SLOPE of 50) and lifts the
  // river surface 0.12 m beside the wheel, because the water takes its
  // height from the ground. A bank-side mill does not want level ground.
  // It wants a taller undercroft, which is what it gets here — and what
  // the real thing has.
  let highest = -Infinity;
  let lowest = Infinity;
  for (let u = -half; u <= half; u += 0.4) {
    for (let v = -halfDepth; v <= halfDepth; v += 0.4) {
      const p = place(building, u, v);
      const ground = heightAt(p.x, p.z);
      highest = Math.max(highest, ground);
      lowest = Math.min(lowest, ground);
    }
  }
  const floorY = highest + 0.02;
  // Reaching past the lowest corner, never less than the nominal course
  const plinthHeight = Math.max(FRAME_PLINTH, floorY - lowest + FRAME_PLINTH_BURY);

  const put = (
    geometry: THREE.BufferGeometry,
    color: number,
    u: number,
    y: number,
    v: number,
  ): void => {
    geometry.rotateY(yaw);
    const p = place(building, u, v);
    geometry.translate(p.x, floorY + y, p.z);
    batch.add(geometry, color);
  };

  plinth(put, length, depth, plinthHeight);
  walls(put, length, depth, building);
  roof(put, length, depth, building);
  const chimney = stack(put, length, depth, building, floorY);

  // A building is a wall, not a bush: circles thick enough that nobody
  // squeezes through a stud, spaced so there is no gap between them
  const blockers: Circle[] = [];
  const step = 0.55;
  for (let u = -half; u <= half + 1e-6; u += step) {
    for (const v of [-halfDepth, halfDepth]) {
      const p = place(building, u, v);
      blockers.push({ x: p.x, z: p.z, radius: 0.42 });
    }
  }
  for (let v = -halfDepth + step; v < halfDepth - 1e-6; v += step) {
    for (const u of [-half, half]) {
      const p = place(building, u, v);
      blockers.push({ x: p.x, z: p.z, radius: 0.42 });
    }
  }

  return { chimney, blockers, floorY };
}

/** Height to the wall plate: storeys, not a constant. */
export function eavesOf(building: Building): number {
  return building.storeys * FRAME_STOREY;
}

/** Building-local (along, across) to world. */
function place(building: Building, along: number, across: number): { x: number; z: number } {
  const c = Math.cos(building.yaw);
  const s = Math.sin(building.yaw);
  return {
    x: building.x + c * along + s * across,
    z: building.z - s * along + c * across,
  };
}

type Put = (g: THREE.BufferGeometry, color: number, u: number, y: number, v: number) => void;

/**
 * The stone plinth.
 *
 * It is not decoration. A timber sill beam laid on the ground rots, which
 * is why every surviving frame stands on stone — and here it does a second
 * job: it hides the seam where a straight wall meets a height field that
 * is only ever level to a few centimetres.
 */
function plinth(put: Put, length: number, depth: number, height: number): void {
  const box = new THREE.BoxGeometry(length + 0.24, height, depth + 0.24);
  put(box, PALETTE.rock, 0, -height / 2, 0);
}

/**
 * Sill, posts, plate, ties, rails, studs, braces — and the panels between.
 *
 * Close studding goes only on the show front. It was the expensive way to
 * frame a wall and it was used where it would be seen from the road, so
 * putting it everywhere says nobody was counting the money.
 */
function walls(put: Put, length: number, depth: number, b: Building): void {
  const half = length / 2;
  const halfDepth = depth / 2;
  const eaves = eavesOf(b);
  const bayWidth = length / b.bays;

  // Sill beam and wall plate, all four walls
  for (const v of [-halfDepth, halfDepth]) {
    for (const y of [FRAME_POST / 2, eaves - FRAME_POST / 2]) {
      const beam = new THREE.BoxGeometry(length, FRAME_POST, FRAME_POST);
      put(beam, PALETTE.wood, 0, y, v);
    }
  }
  for (const u of [-half, half]) {
    for (const y of [FRAME_POST / 2, eaves - FRAME_POST / 2]) {
      const beam = new THREE.BoxGeometry(FRAME_POST, FRAME_POST, depth - FRAME_POST * 2);
      put(beam, PALETTE.wood, u, y, 0);
    }
  }

  // Posts at every bay division, and a tie beam across at each one
  for (let i = 0; i <= b.bays; i++) {
    const u = -half + i * bayWidth;
    for (const v of [-halfDepth, halfDepth]) {
      const post = new THREE.BoxGeometry(FRAME_POST, eaves, FRAME_POST);
      put(post, PALETTE.wood, u, eaves / 2, v);
    }
    const tie = new THREE.BoxGeometry(FRAME_POST, FRAME_POST, depth);
    put(tie, PALETTE.wood, u, eaves - FRAME_POST / 2, 0);
  }

  // Panels: one plane per wall, set back behind the timber face. That
  // offset is the whole reason the frame reads under a toon shader —
  // it puts every member's own shadow on the daub beside it
  for (const v of [-halfDepth, halfDepth]) {
    const panel = new THREE.BoxGeometry(length - FRAME_POST, eaves - FRAME_POST, FRAME_POST * 0.5);
    const inset = v < 0 ? FRAME_PANEL_INSET : -FRAME_PANEL_INSET;
    put(panel, PALETTE.plaster, 0, eaves / 2, v + inset);
  }
  for (const u of [-half, half]) {
    const panel = new THREE.BoxGeometry(FRAME_POST * 0.5, eaves - FRAME_POST, depth - FRAME_POST);
    const inset = u < 0 ? FRAME_PANEL_INSET : -FRAME_PANEL_INSET;
    put(panel, PALETTE.plaster, u + inset, eaves / 2, 0);
  }

  // The front. Close studding if this is the show face, box panels if not
  const front = -halfDepth;
  const back = halfDepth;
  for (let i = 0; i < b.bays; i++) {
    const from = -half + i * bayWidth + FRAME_POST;
    const to = -half + (i + 1) * bayWidth - FRAME_POST;

    if (b.showFront) {
      for (let u = from + FRAME_STUD_GAP; u < to - 1e-6; u += FRAME_STUD_GAP) {
        const stud = new THREE.BoxGeometry(FRAME_STUD, eaves - FRAME_POST * 2, FRAME_STUD);
        put(stud, PALETTE.wood, u, eaves / 2, front);
      }
    } else {
      // Box framing: a mid rail and one stud, giving square panels
      const rail = new THREE.BoxGeometry(to - from, FRAME_RAIL, FRAME_STUD);
      put(rail, PALETTE.wood, (from + to) / 2, eaves / 2, front);
      const stud = new THREE.BoxGeometry(FRAME_STUD, eaves - FRAME_POST * 2, FRAME_STUD);
      put(stud, PALETTE.wood, (from + to) / 2, eaves / 2, front);
    }

    // The back is always box framed — nobody paid to be seen from behind
    const rail = new THREE.BoxGeometry(to - from, FRAME_RAIL, FRAME_STUD);
    put(rail, PALETTE.wood, (from + to) / 2, eaves / 2, back);
    const stud = new THREE.BoxGeometry(FRAME_STUD, eaves - FRAME_POST * 2, FRAME_STUD);
    put(stud, PALETTE.wood, (from + to) / 2, eaves / 2, back);
  }

  // Braces in the end bays, both faces. A frame without them racks over,
  // and every real one has them where the wall meets the corner post
  for (const v of [front, back]) {
    for (const side of [-1, 1]) {
      const brace = new THREE.BoxGeometry(FRAME_BRACE, bayWidth * 0.7, FRAME_STUD);
      brace.rotateZ(side * (Math.PI / 4));
      put(brace, PALETTE.wood, side * (half - bayWidth * 0.32), eaves * 0.66, v);
    }
  }

  // The doorway: a dark recess in the middle bay of the show face, with a
  // lintel low enough that a villager has to duck. Absolute heights, not
  // a share of the wall — as a fraction the three-storey mill got a door
  // three metres tall
  const doorway = new THREE.BoxGeometry(FRAME_DOOR_WIDTH, FRAME_DOOR_HEIGHT, FRAME_POST * 0.9);
  put(doorway, PALETTE.woodDark, 0, FRAME_DOOR_HEIGHT / 2, front - 0.02);
  const lintel = new THREE.BoxGeometry(FRAME_DOOR_WIDTH * 1.3, FRAME_RAIL * 1.4, FRAME_STUD * 1.2);
  put(lintel, PALETTE.wood, 0, FRAME_DOOR_HEIGHT + FRAME_RAIL * 0.7, front);

  // Lights either side of the door, dark behind their mullions — one row
  // per storey, because a wall of blank daub three storeys high reads as
  // a warehouse
  for (let storey = 0; storey < b.storeys; storey++) {
    const y = FRAME_STOREY * storey + FRAME_STOREY * 0.62;
    if (y + 0.25 > eaves) break;
    for (const side of [-1, 1]) {
      const light = new THREE.BoxGeometry(0.76, 0.5, FRAME_POST * 0.8);
      put(light, PALETTE.woodDark, side * bayWidth, y, front - 0.02);
      const mullion = new THREE.BoxGeometry(0.06, 0.5, FRAME_STUD);
      put(mullion, PALETTE.wood, side * bayWidth, y, front);
    }
  }
}

/**
 * The roof: two pitched slabs, gable triangles, and a ridge band.
 *
 * The thatch is a shell of real thickness, not a plane. A coat is a couple
 * of hands deep and its edge at the eaves is the one place you can see
 * that — a zero-thickness roof reads as cardboard from the first glance.
 * Pitch is an angle and is never scaled: a 50-degree roof is 50 degrees
 * whatever it covers, and shrinking the pitch with the building is exactly
 * what turns a small world into a diorama.
 */
function roof(put: Put, length: number, depth: number, b: Building): void {
  const pitch = (b.pitch * Math.PI) / 180;
  const halfDepth = depth / 2;
  const eaves = eavesOf(b);
  // The eaves overhang the wall, so the slope runs further than the roof
  // covers. Everything below is measured from the ridge outwards
  const run = halfDepth + ROOF_OVERHANG;
  const ridgeY = eaves + halfDepth * Math.tan(pitch);
  const drop = run * Math.tan(pitch);
  const slope = run / Math.cos(pitch);

  for (const side of [-1, 1]) {
    const plane = new THREE.BoxGeometry(length + ROOF_OVERHANG * 2, ROOF_COAT, slope);
    // rotateX(+p) tips the +Z end downwards, which is what the +v slope
    // wants; the other side needs the opposite sign
    plane.rotateX(side * pitch);
    put(plane, PALETTE.thatch, 0, ridgeY - drop / 2, (side * run) / 2);
  }

  // Ridge band: the capping course, one step lighter than the coat
  const ridge = new THREE.BoxGeometry(length + ROOF_OVERHANG * 2, ROOF_COAT * 0.8, ROOF_RIDGE_BAND);
  put(ridge, PALETTE.grassDry, 0, ridgeY + ROOF_COAT * 0.35, 0);

  // Gable ends: a thin prism filling between the wall plate and the two
  // slopes, at the wall line rather than out at the verge
  for (const side of [-1, 1]) {
    const gable = gableGeometry(depth, halfDepth * Math.tan(pitch));
    put(gable, PALETTE.plaster, side * (length / 2 - 0.06), eaves, 0);
  }
}

/** A gable triangle as a flat prism, apex up, built in the ZY plane. */
function gableGeometry(depth: number, rise: number): THREE.BufferGeometry {
  const t = 0.12;
  const half = depth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-half, 0);
  shape.lineTo(half, 0);
  shape.lineTo(0, rise);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: false });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(t / 2, 0, 0);
  return geometry;
}

/**
 * The brick stack.
 *
 * It clears the ridge by STACK_CLEARANCE, which is a fire rule and not a
 * proportion: a flue that stops short of the ridge draws badly and drops
 * sparks on the thatch it is standing in.
 */
function stack(
  put: Put,
  length: number,
  depth: number,
  b: Building,
  floorY: number,
): THREE.Vector3 | null {
  if (b.stackAt === null) return null;
  const pitch = (b.pitch * Math.PI) / 180;
  const ridgeY = eavesOf(b) + (depth / 2) * Math.tan(pitch);
  const top = ridgeY + STACK_CLEARANCE;
  const u = b.stackAt * length;

  // Stone, not brick. Brick would be its own colour bucket — three draw
  // calls, counting outline and shadow, for twelve triangles — and in a
  // valley whose pound and wellhead are already stone a stone stack is
  // the ordinary thing anyway
  const shaft = new THREE.BoxGeometry(STACK_WIDTH, top, STACK_WIDTH);
  put(shaft, PALETTE.rock, u, top / 2, 0);
  const cap = new THREE.BoxGeometry(STACK_WIDTH * 1.25, 0.12, STACK_WIDTH * 1.25);
  put(cap, PALETTE.woodDark, u, top + 0.06, 0);

  const mouth = place(b, u, 0);
  return new THREE.Vector3(mouth.x, floorY + top + 0.14, mouth.z);
}
