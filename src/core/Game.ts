import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import {
  DEBUG_PANEL,
  FOG_FAR,
  FOG_NEAR,
  MAX_DELTA,
  SPAWN_X,
  SPAWN_Z,
} from '../config/constants';
import { PALETTE } from '../config/palette';
import { DebugPanel } from '../debug/DebugPanel';
import { AnimationLibrary } from '../character/AnimationLibrary';
import { LocomotionState } from '../character/LocomotionState';
import { PlayerController, type ControllerFrame } from '../character/PlayerController';
import { loadPlayer, type Player } from '../character/loadPlayer';
import { CameraRig } from '../render/CameraRig';
import { Lighting } from '../render/Lighting';
import { Renderer } from '../render/Renderer';
import { Ground } from '../world/Ground';
import { Terrain } from '../world/Terrain';
import { Input } from './Input';

/**
 * Единственный requestAnimationFrame проекта. Модули своих циклов
 * не заводят — порядок обновлений должен быть виден в одном месте.
 */
export class Game {
  private readonly scene = new THREE.Scene();
  /** Timer вместо Clock: Clock в three 0.185 объявлен устаревшим. */
  private readonly timer = new THREE.Timer();

  private readonly renderer: Renderer;
  private readonly cameraRig = new CameraRig();
  private readonly lighting: Lighting;
  private readonly terrain: Terrain;
  private readonly ground: Ground;
  private readonly input: Input;
  /** null, когда DEBUG_PANEL выключён: модуль тогда просто не существует. */
  private readonly debug: DebugPanel | null = DEBUG_PANEL ? new DebugPanel() : null;

  private player!: Player;
  private controller!: PlayerController;
  private locomotion!: LocomotionState;

  private readonly frame: ControllerFrame = {
    wantsRun: false,
    intent: { x: 0, z: 0 },
    jumpPressed: false,
    cameraYaw: 0,
  };

  private running = false;
  private rafId = 0;

  constructor(canvas: HTMLCanvasElement, private readonly hint: HTMLElement) {
    this.scene.background = new THREE.Color(PALETTE.sky);
    // Туман цветом почти как небо: даль растворяется, а не сереет
    this.scene.fog = new THREE.Fog(PALETTE.fog, FOG_NEAR, FOG_FAR);

    this.renderer = new Renderer(canvas);
    this.renderer.setResizeHandler((width, height) => this.cameraRig.setAspect(width, height));

    this.lighting = new Lighting(this.scene);

    this.terrain = new Terrain();
    this.scene.add(this.terrain.mesh);
    this.ground = new Ground(this.terrain.bvh);

    this.input = new Input(canvas, (locked) => {
      this.hint.hidden = locked;
    });

    // Page Visibility API: пока вкладка скрыта, время не идёт
    this.timer.connect(document);
  }

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    // Модель и клипы независимы — грузим параллельно
    const [player, library] = await Promise.all([
      loadPlayer(loader),
      AnimationLibrary.load(loader),
    ]);

    this.player = player;
    this.scene.add(player.root);

    this.locomotion = new LocomotionState(player.mixer, library);
    this.controller = new PlayerController(this.ground, player.root, SPAWN_X, SPAWN_Z);

    // Компилируем шейдеры до первого кадра: иначе на старте будет
    // заметная пауза, а ошибки в шейдере обводки всплыли бы только
    // тогда, когда объект впервые попадёт в кадр
    await this.renderer.webgl.compileAsync(this.scene, this.cameraRig.camera);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.timer.reset();
    this.tick();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  dispose(): void {
    this.stop();
    this.timer.dispose();
    this.debug?.dispose();
    this.input.dispose();
    this.terrain.dispose();
    this.renderer.dispose();
  }

  private readonly tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    // Потолок нужен, когда кадр всё-таки затянулся: за один большой шаг
    // персонаж проскочил бы сквозь землю
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), MAX_DELTA);

    // Порядок обновлений фиксирован:
    // ввод -> камера -> контроллер -> анимации -> свет -> кадр
    const mouse = this.input.getMouseDelta();
    this.cameraRig.rotate(mouse.x, mouse.y);

    this.frame.intent = this.input.getMoveIntent();
    this.frame.wantsRun = this.input.isRunHeld;
    this.frame.jumpPressed = this.input.consumeJump();
    this.frame.cameraYaw = this.cameraRig.yawAngle;

    this.controller.update(this.frame, delta);

    // Камера идёт после контроллера, чтобы следить за уже новой
    // позицией: иначе она отстаёт ровно на кадр и картинка дрожит
    this.cameraRig.update(this.controller.position, this.ground, delta);

    this.locomotion.update(this.controller.locomotion, delta);
    this.player.mixer.update(delta);

    this.lighting.update(this.controller.position);

    this.renderer.render(this.scene, this.cameraRig.camera);

    // Строго после render(): счётчики кадра до отрисовки ещё пустые
    if (this.debug !== null) {
      const stats = this.renderer.frameStats;
      this.debug.update({
        delta,
        drawCalls: stats.calls,
        triangles: stats.triangles,
        clip: this.locomotion.currentClip,
        speed: this.controller.speed,
        stamina: this.controller.staminaLeft,
        grounded: this.controller.isGrounded,
      });
    }

    this.input.endFrame();
  };
}
