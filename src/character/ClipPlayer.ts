import * as THREE from 'three';

/**
 * Набор клипов на одном микшере с переключением через кроссфейд.
 *
 * Голая обёртка над `AnimationMixer`: никакой логики о том, когда что
 * играть, здесь нет — этим заняты `LocomotionState` у игрока и
 * `VillagerBrain` у жителей. Раньше каждый из них держал свою копию
 * одного и того же кода переключения, и они уже начали расходиться
 * в мелочах.
 *
 * Что именно стоит держать в одном месте: у `crossFadeFrom` есть
 * требование, о котором легко забыть, — целевое действие должно быть
 * сброшено, включено и запущено с весом 1 **до** вызова, иначе переход
 * идёт из нуля в ноль и на кадр проступает T-поза.
 */
export interface ClipOptions {
  /** Играть один раз и замереть на последнем кадре. */
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

  /** Имя клипа, который играет сейчас. */
  get current(): string {
    return this.currentName;
  }

  /**
   * Запускает первый клип без перехода. `offset` разводит фазы —
   * иначе десяток персонажей дышит в такт.
   */
  start(name: string, offset = 0): void {
    const action = this.require(name);
    action.reset();
    action.play();
    action.time = offset;
    this.currentName = name;
  }

  /** Переход на другой клип. На тот же клип — ничего не делает. */
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

  /** Скорость проигрывания текущего клипа: ею гонят шаг под скорость. */
  setTimeScale(scale: number): void {
    this.require(this.currentName).timeScale = scale;
  }

  /** Действие по имени — нужно там, где важно время внутри клипа. */
  require(name: string): THREE.AnimationAction {
    const action = this.actions.get(name);
    if (action === undefined) {
      throw new Error(`[clips] нет клипа "${name}". Есть: ${[...this.actions.keys()].join(', ')}`);
    }
    return action;
  }
}
