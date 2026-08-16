import * as THREE from 'three';

/**
 * A set of clips on a single mixer, switched with cross-fades.
 *
 * A bare wrapper over `AnimationMixer`: no logic about when to play
 * what lives here — that is the job of `LocomotionState` for the
 * player and `VillagerBrain` for the villagers. Each of them used to
 * keep its own copy of the same switching code, and the copies had
 * already started drifting apart in small details.
 *
 * What is worth keeping in one place: `crossFadeFrom` has a
 * requirement that is easy to forget — the target action must be
 * reset, enabled and started with weight 1 **before** the call,
 * otherwise the transition runs from zero to zero and the T-pose
 * shows through for a frame.
 */
export interface ClipOptions {
  /** Play once and freeze on the last frame. */
  once?: boolean;
}

export class ClipPlayer {
  private readonly actions = new Map<string, THREE.AnimationAction>();
  private currentName = '';

  constructor(private readonly mixer: THREE.AnimationMixer) {}

  add(name: string, clip: THREE.AnimationClip, options: ClipOptions = {}): this {
    const action = this.mixer.clipAction(clip);
    if (options.once === true) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    this.actions.set(name, action);
    return this;
  }

  /** Name of the clip that is playing right now. */
  get current(): string {
    return this.currentName;
  }

  /**
   * Starts the first clip with no transition. `offset` spreads the
   * phases apart — otherwise a dozen characters breathe in unison.
   */
  start(name: string, offset = 0): void {
    const action = this.require(name);
    action.reset();
    action.play();
    action.time = offset;
    this.currentName = name;
  }

  /** Fade to another clip. Fading to the same clip does nothing. */
  fadeTo(name: string, duration: number): void {
    if (name === this.currentName) return;

    const from = this.require(this.currentName);
    const to = this.require(name);

    to.reset();
    to.enabled = true;
    to.setEffectiveWeight(1);
    to.timeScale = 1;
    to.play();
    to.crossFadeFrom(from, duration, false);

    this.currentName = name;
  }

  /** Playback rate of the current clip: it matches stride to speed. */
  setTimeScale(scale: number): void {
    this.require(this.currentName).timeScale = scale;
  }

  /** Action by name — needed where the time inside the clip matters. */
  require(name: string): THREE.AnimationAction {
    const action = this.actions.get(name);
    if (action === undefined) {
      throw new Error(`[clips] нет клипа "${name}". Есть: ${[...this.actions.keys()].join(', ')}`);
    }
    return action;
  }
}
