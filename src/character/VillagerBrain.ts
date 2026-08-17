import * as THREE from 'three';

import {
  NOTICE_AWAY_MAX,
  NOTICE_AWAY_MIN,
  NOTICE_GLANCE_MAX,
  NOTICE_GLANCE_MIN,
  NOTICE_INCURIOUS_SHARE,
  NOTICE_WORK_FACTOR,
  VILLAGER_ARRIVE_RADIUS,
  VILLAGER_CLIP_FADE,
  VILLAGER_FIRST_IDLE_MAX,
  VILLAGER_IDLE_MAX,
  VILLAGER_IDLE_MIN,
  VILLAGER_TURN_RATE,
  VILLAGER_WALK_CLIP_SPEED,
  VILLAGER_WALK_SPEED,
  VILLAGER_WORK_MAX,
  VILLAGER_WORK_MIN,
} from '../config/constants';
import { CLIP } from '../config/assets';
import { ROLE_WORK_CLIP, workFacing, type WorkPoint } from '../config/work';
import { between, hashSeed, makeRandom } from '../core/random';
import { heightAt, waterDepthAt } from '../world/heightfield';
import type { Ground } from '../world/Ground';
import type { AnimationLibrary } from './AnimationLibrary';
import { ClipPlayer } from './ClipPlayer';
import { HeadLook } from './HeadLook';
import type { Villager } from './buildVillager';

export type VillagerState = 'idle' | 'move' | 'work' | 'greet';

/**
 * Villager behaviour: a simple state machine idle → move → work → idle.
 *
 * Every villager walks between a resting spot and their own workplace.
 * The durations are derived from the name, same as the looks — the village
 * comes alive identically on every run, but nobody marches in step.
 */
export class VillagerBrain {
  private state: VillagerState = 'idle';
  private timeLeft: number;

  private readonly random: () => number;
  private readonly restPoint: THREE.Vector2;
  private readonly workPoint: THREE.Vector2;
  private target: THREE.Vector2;
  private readonly workYaw: number;

  private readonly clips: ClipPlayer;
  private readonly headLook: HeadLook;
  private yaw: number;
  /** What the state was before a greeting interrupted it. */
  private interrupted: VillagerState = 'idle';

  /**
   * Attention runs on its own generator, seeded from the same name.
   *
   * It has to: how often this villager looks up depends on where the
   * player walks, so drawing it from the main stream would make their
   * idle and work durations depend on the player too — and a village
   * whose whole schedule shifts because you walked past is not the
   * deterministic one decision #2 asks for.
   */
  private readonly attentionRandom: () => number;
  /** 0 for those who never look up at all. */
  private readonly curiosity: number;
  /**
   * The attention cycle's own state, which keeps running whether or not
   * anyone is nearby. Separating it from `watchingNow` is what stops the
   * whole village rolling the dice on the same frame every time the
   * player walks back into range.
   */
  private attentive = false;
  private attentionLeft: number;
  private watchingNow = false;

  private readonly position = new THREE.Vector3();
  private readonly direction = new THREE.Vector2();

  constructor(
    private readonly villager: Villager,
    animations: AnimationLibrary,
    private readonly ground: Ground,
    work: WorkPoint,
    private readonly workClipName: string = ROLE_WORK_CLIP[villager.config.role],
  ) {
    this.random = makeRandom(hashSeed(villager.config.id));
    this.attentionRandom = makeRandom(hashSeed(`${villager.config.id}:attention`));
    // The incurious end of the village never looks up at all. The rest
    // vary, but none of them is wholly reliable about it
    const roll = this.attentionRandom();
    this.curiosity = roll < NOTICE_INCURIOUS_SHARE
      ? 0
      : 0.5 + ((roll - NOTICE_INCURIOUS_SHARE) / (1 - NOTICE_INCURIOUS_SHARE)) * 0.5;
    // Start each villager at a different point in the cycle. Without this
    // every one of them reaches their first decision on frame one and a
    // third of the village looks up in the same instant
    this.attentionLeft = this.attentionRandom() * NOTICE_AWAY_MAX;

    this.workPoint = new THREE.Vector2(work.x, work.z);
    // While working a villager faces their prop, not the way they came in
    this.workYaw = workFacing(work);
    // The resting spot sits a couple of metres from the workplace, in a
    // direction of its own for each villager: otherwise they'd all stand
    // in the same point
    const angle = this.random() * Math.PI * 2;
    const distance = between(this.random, 2.5, 4.5);
    // Fisher work points sit four metres from the river axis, so an
    // unconstrained angle put five of the nine standing in the deepest
    // water playing their idle. Turn the offset rather than redraw it:
    // another draw here would shift every later number in this villager's
    // stream and reshuffle the whole village's day
    let chosen = angle;
    for (let i = 0; i < 8; i++) {
      const candidate = angle + (i * Math.PI) / 4;
      const x = work.x + Math.cos(candidate) * distance;
      const z = work.z + Math.sin(candidate) * distance;
      if (waterDepthAt(x, z, heightAt(x, z)) === 0) {
        chosen = candidate;
        break;
      }
    }
    this.restPoint = new THREE.Vector2(
      work.x + Math.cos(chosen) * distance,
      work.z + Math.sin(chosen) * distance,
    );
    this.target = this.restPoint;

    this.position.set(this.restPoint.x, 0, this.restPoint.y);
    this.snapToGround();
    this.yaw = this.random() * Math.PI * 2;

    this.clips = new ClipPlayer(villager.mixer);
    for (const name of [CLIP.idle, CLIP.walk, this.workClipName]) {
      this.clips.add(name, animations.require(name));
    }
    // Once, not looped: a wave that repeats stops being a greeting
    this.clips.add(CLIP.wave, animations.require(CLIP.wave), { once: true });
    this.headLook = new HeadLook(villager.mesh.skeleton, villager.root);
    // The phase offset spreads the village out: without it all breathe in time
    const idle = animations.require(CLIP.idle);
    this.clips.start(CLIP.idle, this.random() * idle.duration);

    // The first idle runs from zero: with the usual spread the whole village
    // would set off for work at almost the same time and then march in step
    this.timeLeft = this.random() * VILLAGER_FIRST_IDLE_MAX;
    this.apply();
  }

  get currentState(): VillagerState {
    return this.state;
  }

  get x(): number { return this.position.x; }
  get z(): number { return this.position.z; }

  /**
   * A nudge from outside: pushing villagers apart and routing around doors.
   * The brain knows nothing about neighbours — that job belongs to Village,
   * which sees all of them at once.
   */
  nudge(dx: number, dz: number): void {
    this.position.x += dx;
    this.position.z += dz;
    this.snapToGround();
    this.apply();
  }

  /** Ready to be picked as the one villager who greets the player. */
  get canGreet(): boolean {
    return this.state === 'idle' || this.state === 'work';
  }

  /** Whether this one currently has their eyes on the player. */
  get watching(): boolean {
    return this.watchingNow;
  }

  /**
   * Stop, straighten up and wave. Village hands this out to one villager
   * at a time; the brain does not decide it for itself, because deciding
   * it locally is how thirty of them end up waving at once.
   */
  startGreeting(): void {
    if (!this.canGreet) return;
    this.interrupted = this.state;
    this.state = 'greet';
    this.timeLeft = this.clips.require(CLIP.wave).getClip().duration;
    this.crossFade(CLIP.wave);
  }

  /**
   * `player` is where the villager should look, or null when nobody is
   * near enough to be worth noticing.
   */
  update(delta: number, player: THREE.Vector3 | null): void {
    switch (this.state) {
      case 'idle':
        this.timeLeft -= delta;
        if (this.timeLeft <= 0) this.startMoving();
        break;
      case 'move':
        this.stepTowardsTarget(delta);
        break;
      case 'work':
        this.timeLeft -= delta;
        // Turn the rest of the way to the bed: he arrived from any side
        this.turnTowards(this.workYaw, delta);
        this.apply();
        if (this.timeLeft <= 0) this.startIdling();
        break;
      case 'greet':
        this.timeLeft -= delta;
        // Face the player squarely: a wave delivered over the shoulder
        // is not a greeting
        if (player !== null) {
          this.turnTowards(
            Math.atan2(player.x - this.position.x, player.z - this.position.z),
            delta,
          );
          this.apply();
        }
        if (this.timeLeft <= 0) this.finishGreeting();
        break;
    }

    this.villager.mixer.update(delta);

    this.updateAttention(player !== null, delta);
    const target = this.watchingNow ? player : null;

    // After the mixer, always. It rewrites every bone from the clip, so a
    // head turn applied before it would be thrown away the same frame
    if (target !== null || !this.headLook.idle) {
      this.villager.root.updateMatrixWorld(true);
      this.headLook.apply(target, this.yaw, delta);
    }
  }

  /**
   * Decides whether this villager is currently bothering to look.
   *
   * A flip-flop rather than a per-frame probability: once the decision is
   * made it holds for a few seconds, so the head settles instead of
   * twitching on and off. The greeter is exempt — someone waving at you
   * is, by definition, looking at you.
   */
  private updateAttention(playerNear: boolean, delta: number): void {
    if (this.state === 'greet') {
      this.watchingNow = true;
      return;
    }

    if (this.curiosity === 0) {
      this.watchingNow = false;
      return;
    }

    // The cycle turns whether or not anyone is here to be looked at, so
    // the village stays out of step with itself
    this.attentionLeft -= delta;
    if (this.attentionLeft <= 0) {
      if (this.attentive) {
        this.attentive = false;
        this.attentionLeft = between(this.attentionRandom, NOTICE_AWAY_MIN, NOTICE_AWAY_MAX);
      } else {
        // Hands full means a lower chance of looking up, not a longer
        // wait: a gardener glances as often as anyone, just mostly not
        const chance = this.curiosity * (this.state === 'work' ? NOTICE_WORK_FACTOR : 1);
        this.attentive = this.attentionRandom() < chance;
        this.attentionLeft = this.attentive
          ? between(this.attentionRandom, NOTICE_GLANCE_MIN, NOTICE_GLANCE_MAX)
          : between(this.attentionRandom, NOTICE_AWAY_MIN, NOTICE_AWAY_MAX);
      }
    }

    this.watchingNow = this.attentive && playerNear;
  }

  /** We walk to work, then back to our own spot, and so on. */
  private startMoving(): void {
    this.target = this.target === this.restPoint ? this.workPoint : this.restPoint;
    this.state = 'move';
    this.crossFade(CLIP.walk);
  }

  private startWorking(): void {
    this.state = 'work';
    this.timeLeft = between(this.random, VILLAGER_WORK_MIN, VILLAGER_WORK_MAX);
    this.crossFade(this.workClipName);
  }

  private startIdling(): void {
    this.state = 'idle';
    this.timeLeft = between(this.random, VILLAGER_IDLE_MIN, VILLAGER_IDLE_MAX);
    this.crossFade(CLIP.idle);
  }

  /**
   * Back to whatever was interrupted. Going back to work rather than
   * always to idle is what keeps a greeting from resetting the villager's
   * day: the gardener who waved mid-dig picks the spade back up.
   */
  private finishGreeting(): void {
    if (this.interrupted === 'work') this.startWorking();
    else this.startIdling();
  }

  private stepTowardsTarget(delta: number): void {
    this.direction.set(this.target.x - this.position.x, this.target.y - this.position.z);
    const distance = this.direction.length();

    if (distance <= VILLAGER_ARRIVE_RADIUS) {
      // Arrived: at the workplace we work, at our own spot we rest
      if (this.target === this.workPoint) this.startWorking();
      else this.startIdling();
      return;
    }

    this.direction.divideScalar(distance);
    const step = Math.min(VILLAGER_WALK_SPEED * delta, distance);
    this.position.x += this.direction.x * step;
    this.position.z += this.direction.y * step;
    this.snapToGround();

    this.turnTowards(Math.atan2(this.direction.x, this.direction.y), delta);
    this.apply();
  }

  private snapToGround(): void {
    const sample = this.ground.sample(this.position.x, this.position.z);
    if (sample !== null) this.position.y = sample.height;
  }

  private turnTowards(targetYaw: number, delta: number): void {
    let difference = targetYaw - this.yaw;
    // Shortest way round the circle, otherwise the turn takes the long side
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    this.yaw += difference * (1 - Math.exp(-VILLAGER_TURN_RATE * delta));
  }

  private apply(): void {
    this.villager.root.position.copy(this.position);
    this.villager.root.rotation.y = this.yaw;
  }

  private crossFade(next: string): void {
    this.clips.fadeTo(next, VILLAGER_CLIP_FADE);
    // The stride is matched to the speed, otherwise the feet slip: KayKit
    // clips have no root motion (docs/ASSETS.md, section 4)
    if (next === CLIP.walk) {
      this.clips.setTimeScale(VILLAGER_WALK_SPEED / VILLAGER_WALK_CLIP_SPEED);
    }
  }
}
