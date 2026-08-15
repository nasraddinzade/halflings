import * as THREE from 'three';

import {
  LOD_ANIMATION_STRIDE,
  LOD_CULL,
  LOD_NEAR,
  SEPARATION_STRENGTH,
  VILLAGER_COUNT,
  VILLAGER_RADIUS,
} from '../config/constants';
import { VILLAGER_NAMES, type VillagerRole } from '../config/villagers';
import { WORK_POINTS, type WorkPoint } from '../config/work';
import type { AnimationLibrary } from '../character/AnimationLibrary';
import { buildVillager, configFromSeed, type PartLibrary, type Villager } from '../character/buildVillager';
import { VillagerBrain } from '../character/VillagerBrain';
import type { Ground } from './Ground';
import type { Circle, Obstacles } from './Obstacles';

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
  /** Круги жителей: их читает контроллер игрока через Obstacles. */
  private readonly circles: Circle[] = [];

  constructor(
    scene: THREE.Scene,
    parts: PartLibrary,
    animations: AnimationLibrary,
    ground: Ground,
    private readonly obstacles: Obstacles,
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
      this.circles.push({ x: 0, z: 0, radius: VILLAGER_RADIUS });
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

    this.separate();
    this.publishCircles();
  }

  /**
   * Расталкивание. Жители сходятся на общие рабочие места и без этого
   * стоят друг в друге. Толкаем на половину перекрытия и по одному
   * проходу: полное разведение за кадр выглядит как отскок, а лишние
   * проходы на тридцати телах не окупаются.
   */
  private separate(): void {
    for (let i = 0; i < this.brains.length; i++) {
      const a = this.brains[i];
      if (a === undefined) continue;

      for (let j = i + 1; j < this.brains.length; j++) {
        const b = this.brains[j];
        if (b === undefined) continue;

        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const limit = VILLAGER_RADIUS * 2;
        const squared = dx * dx + dz * dz;
        if (squared >= limit * limit || squared < 1e-8) continue;

        const distance = Math.sqrt(squared);
        const push = ((limit - distance) / distance) * SEPARATION_STRENGTH * 0.5;
        a.nudge(-dx * push, -dz * push);
        b.nudge(dx * push, dz * push);
      }

      // И из дверей нор: житель не должен стоять в проёме
      if (this.obstacles.blocked(a.x, a.z, VILLAGER_RADIUS)) {
        const away = Math.hypot(a.x, a.z) || 1;
        a.nudge((a.x / away) * 0.08, (a.z / away) * 0.08);
      }
    }
  }

  private publishCircles(): void {
    for (let i = 0; i < this.brains.length; i++) {
      const brain = this.brains[i];
      const circle = this.circles[i];
      if (brain === undefined || circle === undefined) continue;
      circle.x = brain.x;
      circle.z = brain.z;
    }
    this.obstacles.setDynamic(this.circles);
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
