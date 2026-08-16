import * as THREE from 'three';

import {
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
import type { Ground } from '../world/Ground';
import type { AnimationLibrary } from './AnimationLibrary';
import { ClipPlayer } from './ClipPlayer';
import type { Villager } from './buildVillager';

export type VillagerState = 'idle' | 'move' | 'work';

/**
 * Поведение жителя: простой конечный автомат idle → move → work → idle.
 *
 * Каждый житель ходит между местом отдыха и своим рабочим местом.
 * Длительности выведены из имени, как и внешность, — деревня оживает
 * одинаково при каждом запуске, но жители не шагают строем.
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
  private yaw: number;

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

    this.workPoint = new THREE.Vector2(work.x, work.z);
    // За работой житель смотрит на свой реквизит, а не куда пришёл
    this.workYaw = workFacing(work);
    // Место отдыха — в паре метров от рабочего, в своём для каждого
    // направлении: иначе все стояли бы в одной точке
    const angle = this.random() * Math.PI * 2;
    const distance = between(this.random, 2.5, 4.5);
    this.restPoint = new THREE.Vector2(
      work.x + Math.cos(angle) * distance,
      work.z + Math.sin(angle) * distance,
    );
    this.target = this.restPoint;

    this.position.set(this.restPoint.x, 0, this.restPoint.y);
    this.snapToGround();
    this.yaw = this.random() * Math.PI * 2;

    this.clips = new ClipPlayer(villager.mixer);
    for (const name of [CLIP.idle, CLIP.walk, this.workClipName]) {
      this.clips.add(name, animations.require(name));
    }
    // Смещение фазы разводит деревню: без него все дышат в такт
    const idle = animations.require(CLIP.idle);
    this.clips.start(CLIP.idle, this.random() * idle.duration);

    // Первый простой считаем от нуля: с обычным разбросом вся деревня
    // выходила бы на работу почти одновременно и потом шла бы строем
    this.timeLeft = this.random() * VILLAGER_FIRST_IDLE_MAX;
    this.apply();
  }

  get currentState(): VillagerState {
    return this.state;
  }

  get x(): number { return this.position.x; }
  get z(): number { return this.position.z; }

  /**
   * Сдвиг извне: расталкивание жителей и обход дверей. Мозг про соседей
   * не знает — эту работу делает Village, которому видны все сразу.
   */
  nudge(dx: number, dz: number): void {
    this.position.x += dx;
    this.position.z += dz;
    this.snapToGround();
    this.apply();
  }

  update(delta: number): void {
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
        // Доворачиваем к грядке: пришёл он с любой стороны
        this.turnTowards(this.workYaw, delta);
        this.apply();
        if (this.timeLeft <= 0) this.startIdling();
        break;
    }

    this.villager.mixer.update(delta);
  }

  /** Идём то на работу, то обратно на своё место. */
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

  private stepTowardsTarget(delta: number): void {
    this.direction.set(this.target.x - this.position.x, this.target.y - this.position.z);
    const distance = this.direction.length();

    if (distance <= VILLAGER_ARRIVE_RADIUS) {
      // Пришли: на рабочем месте работаем, на своём — отдыхаем
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
    // Кратчайший путь по кругу, иначе разворот пойдёт длинной стороной
    difference = Math.atan2(Math.sin(difference), Math.cos(difference));
    this.yaw += difference * (1 - Math.exp(-VILLAGER_TURN_RATE * delta));
  }

  private apply(): void {
    this.villager.root.position.copy(this.position);
    this.villager.root.rotation.y = this.yaw;
  }

  private crossFade(next: string): void {
    this.clips.fadeTo(next, VILLAGER_CLIP_FADE);
    // Шаг подгоняется под скорость, иначе ноги проскальзывают: root motion
    // в клипах KayKit отсутствует (docs/ASSETS.md, раздел 4)
    if (next === CLIP.walk) {
      this.clips.setTimeScale(VILLAGER_WALK_SPEED / VILLAGER_WALK_CLIP_SPEED);
    }
  }
}
