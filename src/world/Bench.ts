import * as THREE from 'three';

import {
  BENCH_COUNT,
  BENCH_DISTANCE,
  BENCH_SPACING,
  SPAWN_X,
  SPAWN_Z,
} from '../config/constants';
import { CLIP } from '../config/assets';
import { VILLAGER_NAMES } from '../config/villagers';
import type { AnimationLibrary } from '../character/AnimationLibrary';
import { buildVillager, configFromSeed, type PartLibrary, type Villager } from '../character/buildVillager';
import type { Ground } from './Ground';

/**
 * Стенд из шага 4: ряд сгенерированных жителей рядом со спавном.
 *
 * Стоит прямо в долине, а не в отдельной сцене: так к ним можно подойти
 * и посмотреть с любой стороны, а отладочная панель сразу покажет,
 * во что обходятся двадцать персонажей.
 */
export class Bench {
  readonly villagers: Villager[] = [];

  constructor(
    scene: THREE.Scene,
    parts: PartLibrary,
    animations: AnimationLibrary,
    ground: Ground,
  ) {
    const idle = animations.require(CLIP.idle);
    const names = VILLAGER_NAMES.slice(0, BENCH_COUNT);
    const rowWidth = (names.length - 1) * BENCH_SPACING;

    names.forEach((name, index) => {
      const villager = buildVillager(parts, configFromSeed(name));

      const x = SPAWN_X - rowWidth / 2 + index * BENCH_SPACING;
      const z = SPAWN_Z + BENCH_DISTANCE;
      const sample = ground.sample(x, z);
      villager.root.position.set(x, sample?.height ?? 0, z);
      // Лицом к точке спавна — то есть к игроку
      villager.root.rotation.y = Math.PI;

      const action = villager.mixer.clipAction(idle);
      // Смещение фазы детерминировано порядком: ряд не дышит в такт,
      // но и не зависит от Math.random
      action.time = (index / names.length) * idle.duration;
      action.play();

      scene.add(villager.root);
      this.villagers.push(villager);
    });
  }

  get triangles(): number {
    return this.villagers.reduce((sum, villager) => sum + villager.triangles, 0);
  }

  update(delta: number): void {
    for (const villager of this.villagers) villager.mixer.update(delta);
  }
}
