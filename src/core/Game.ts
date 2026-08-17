import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import {
  DEBUG_PANEL,
  FOG_FAR,
  FOG_NEAR,
  MAX_DELTA,
  SPAWN_X,
  SPAWN_Z,
  GRASS_ENABLED,
  RIVER_ENABLED,
  SKY_ENABLED,
  VILLAGERS_ENABLED,
} from '../config/constants';
import { PALETTE } from '../config/palette';
import { DebugPanel } from '../debug/DebugPanel';
import { AnimationLibrary } from '../character/AnimationLibrary';
import { LocomotionState } from '../character/LocomotionState';
import { PlayerController, type ControllerFrame } from '../character/PlayerController';
import { loadPlayer, type Player } from '../character/loadPlayer';
import { PartLibrary } from '../character/buildVillager';
import { Village } from '../world/Village';
import { Vegetation } from '../world/Vegetation';
import { River } from '../world/River';
import { Burrows } from '../world/Burrows';
import { WorkSites } from '../world/WorkSites';
import { CameraRig } from '../render/CameraRig';
import { Lighting } from '../render/Lighting';
import { Renderer } from '../render/Renderer';
import { Sky } from '../render/Sky';
import { advanceWind } from '../render/wind';
import { Ground } from '../world/Ground';
import { Obstacles } from '../world/Obstacles';
import { Terrain } from '../world/Terrain';
import { Input } from './Input';

/**
 * The project's only requestAnimationFrame. Modules do not start loops
 * of their own — the update order has to be visible in one place.
 */
export class Game {
  private readonly scene = new THREE.Scene();
  /** Timer instead of Clock: Clock is deprecated as of three 0.185. */
  private readonly timer = new THREE.Timer();

  private readonly renderer: Renderer;
  private readonly cameraRig = new CameraRig();
  private readonly lighting: Lighting;
  private readonly terrain: Terrain;
  private readonly ground: Ground;
  private readonly obstacles = new Obstacles();
  private readonly input: Input;
  /** null when DEBUG_PANEL is off: the module then simply does not exist. */
  private readonly debug: DebugPanel | null = DEBUG_PANEL ? new DebugPanel() : null;

  private player!: Player;
  private village: Village | null = null;
  private vegetation: Vegetation | null = null;
  private readonly river: River | null = RIVER_ENABLED ? new River() : null;
  private readonly burrows = new Burrows();
  private readonly workSites = new WorkSites();
  /** Built after the lighting: it takes the sun direction from it. */
  private readonly sky: Sky | null = null;
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
    // No scene.background: the dome covers the view, and with the sky
    // switched off the renderer's clear colour is the same flat fill it
    // used to be. Fog matches the dome's lowest band exactly, so distance
    // dissolves into the horizon instead of stopping short of it
    this.scene.fog = new THREE.Fog(PALETTE.fog, FOG_NEAR, FOG_FAR);

    this.renderer = new Renderer(canvas);
    this.renderer.setResizeHandler((width, height) => this.cameraRig.setAspect(width, height));

    this.lighting = new Lighting(this.scene);

    if (SKY_ENABLED) {
      this.sky = new Sky(this.lighting.sunDirection);
      this.scene.add(this.sky.mesh);
    }

    this.terrain = new Terrain();
    this.scene.add(this.terrain.mesh);
    this.ground = new Ground(this.terrain.bvh);

    if (this.river !== null) this.scene.add(this.river.mesh);
    this.scene.add(this.burrows.group);
    this.obstacles.addStatic(this.burrows.blockers);
    this.scene.add(this.workSites.group);
    this.obstacles.addToGrid(this.workSites.blockers);

    // Vegetation goes in right away: it is static and depends only on
    // the terrain, so it has no reason to wait for the characters to load
    if (GRASS_ENABLED) {
      this.vegetation = new Vegetation(this.scene, this.ground);
      // Trunks are immovable obstacles, so put them in the grid once
      this.obstacles.addToGrid(this.vegetation.treeTrunks);
    }

    this.input = new Input(canvas, (locked) => {
      this.hint.hidden = locked;
    });

    // Page Visibility API: while the tab is hidden, time does not advance
    this.timer.connect(document);
  }

  async load(): Promise<void> {
    const loader = new GLTFLoader();
    // Animation files use EXT_meshopt_compression (tools/compress-animations.mjs).
    // Without the decoder, GLTFLoader simply throws when loading them
    loader.setMeshoptDecoder(MeshoptDecoder);

    // Model, clips and villager parts are independent — load in parallel
    const [player, library, parts] = await Promise.all([
      loadPlayer(loader),
      AnimationLibrary.load(loader),
      VILLAGERS_ENABLED ? PartLibrary.load(loader) : Promise.resolve(null),
    ]);

    this.player = player;
    this.scene.add(player.root);

    this.locomotion = new LocomotionState(player.mixer, library);
    this.controller = new PlayerController(
      this.ground,
      this.obstacles,
      player.root,
      SPAWN_X,
      SPAWN_Z,
    );

    if (parts !== null) {
      this.village = new Village(this.scene, parts, library, this.ground, this.obstacles);
    }

    // Compile shaders before the first frame: otherwise there is a
    // noticeable stall at startup, and errors in the outline shader would
    // only surface once the object first came into view
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
    this.sky?.dispose();
    this.river?.dispose();
    this.burrows.dispose();
    this.workSites.dispose();
    this.vegetation?.dispose();
    this.terrain.dispose();
    this.renderer.dispose();
  }

  private readonly tick = (): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    // The cap matters when a frame does drag out: in one big step the
    // character would shoot straight through the ground
    this.timer.update();
    const delta = Math.min(this.timer.getDelta(), MAX_DELTA);

    // The update order is fixed:
    // input -> camera -> controller -> animation -> light -> frame
    const mouse = this.input.getMouseDelta();
    this.cameraRig.rotate(mouse.x, mouse.y);
    this.cameraRig.zoom(this.input.getWheelNotches());

    this.frame.intent = this.input.getMoveIntent();
    this.frame.wantsRun = this.input.isRunHeld;
    this.frame.jumpPressed = this.input.consumeJump();
    this.frame.cameraYaw = this.cameraRig.yawAngle;

    this.controller.update(this.frame, delta);
    if (this.controller.justLanded) this.cameraRig.land();

    // The camera runs after the controller to follow the already updated
    // position: otherwise it lags exactly one frame and the picture jitters
    this.cameraRig.update(
      this.controller.position,
      this.ground,
      delta,
      this.controller.runFraction,
    );

    this.locomotion.update(this.controller.locomotion, delta);
    this.player.mixer.update(delta);
    this.village?.update(delta, this.cameraRig.camera.position, this.controller.position);

    // After the camera moved, before the render: the dome is centred on
    // the camera, and a frame's lag would show as the sky sliding
    this.sky?.update(this.cameraRig.camera.position);
    this.river?.update(delta);
    // One clock for everything that sways. It is a single uniform, so the
    // whole valley bends for the price of one number per frame
    advanceWind(delta);
    this.lighting.update(this.controller.position);

    this.renderer.render(this.scene, this.cameraRig.camera);

    // Strictly after render(): before drawing, the frame counters are empty
    if (this.debug !== null) {
      const stats = this.renderer.frameStats;
      this.debug.update({
        delta,
        drawCalls: stats.calls,
        triangles: stats.triangles,
        clip: this.locomotion.currentClip,
        speed: this.controller.speed,
        grounded: this.controller.isGrounded,
        wading: this.controller.wadeDepth,
        working: this.village?.working ?? null,
        visibleVillagers: this.village?.visible ?? null,
        watching: this.village?.watchers ?? null,
        position: this.controller.position,
      });
    }

    this.input.endFrame();
  };
}
