import * as THREE from 'three';

import {
  LOD_ANIMATION_STRIDE,
  LOD_CULL,
  LOD_NEAR,
  VILLAGER_COUNT,
} from '../config/constants';
import { VILLAGER_NAMES, type VillagerRole } from '../config/villagers';
import { WORK_POINTS, type WorkPoint } from '../config/work';
import type { AnimationLibrary } from '../character/AnimationLibrary';
import { buildVillager, configFromSeed, type PartLibrary, type Villager } from '../character/buildVillager';
import { VillagerBrain } from '../character/VillagerBrain';
import type { Ground } from './Ground';

/**
 * Население долины: собирает жителей по конфигу и раздаёт им занятия.
 *
 * Роль выпадает из seed, а рабочие места заданы данными (config/work.ts),
 * поэтому их количество и роли не обязаны совпадать. Житель встаёт на
 * ближайшее свободное место своей роли, а если мест этой роли нет —
 * получает место бездельника и просто живёт в деревне.
 */
export class Village {
  readonly villagers: Villager[] = [];
  private readonly brains: VillagerBrain[] = [];
  /** Накопленное время для жителей, чей микшер обновляется через кадр. */
  private readonly pending: number[] = [];
  private frame = 0;
  private visibleCount = 0;

  constructor(
    scene: THREE.Scene,
    parts: PartLibrary,
    animations: AnimationLibrary,
    ground: Ground,
  ) {
    // Счётчик занятости по ролям: жители расходятся по местам
    // по кругу, а не толпятся на первом
    const nextByRole = new Map<VillagerRole, number>();

    for (const name of VILLAGER_NAMES.slice(0, VILLAGER_COUNT)) {
      const config = configFromSeed(name);
      const villager = buildVillager(parts, config);
      const work = assignWork(config.role, nextByRole);

      scene.add(villager.root);
      this.villagers.push(villager);
      this.pending.push(0);
      this.brains.push(new VillagerBrain(villager, animations, ground, work));
    }
  }

  get triangles(): number {
    return this.villagers.reduce((sum, villager) => sum + villager.triangles, 0);
  }

  /** Сколько жителей сейчас работает — пригодится отладочной панели. */
  get working(): number {
    return this.brains.filter((brain) => brain.currentState === 'work').length;
  }

  /** Сколько жителей реально попало в кадр — метрика для панели. */
  get visible(): number {
    return this.visibleCount;
  }

  /**
   * LOD по расстоянию. Дорого в жителе не столько треугольники, сколько
   * два draw call'а (меш плюс обводка) и пересчёт двадцати трёх костей
   * каждый кадр. Поэтому дальние теряют сперва обводку, потом частоту
   * анимации, а совсем дальние просто не рисуются.
   */
  update(delta: number, cameraPosition: THREE.Vector3): void {
    this.frame++;
    this.visibleCount = 0;

    for (let i = 0; i < this.brains.length; i++) {
      const brain = this.brains[i];
      const villager = this.villagers[i];
      if (brain === undefined || villager === undefined) continue;

      const distance = villager.root.position.distanceTo(cameraPosition);

      if (distance > LOD_CULL) {
        villager.root.visible = false;
        // Время всё равно копим: житель не должен телепортироваться,
        // когда игрок вернётся
        this.pending[i] = (this.pending[i] ?? 0) + delta;
        continue;
      }

      villager.root.visible = true;
      this.visibleCount++;

      const near = distance <= LOD_NEAR;
      for (const outline of villager.outlines) outline.visible = near;

      const owed = (this.pending[i] ?? 0) + delta;
      // Вблизи обновляем каждый кадр, дальше — раз в LOD_ANIMATION_STRIDE,
      // отдавая накопленное время разом: анимация идёт с той же скоростью,
      // просто реже пересчитывается
      if (near || (this.frame + i) % LOD_ANIMATION_STRIDE === 0) {
        brain.update(owed);
        this.pending[i] = 0;
      } else {
        this.pending[i] = owed;
      }
    }
  }
}

function assignWork(role: VillagerRole, nextByRole: Map<VillagerRole, number>): WorkPoint {
  const forRole = WORK_POINTS.filter((point) => point.role === role);
  const pool = forRole.length > 0 ? forRole : WORK_POINTS.filter((p) => p.role === 'idler');
  if (pool.length === 0) throw new Error('[village] в config/work.ts нет ни одной точки');

  const index = nextByRole.get(role) ?? 0;
  nextByRole.set(role, index + 1);

  const point = pool[index % pool.length];
  if (point === undefined) throw new Error('[village] не удалось выбрать точку работы');
  return point;
}
