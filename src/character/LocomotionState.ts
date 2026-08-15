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
import { ClipPlayer } from './ClipPlayer';

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
 * Машина состояний анимаций игрока.
 *
 * Root motion в клипах KayKit отсутствует — ходьба и бег «бегут на
 * месте» (проверено при инвентаризации: смещение кости root ненулевое
 * только у четырёх клипов уворота). Значит скорость задаёт контроллер,
 * а клип подгоняется под неё через timeScale, иначе ноги проскальзывают.
 *
 * Переключением клипов заведует ClipPlayer, здесь только правила выбора.
 */
export class LocomotionState {
  private readonly clips: ClipPlayer;
  private current: ClipKey = 'idle';
  /** Не даём приземлению прерваться следующим же кадром. */
  private landingLeft = 0;

  constructor(mixer: THREE.AnimationMixer, library: AnimationLibrary) {
    this.clips = new ClipPlayer(mixer);

    for (const [key, name] of Object.entries(CLIP) as Array<[ClipKey, string]>) {
      // Прыжок и приземление играются один раз и замирают на последнем кадре
      const once = key === 'jumpStart' || key === 'jumpLand';
      this.clips.add(key, library.require(name), { once });
    }

    this.clips.start('idle');
  }

  /** Имя текущего клипа — его показывает отладочная панель. */
  get currentClip(): string {
    return CLIP[this.current];
  }

  update(input: LocomotionInput, delta: number): void {
    if (this.landingLeft > 0) this.landingLeft -= delta;

    const next = this.pick(input);
    if (next !== this.current) {
      // На отрыв от земли переключаемся резче: плавный переход
      // размазал бы толчок и прыжок выглядел бы вялым
      this.clips.fadeTo(next, next === 'jumpStart' ? ANIM_FADE_FAST : ANIM_FADE);
      this.current = next;
      if (next === 'jumpLand') {
        this.landingLeft = this.clips.require('jumpLand').getClip().duration;
      }
    }

    this.syncSpeed(input.speed);
  }

  private pick(input: LocomotionInput): ClipKey {
    if (input.jumped) return 'jumpStart';

    if (!input.grounded) {
      // Пока идёт короткий Jump_Start, не перебиваем его петлёй полёта
      const start = this.clips.require('jumpStart');
      const startPlaying = this.current === 'jumpStart' && start.time < start.getClip().duration;
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
    if (this.current !== 'walk' && this.current !== 'run') return;

    const natural = this.current === 'walk' ? WALK_CLIP_SPEED : RUN_CLIP_SPEED;
    this.clips.setTimeScale(THREE.MathUtils.clamp(
      speed / natural,
      CLIP_TIME_SCALE_MIN,
      CLIP_TIME_SCALE_MAX,
    ));
  }
}
