import * as THREE from 'three';

import {
  ANIM_FADE,
  ANIM_FADE_FAST,
  CLIP_TIME_SCALE_MAX,
  CLIP_TIME_SCALE_MIN,
  RUN_CLIP_SPEED,
  WALK_CLIP_SPEED,
  WALK_SPEED,
} from '../config/constants';
import { CLIP, type ClipKey } from '../config/assets';
import type { AnimationLibrary } from './AnimationLibrary';

/** Что контроллер сообщает про персонажа каждый кадр. */
export interface LocomotionInput {
  /** Горизонтальная скорость, м/с. */
  speed: number;
  grounded: boolean;
  /** Вертикальная скорость: по знаку различаем взлёт и падение. */
  verticalSpeed: number;
  /** Взведён в кадре, когда прыжок только что оттолкнулся. */
  jumped: boolean;
}

/**
 * Машина состояний анимаций.
 *
 * Root motion в клипах KayKit отсутствует — ходьба и бег «бегут на месте»
 * (проверено при инвентаризации: смещение кости root ненулевое только
 * у четырёх клипов уворота). Значит скорость задаёт контроллер, а клип
 * подгоняется под неё через timeScale — иначе ноги проскальзывают.
 */
export class LocomotionState {
  private readonly actions = new Map<ClipKey, THREE.AnimationAction>();
  private current: ClipKey = 'idle';
  /** Не даём приземлению прерваться следующим же кадром. */
  private landingLeft = 0;

  constructor(mixer: THREE.AnimationMixer, library: AnimationLibrary) {
    for (const [key, name] of Object.entries(CLIP) as Array<[ClipKey, string]>) {
      const action = mixer.clipAction(library.require(name));
      this.actions.set(key, action);
    }

    // Прыжок и приземление играются один раз и замирают на последнем кадре
    for (const key of ['jumpStart', 'jumpLand'] as const) {
      const action = this.get(key);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }

    this.get('idle').play();
  }

  /** Имя текущего клипа — пригодится отладочной панели на шаге 2. */
  get currentClip(): string {
    return CLIP[this.current];
  }

  update(input: LocomotionInput, delta: number): void {
    if (this.landingLeft > 0) this.landingLeft -= delta;

    const next = this.pick(input);
    if (next !== this.current) {
      // На отрыв от земли переключаемся резче: плавный переход
      // размазал бы толчок и прыжок выглядел бы вялым
      const fade = next === 'jumpStart' ? ANIM_FADE_FAST : ANIM_FADE;
      this.crossFade(next, fade);
      if (next === 'jumpLand') this.landingLeft = this.get('jumpLand').getClip().duration;
    }

    this.syncSpeed(input.speed);
  }

  private pick(input: LocomotionInput): ClipKey {
    if (input.jumped) return 'jumpStart';

    if (!input.grounded) {
      // Пока идёт короткий Jump_Start, не перебиваем его петлёй полёта
      const startAction = this.get('jumpStart');
      const startPlaying = this.current === 'jumpStart' && startAction.time < startAction.getClip().duration;
      return startPlaying ? 'jumpStart' : 'jumpAir';
    }

    // Только что коснулись земли — доигрываем приземление
    if (this.current === 'jumpAir' || this.current === 'jumpStart') return 'jumpLand';
    if (this.current === 'jumpLand' && this.landingLeft > 0 && input.speed < WALK_SPEED * 0.5) {
      return 'jumpLand';
    }

    if (input.speed < 0.1) return 'idle';
    return input.speed > WALK_SPEED * 1.15 ? 'run' : 'walk';
  }

  private syncSpeed(speed: number): void {
    if (this.current === 'walk' || this.current === 'run') {
      const natural = this.current === 'walk' ? WALK_CLIP_SPEED : RUN_CLIP_SPEED;
      this.get(this.current).timeScale = THREE.MathUtils.clamp(
        speed / natural,
        CLIP_TIME_SCALE_MIN,
        CLIP_TIME_SCALE_MAX,
      );
    }
  }

  private crossFade(next: ClipKey, duration: number): void {
    const from = this.get(this.current);
    const to = this.get(next);

    to.reset();
    to.enabled = true;
    to.setEffectiveWeight(1);
    to.timeScale = 1;
    to.play();
    to.crossFadeFrom(from, duration, false);

    this.current = next;
  }

  private get(key: ClipKey): THREE.AnimationAction {
    const action = this.actions.get(key);
    if (action === undefined) throw new Error(`[locomotion] нет действия для "${key}"`);
    return action;
  }
}
