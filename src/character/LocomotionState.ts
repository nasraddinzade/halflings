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

/** What the controller reports about the character every frame. */
export interface LocomotionInput {
  /** Horizontal speed, m/s. */
  speed: number;
  grounded: boolean;
  /** Vertical speed: the sign tells rising apart from falling. */
  verticalSpeed: number;
  /** Raised on the frame where the jump has just pushed off. */
  jumped: boolean;
}

/**
 * Animation state machine for the player.
 *
 * KayKit clips carry no root motion — walking and running "run in
 * place" (checked during the asset inventory: the root bone offset is
 * non-zero only in the four dodge clips). So the controller sets the
 * speed and the clip is fitted to it via timeScale, otherwise the feet
 * slide.
 *
 * ClipPlayer handles the switching; only the selection rules live here.
 */
export class LocomotionState {
  private readonly clips: ClipPlayer;
  private current: ClipKey = 'idle';
  /** Keeps the landing from being cut off on the very next frame. */
  private landingLeft = 0;

  constructor(mixer: THREE.AnimationMixer, library: AnimationLibrary) {
    this.clips = new ClipPlayer(mixer);

    for (const [key, name] of Object.entries(CLIP) as Array<[ClipKey, string]>) {
      // Jump and landing play once and freeze on the last frame
      const once = key === 'jumpStart' || key === 'jumpLand';
      this.clips.add(key, library.require(name), { once });
    }

    this.clips.start('idle');
  }

  /** Name of the current clip — the debug panel displays it. */
  get currentClip(): string {
    return CLIP[this.current];
  }

  update(input: LocomotionInput, delta: number): void {
    if (this.landingLeft > 0) this.landingLeft -= delta;

    const next = this.pick(input);
    if (next !== this.current) {
      // Switch harder on leaving the ground: a smooth fade would
      // smear the push-off and the jump would look limp
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
      // While the short Jump_Start runs, don't cut it off with the air loop
      const start = this.clips.require('jumpStart');
      const startPlaying = this.current === 'jumpStart' && start.time < start.getClip().duration;
      return startPlaying ? 'jumpStart' : 'jumpAir';
    }

    // Just touched down — play the landing through
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
