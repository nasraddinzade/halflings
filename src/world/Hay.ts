import * as THREE from 'three';

import {
  HAY_COCK_HEIGHT,
  HAY_COCK_RADIUS,
  HAY_MARGIN,
  HAY_PER_ACRE,
  HAY_RELIEF,
  HAY_SEED,
} from '../config/constants';
import { PALETTE, darken } from '../config/palette';
import { fields, placesIn, type Field } from '../config/fields';
import { hashSeed, makeRandom } from '../core/random';
import type { Circle } from './Obstacles';
import { heightAt, reliefAt } from './heightfield';
import type { PropBatch } from './props/batch';

/**
 * Haycocks in the meadows.
 *
 * A meadow is not a kind of grass, it is a crop that gets cut once a year
 * — and about half of them are cut at any given moment. `Field.mown`
 * carries that, and the turf reads the same flag, so a mown meadow is
 * both cropped short and standing in cocks. Two states out of one field
 * use, and the valley stops looking as though everything in it happened
 * on the same morning.
 *
 * A cock is a truncated cone with a shallow cap on it. Two full cones
 * stacked was the first cut, and every heap in the valley read as a tent:
 * a heap forked up by hand carries its bulk low and goes in sharply at
 * the shoulder, which is a shape with a flat top rather than a point.
 *
 * Into the shared batch, like everything else the village stands in a
 * field, so a meadow full of them costs no draw call of its own.
 */
export class Hay {
  readonly blockers: Circle[] = [];

  constructor(batch: PropBatch) {
    for (const field of fields()) {
      if (field.use !== 'meadow' || !field.mown) continue;
      const random = makeRandom(hashSeed(`${HAY_SEED}-${field.id}`));
      const cocks = Math.max(2, Math.round(areaOf(field) * HAY_PER_ACRE));
      for (const [x, z] of placesIn(field, cocks, HAY_MARGIN, random)) {
        // Not on a bank. The heap is bedded on the lowest ground its base
        // covers, so broken ground buries it: one cock came out on a
        // slope that fell 0.61 m across its own two-thirds of a metre,
        // which would have sunk the whole skirt
        if (reliefAt(x, z, HAY_COCK_RADIUS) > HAY_RELIEF) continue;
        this.cock(batch, x, z, random);
      }
    }
  }

  private cock(batch: PropBatch, x: number, z: number, random: () => number): void {
    const size = 0.85 + random() * 0.4;
    const radius = HAY_COCK_RADIUS * size;
    const height = HAY_COCK_HEIGHT * size;
    // Bedded on the LOWEST ground its own base covers, not on the sample
    // under its middle: a cone this wide, set on one sample, lifts its
    // rim clear of the turf on the downhill side of any slope
    let base = heightAt(x, z);
    for (let a = 0; a < 6; a++) {
      const angle = (a / 6) * Math.PI * 2;
      base = Math.min(base, heightAt(x + Math.cos(angle) * radius, z + Math.sin(angle) * radius));
    }
    const turn = random() * Math.PI * 2;

    // A truncated cone, not a cone. The first cut was two stacked cones
    // and every cock in the valley read as a tent: a heap forked up by
    // hand carries its bulk low and goes in at the shoulder, and the
    // straight sides of a full cone put the bulk in the wrong half.
    // Seven sides, so the silhouette keeps corners to catch the light
    // under a three-step toon shader instead of dissolving into a curve
    const body = new THREE.CylinderGeometry(radius * 0.66, radius, height * 0.74, 7, 1, false);
    body.rotateY(turn);
    body.translate(x, base + (height * 0.74) / 2, z);
    batch.add(body, PALETTE.hay);

    // The cap, set a little off centre the way a heap forked up by hand
    // never quite finishes plumb
    const lean = (random() - 0.5) * radius * 0.2;
    const cap = new THREE.ConeGeometry(radius * 0.68, height * 0.3, 7, 1, false);
    cap.rotateY(turn + 0.4);
    cap.translate(x + lean, base + height * 0.74 + (height * 0.3) / 2 - height * 0.03, z - lean);
    batch.add(cap, darken(PALETTE.hay, 0.94));

    this.blockers.push({ x, z, radius: radius * 0.9 });
  }
}

/** Shoelace, so a big meadow carries more hay than a small one. */
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
