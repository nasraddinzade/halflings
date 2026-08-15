import type * as THREE from 'three';

import { VILLAGER_COUNT } from '../config/constants';
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

  update(delta: number): void {
    // Микшер каждого жителя обновляет его собственный мозг: состояние
    // и анимация должны меняться в одном месте, иначе на переходах
    // проскакивает кадр со старым клипом
    for (const brain of this.brains) brain.update(delta);
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
