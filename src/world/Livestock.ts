import * as THREE from 'three';

import {
  ANIMAL_BEDDING,
  ANIMAL_CLIP_SPEED,
  ANIMAL_CLIP_SPEED_SPAN,
  ANIMAL_LENGTH,
  ANIMAL_MARGIN,
  ANIMAL_PER_ACRE,
  ANIMAL_RELIEF,
  BULL_SHARE,
  LIVESTOCK_SEED,
  LOD_ANIMATION_STRIDE,
  LOD_CULL,
  LOD_NEAR,
} from '../config/constants';
import { COATS, clipFor, type AnimalKind } from '../config/animals';
import { fields, placesIn, type Field } from '../config/fields';
import { POUND } from '../config/green';
import { hashSeed, makeRandom } from '../core/random';
import { applyStyle } from '../render/style';
import type { AnimalLibrary } from './livestock/library';
import type { Circle } from './Obstacles';
import { lowestAt, reliefAt } from './heightfield';

/**
 * The cattle in the pastures.
 *
 * A pasture with nothing standing in it is a lawn with a hedge round it.
 * Grazing stock is the whole reason the grass is short — the generator
 * crops the turf in a pasture to half the length it stands at in a meadow,
 * and until now nothing in the field explained why.
 *
 * These replace ninety-seven sheep built out of capsules and boxes. That
 * attempt is worth recording rather than quietly deleting: a body, a neck,
 * a head and four legs is not enough of a quadruped, and three rounds of
 * tuning the proportions produced, in order, a periscope, a hammer and a
 * boulder on sticks — and even then it did not move. The lesson is narrow
 * and useful: primitives are right for things that were BUILT — gates,
 * hayricks, fences, carts — and wrong for things that grew.
 *
 * Cattle rather than sheep because the CC0 pack these come from has no
 * sheep in it, and a cow in an English pasture wants no excuse. They are
 * animated: grazing, two idles and a slow walk, each head at its own point
 * in its own clip at its own speed, so a field is not one pose printed
 * nine times.
 *
 * The cost is why the herd is not larger. Each head is one draw call plus
 * one outline and a skeleton of forty-two bones, so the distance ladder
 * the villagers already use applies here (world/Village.ts): the farthest
 * are not drawn at all, the middle distance loses its outline and is
 * animated every third frame with the owed time handed over in one go, and
 * only the near ones are stepped every frame.
 */
export class Livestock {
  readonly group = new THREE.Group();
  readonly blockers: Circle[] = [];

  private readonly beasts: Beast[] = [];
  private readonly pending: number[] = [];
  private frame = 0;
  private visibleCount = 0;

  constructor(library: AnimalLibrary) {
    this.group.name = 'livestock';

    // The stray in the pound.
    //
    // A ring of stone wall with a gate and nothing inside it is a circle
    // for no reason — that is the first thing anyone asked about it. A
    // pound is the pen a stray is shut in until its owner pays to have it
    // back, and one beast standing in it says all of that without a word.
    // It is also the only animal in the valley that is fenced IN rather
    // than fenced out, which is the whole joke of the thing.
    const impounded = makeRandom(hashSeed(`${LIVESTOCK_SEED}-pound`));
    // Dead centre. Off-centre by even a third of the radius put a 2.4 m
    // beast's muzzle through a wall 2.3 m away
    this.place(library, POUND.x, POUND.z, impounded);

    for (const field of fields()) {
      if (field.use !== 'pasture') continue;
      // Its own stream, keyed on the field, so adding a field elsewhere
      // does not restock every other one
      const random = makeRandom(hashSeed(`${LIVESTOCK_SEED}-${field.id}`));
      const head = Math.max(1, Math.round(areaOf(field) * ANIMAL_PER_ACRE));

      for (const [x, z] of placesIn(field, head, ANIMAL_MARGIN, random)) {
        // Not on a break of slope. This is a rigid model standing on one
        // ground sample: unlike the jointed sheep it replaces, it cannot
        // let its downhill legs reach — it simply hangs or sinks
        if (reliefAt(x, z, ANIMAL_LENGTH * 0.45) > ANIMAL_RELIEF) continue;
        this.place(library, x, z, random);
      }
    }
  }

  get visible(): number {
    return this.visibleCount;
  }

  get count(): number {
    return this.beasts.length;
  }

  private place(library: AnimalLibrary, x: number, z: number, random: () => number): void {
    const kind: AnimalKind = random() < BULL_SHARE ? 'bull' : 'cow';
    const coat = Math.min(Math.floor(random() * COATS.length), COATS.length - 1);
    const { root, clips, scale } = library.spawn(kind, coat);

    // On the lowest ground its own footprint covers, less a little, so no
    // hoof is ever left hanging: the model is rigid and cannot let its
    // downhill legs reach the way the jointed sheep before it could
    root.position.set(x, lowestAt(x, z, ANIMAL_LENGTH * 0.45) - ANIMAL_BEDDING, z);
    root.rotation.y = random() * Math.PI * 2;
    root.scale.setScalar(scale);
    root.name = `beast_${this.beasts.length}`;

    const outlines = applyStyle(root, {
      // With vertexColors the surface takes its tone from the mesh, and
      // this colour is used for one thing only: the inverted hull. So it
      // has to be the animal's own coat, not white — a white outline
      // darkened by OUTLINE_DARKEN is a grey halo round a red cow
      color: COATS[coat]?.coat ?? 0xffffff,
      vertexColors: true,
      outline: true,
      castShadow: true,
      receiveShadow: true,
    });

    const mixer = new THREE.AnimationMixer(root);
    const clip = THREE.AnimationClip.findByName(clips, clipFor(random()))
      ?? THREE.AnimationClip.findByName(clips, 'Idle');
    if (clip !== null) {
      const action = mixer.clipAction(clip);
      // Its own place in its own clip, and its own speed
      action.time = random() * clip.duration;
      action.timeScale = ANIMAL_CLIP_SPEED + random() * ANIMAL_CLIP_SPEED_SPAN;
      action.play();
    }

    this.group.add(root);
    this.beasts.push({ root, mixer, outlines });
    this.pending.push(0);
    this.blockers.push({ x, z, radius: ANIMAL_LENGTH * 0.42 });
  }

  /**
   * Distance-based LOD, the villagers' ladder applied to the herd.
   *
   * Measured from the camera rather than the player, because the question
   * it answers is "can this be seen", and the two are three metres apart.
   */
  update(delta: number, cameraPosition: THREE.Vector3): void {
    this.frame++;
    this.visibleCount = 0;

    for (let i = 0; i < this.beasts.length; i++) {
      const beast = this.beasts[i];
      if (beast === undefined) continue;

      const distance = beast.root.position.distanceTo(cameraPosition);
      if (distance > LOD_CULL) {
        beast.root.visible = false;
        // The time is still owed, so a beast does not jump when the player
        // turns back round
        this.pending[i] = (this.pending[i] ?? 0) + delta;
        continue;
      }

      beast.root.visible = true;
      this.visibleCount++;

      const near = distance <= LOD_NEAR;
      for (const outline of beast.outlines) outline.visible = near;

      const owed = (this.pending[i] ?? 0) + delta;
      if (near || (this.frame + i) % LOD_ANIMATION_STRIDE === 0) {
        beast.mixer.update(owed);
        this.pending[i] = 0;
      } else {
        this.pending[i] = owed;
      }
    }
  }

  dispose(): void {
    for (const beast of this.beasts) {
      beast.mixer.stopAllAction();
      beast.mixer.uncacheRoot(beast.root);
    }
    this.group.clear();
  }
}

interface Beast {
  root: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  outlines: THREE.Mesh[];
}

/** Shoelace, so a big pasture carries more stock than a small one. */
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
