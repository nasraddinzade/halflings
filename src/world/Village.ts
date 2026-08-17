import * as THREE from 'three';

import {
  GREET_COOLDOWN,
  GREET_RADIUS,
  LOD_ANIMATION_STRIDE,
  LOD_CULL,
  LOD_NEAR,
  NOTICE_EYE_HEIGHT,
  NOTICE_FAR,
  SEPARATION_STRENGTH,
  VILLAGER_COUNT,
  VILLAGER_RADIUS,
} from '../config/constants';
import { VILLAGER_NAMES, type VillagerRole } from '../config/villagers';
import { WORK_POINTS, type WorkPoint } from '../config/work';
import type { AnimationLibrary } from '../character/AnimationLibrary';
import { buildVillager, configFromSeed, type PartLibrary, type Villager } from '../character/buildVillager';
import { VillagerBrain } from '../character/VillagerBrain';
import type { Ground } from './Ground';
import type { Circle, Obstacles } from './Obstacles';

/**
 * The valley's population: assembles villagers from config and hands out
 * their occupations.
 *
 * The role falls out of the seed, while work sites are defined by data
 * (config/work.ts), so their counts and roles need not match. A villager
 * takes the nearest free site of their own role, and if there is no site
 * for that role — they get an idler's site and simply live in the village.
 */
export class Village {
  readonly villagers: Villager[] = [];
  private readonly brains: VillagerBrain[] = [];
  /** Accrued time for villagers whose mixer updates every other frame. */
  private readonly pending: number[] = [];
  private frame = 0;
  private visibleCount = 0;
  /** Villager circles: the player controller reads them via Obstacles. */
  private readonly circles: Circle[] = [];
  /**
   * Whose turn it is to wave, and how long until anyone may again. The
   * token lives here rather than in the brains because a villager cannot
   * see the others, and thirty of them each deciding locally to greet the
   * player produces a stadium wave.
   */
  private greeter: number | null = null;
  private greetCooldown = 0;
  /** Where villagers look: the player's eyes, not their feet. */
  private readonly eyes = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    parts: PartLibrary,
    animations: AnimationLibrary,
    ground: Ground,
    private readonly obstacles: Obstacles,
  ) {
    // Per-role occupancy counter: villagers spread over the sites
    // round-robin instead of crowding onto the first one
    const nextByRole = new Map<VillagerRole, number>();

    for (const name of VILLAGER_NAMES.slice(0, VILLAGER_COUNT)) {
      const config = configFromSeed(name);
      const villager = buildVillager(parts, config);
      const work = assignWork(config.role, nextByRole);

      scene.add(villager.root);
      this.villagers.push(villager);
      this.pending.push(0);
      this.circles.push({ x: 0, z: 0, radius: VILLAGER_RADIUS });
      this.brains.push(new VillagerBrain(villager, animations, ground, work));
    }
  }

  get triangles(): number {
    return this.villagers.reduce((sum, villager) => sum + villager.triangles, 0);
  }

  /** How many villagers are working — handy for the debug panel. */
  get working(): number {
    return this.brains.filter((brain) => brain.currentState === 'work').length;
  }

  /** How many villagers actually made it on screen — a panel metric. */
  get visible(): number {
    return this.visibleCount;
  }

  /**
   * How many have their eyes on the player. Worth a panel row: the whole
   * point of the attention rules is that this number stays small, and it
   * is not something you can eyeball reliably from behind the character.
   */
  get watchers(): number {
    return this.brains.filter((brain) => brain.watching).length;
  }

  /**
   * Distance-based LOD. What costs in a villager is not so much the
   * triangles as the two draw calls (mesh plus outline) and recomputing
   * twenty-three bones every frame. So distant ones lose the outline
   * first, then animation rate, and the farthest are simply not drawn.
   */
  update(delta: number, cameraPosition: THREE.Vector3, playerPosition: THREE.Vector3): void {
    this.frame++;
    this.visibleCount = 0;

    // LOD asks "can it be seen", so it measures from the camera. Noticing
    // asks "is someone standing next to me", which is the player — and the
    // two are three metres apart
    this.eyes.set(playerPosition.x, playerPosition.y + NOTICE_EYE_HEIGHT, playerPosition.z);
    this.updateGreeter(delta, playerPosition);

    for (let i = 0; i < this.brains.length; i++) {
      const brain = this.brains[i];
      const villager = this.villagers[i];
      if (brain === undefined || villager === undefined) continue;

      const distance = villager.root.position.distanceTo(cameraPosition);

      if (distance > LOD_CULL) {
        villager.root.visible = false;
        // We still accrue the time: the villager must not teleport
        // once the player comes back
        this.pending[i] = (this.pending[i] ?? 0) + delta;
        continue;
      }

      villager.root.visible = true;
      this.visibleCount++;

      const near = distance <= LOD_NEAR;
      for (const outline of villager.outlines) outline.visible = near;

      // Only villagers within earshot get a look target; the rest are
      // handed null and their heads stay on whatever the clip says
      const toPlayer = Math.hypot(brain.x - playerPosition.x, brain.z - playerPosition.z);
      const target = toPlayer <= NOTICE_FAR ? this.eyes : null;

      const owed = (this.pending[i] ?? 0) + delta;
      // Up close we update every frame, further out once per
      // LOD_ANIMATION_STRIDE, handing over the accrued time in one go:
      // the animation runs at the same speed, just recomputed less often.
      // The greeter is always stepped: a wave played every third frame
      // stutters, and it is the one animation the player is watching
      if (near || i === this.greeter || (this.frame + i) % LOD_ANIMATION_STRIDE === 0) {
        brain.update(owed, target);
        this.pending[i] = 0;
      } else {
        this.pending[i] = owed;
      }
    }

    this.separate();
    this.publishCircles();
  }

  /**
   * Hands the greeting token to the nearest villager who is free to take
   * it, then holds everyone off until the wave is done and the cooldown
   * has run out.
   */
  private updateGreeter(delta: number, player: THREE.Vector3): void {
    if (this.greeter !== null) {
      // The brain owns when the wave ends, so watch its state rather than
      // running a second timer here that could drift out of step with it
      if (this.brains[this.greeter]?.currentState !== 'greet') {
        this.greeter = null;
        this.greetCooldown = GREET_COOLDOWN;
      }
      return;
    }

    this.greetCooldown = Math.max(0, this.greetCooldown - delta);
    if (this.greetCooldown > 0) return;

    let chosen = -1;
    let closest = GREET_RADIUS;
    for (let i = 0; i < this.brains.length; i++) {
      const brain = this.brains[i];
      if (brain === undefined || !brain.canGreet) continue;
      const distance = Math.hypot(brain.x - player.x, brain.z - player.z);
      if (distance < closest) {
        closest = distance;
        chosen = i;
      }
    }
    if (chosen < 0) return;

    this.brains[chosen]?.startGreeting();
    this.greeter = chosen;
  }

  /**
   * Pushing apart. Villagers converge on shared work sites and without
   * this they stand inside each other. We push by half the overlap and
   * do a single pass: separating them fully in one frame looks like a
   * bounce, and extra passes don't pay off for thirty bodies.
   */
  private separate(): void {
    for (let i = 0; i < this.brains.length; i++) {
      const a = this.brains[i];
      if (a === undefined) continue;

      for (let j = i + 1; j < this.brains.length; j++) {
        const b = this.brains[j];
        if (b === undefined) continue;

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const limit = VILLAGER_RADIUS * 2;
        const squared = dx * dx + dz * dz;
        if (squared >= limit * limit || squared < 1e-8) continue;

        const distance = Math.sqrt(squared);
        const push = ((limit - distance) / distance) * SEPARATION_STRENGTH * 0.5;
        a.nudge(-dx * push, -dz * push);
        b.nudge(dx * push, dz * push);
      }

      // And out of burrow doors: a villager must not stand in the opening
      if (this.obstacles.blocked(a.x, a.z, VILLAGER_RADIUS)) {
        const away = Math.hypot(a.x, a.z) || 1;
        a.nudge((a.x / away) * 0.08, (a.z / away) * 0.08);
      }
    }
  }

  private publishCircles(): void {
    for (let i = 0; i < this.brains.length; i++) {
      const brain = this.brains[i];
      const circle = this.circles[i];
      if (brain === undefined || circle === undefined) continue;
      circle.x = brain.x;
      circle.z = brain.z;
    }
    this.obstacles.setDynamic(this.circles);
  }
}

function assignWork(role: VillagerRole, nextByRole: Map<VillagerRole, number>): WorkPoint {
  const forRole = WORK_POINTS.filter((point) => point.role === role);
  const pool = forRole.length > 0 ? forRole : WORK_POINTS.filter((p) => p.role === 'idler');
  if (pool.length === 0) throw new Error('[village] config/work.ts has no work points at all');

  const index = nextByRole.get(role) ?? 0;
  nextByRole.set(role, index + 1);

  const point = pool[index % pool.length];
  if (point === undefined) throw new Error('[village] could not pick a work point from the pool');
  return point;
}
