import * as THREE from 'three';

import {
  BEAST_BODY,
  BEAST_HEAD,
  BEAST_LEG,
  BEAST_LEG_THICK,
  BEAST_MARGIN,
  BEAST_PER_ACRE,
  BEAST_RELIEF,
  LIVESTOCK_SEED,
} from '../config/constants';
import { PALETTE, darken } from '../config/palette';
import { fields, placesIn, type Field } from '../config/fields';
import { hashSeed, makeRandom } from '../core/random';
import type { Circle } from './Obstacles';
import { heightAt, reliefAt } from './heightfield';
import type { PropBatch } from './props/batch';

/**
 * The beasts in the pastures.
 *
 * A pasture with nothing standing in it is a lawn with a hedge round it.
 * Grazing stock is the whole reason the grass is short — the generator
 * already crops the turf in a pasture to half the length it stands at in
 * a meadow, and until now nothing explained why.
 *
 * They do not move, and that is a considered choice rather than a
 * shortcut deferred. A walking flock needs a mixer per animal or a shared
 * skeleton and a clip budget, and it buys motion the player sees from
 * forty metres away across a hedge. A still grazing beast at that
 * distance reads correctly, and merged into the prop batch it costs
 * triangles and nothing else — no draw call, no update, no memory per
 * head beyond its own geometry.
 *
 * Built, not downloaded. Every asset in this project is repainted to one
 * palette anyway (decision #6), so a bought model arrives and gives up
 * the thing it was bought for; and a CC0 animal pack brings its own
 * proportions and its own idea of cute, which then has to sit next to the
 * halflings without fighting them.
 */
export class Livestock {
  readonly blockers: Circle[] = [];

  constructor(batch: PropBatch) {
    for (const field of fields()) {
      if (field.use !== 'pasture') continue;
      // Its own stream, keyed on the field, so adding a field elsewhere
      // does not restock every other one
      const random = makeRandom(hashSeed(`${LIVESTOCK_SEED}-${field.id}`));
      const head = Math.max(2, Math.round(areaOf(field) * BEAST_PER_ACRE));
      for (const [x, z] of placesIn(field, head, BEAST_MARGIN, random)) {
        // Not on a break of slope. Bedding the body on its highest foot
        // is what keeps a leg from poking through the back, but it also
        // means the downhill legs stretch to reach — and a beast with one
        // leg twice the length of another reads as broken, not as standing
        // on a hill
        if (reliefAt(x, z, BEAST_BODY * 0.6) > BEAST_RELIEF) continue;
        this.beast(batch, x, z, random);
      }
    }
  }

  /**
   * One beast: a woolly body on four dark legs, head down in the grass.
   *
   * The head is the whole silhouette. A pale lump on legs reads as a
   * boulder somebody has put a table under; the dark head reaching down
   * to the turf is what says the thing is alive and what it is doing.
   */
  private beast(batch: PropBatch, x: number, z: number, random: () => number): void {
    const facing = random() * Math.PI * 2;
    const size = 0.85 + random() * 0.3;
    const fx = Math.sin(facing);
    const fz = Math.cos(facing);

    // Where the four feet actually stand. A beast set on the one sample
    // under its middle floats on its downhill side by the length of its
    // own body times the slope — the same fault as the hedge feet, the
    // bridge piles and the garden palings, which is three times too many
    // to keep making it. The body rides on the HIGHEST foot so no leg
    // ever pokes up through the back, and each leg is then cut to reach
    // its own ground
    const feet: Array<{ x: number; z: number; y: number }> = [];
    for (const along of [0.3, -0.3]) {
      for (const across of [0.16, -0.16]) {
        const lx = x + fx * BEAST_BODY * size * along - fz * BEAST_BODY * size * across;
        const lz = z + fz * BEAST_BODY * size * along + fx * BEAST_BODY * size * across;
        feet.push({ x: lx, z: lz, y: heightAt(lx, lz) });
      }
    }
    const base = Math.max(...feet.map((f) => f.y));
    // Every beast is a shade off its neighbour: one flock in one cream is
    // a row of the same object, which is what the hedge crown taught
    const fleece = random() < 0.14
      ? darken(PALETTE.fleece, 0.74)
      : darken(PALETTE.fleece, 0.93 + random() * 0.07);

    // A capsule lying along the spine, not a scaled icosahedron. The
    // icosahedron is what the bushes are made of, and at this size it
    // gave every beast in the valley the silhouette of a faceted boulder
    // — the same shape cannot be a shrub and an animal. A capsule is
    // round where a sheep is round and long where a sheep is long, and
    // at six sides it still holds the flat facets the toon shader needs
    const half = (BEAST_BODY * size) / 2;
    const girth = half * 0.54;
    const body = new THREE.CapsuleGeometry(girth, BEAST_BODY * size - girth * 2, 3, 6);
    body.rotateZ(Math.PI / 2);
    body.rotateY(facing);
    const belly = base + BEAST_LEG * size;
    body.translate(x, belly + girth * 0.82, z);
    batch.add(body, fleece);

    // Head down: grazing is the pose a beast in a field is in nearly all
    // the time, and it puts the dark mass low where it reads against the
    // pale body rather than against the sky
    // Neck and head, reaching down into the turf. Grazing is the pose a
    // beast is in nearly all the time, and it puts the dark mass low
    // where it reads against the pale body rather than against the sky
    // Two thirds have their head down in the grass and the rest have it
    // up. All of them grazing is one pose repeated a hundred times, and a
    // head at withers height is the clearer read at a distance — it is
    // the part of the silhouette that says which end is the front.
    //
    // Neck and head are built along the line from the shoulder to the
    // muzzle rather than by rotating each piece into place. Three cuts
    // were spent guessing at the order of rotateX, rotateY and rotateZ,
    // and each one produced a different wrong answer: a periscope, a
    // hammer, and a sheep with a stick in its mouth. Given two points the
    // direction is not a guess.
    const headSize = BEAST_HEAD * size;
    const grazing = random() < 0.62;
    const shoulder = new THREE.Vector3(
      x + fx * half * 0.5,
      belly + girth * 1.3,
      z + fz * half * 0.5,
    );
    const muzzle = grazing
      ? new THREE.Vector3(
        x + fx * (half + headSize * 0.28),
        base + headSize * 0.34,
        z + fz * (half + headSize * 0.28),
      )
      : new THREE.Vector3(
        x + fx * (half + headSize * 0.62),
        belly + girth * 1.75,
        z + fz * (half + headSize * 0.62),
      );

    const along = muzzle.clone().sub(shoulder);
    const reach = along.length();
    const turn = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      along.clone().normalize(),
    );

    // Thick. A neck a third of the body's girth and a head barely fatter
    // than the neck gave the flock the profile of anteaters
    const neck = new THREE.CapsuleGeometry(headSize * 0.44, Math.max(0.02, reach - headSize * 0.7), 2, 5);
    neck.applyQuaternion(turn);
    neck.translate(
      (shoulder.x + muzzle.x) / 2,
      (shoulder.y + muzzle.y) / 2,
      (shoulder.z + muzzle.z) / 2,
    );
    batch.add(neck, PALETTE.fleeceDark);

    // The head carries on the same line, a little fatter than the neck
    const head = new THREE.CapsuleGeometry(headSize * 0.56, headSize * 0.55, 2, 6);
    head.applyQuaternion(turn);
    head.translate(muzzle.x, muzzle.y, muzzle.z);
    batch.add(head, PALETTE.fleeceDark);

    // Four legs, each reaching from the belly down to its own ground
    for (const foot of feet) {
      const length = belly - foot.y;
      if (length <= 0.01) continue;
      const leg = new THREE.BoxGeometry(BEAST_LEG_THICK, length, BEAST_LEG_THICK);
      leg.translate(foot.x, foot.y + length / 2, foot.z);
      batch.add(leg, PALETTE.fleeceDark);
    }

    this.blockers.push({ x, z, radius: BEAST_BODY * size * 0.55 });
  }
}

/** Shoelace, for stocking a field by its size rather than by its count. */
function areaOf(field: Field): number {
  const p = field.points;
  let twice = 0;
  for (let a = 0, b = p.length - 1; a < p.length; b = a++) {
    const u = p[a];
    const v = p[b];
    if (u === undefined || v === undefined) continue;
    twice += (v[0] + u[0]) * (v[1] - u[1]);
  }
  return Math.abs(twice) / 2;
}
