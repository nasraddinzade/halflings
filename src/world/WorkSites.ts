import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

import { PALETTE } from '../config/palette';
import { WORK_POINTS, propPosition, workFacing } from '../config/work';
import type { VillagerRole } from '../config/villagers';
import { hashSeed, makeRandom } from '../core/random';
import { applyStyle } from '../render/style';
import type { Circle } from './Obstacles';
import { heightAt } from './heightfield';

/**
 * Реквизит рабочих мест: грядки, козлы с брёвнами, камыш у воды, скамьи.
 *
 * До него занятия происходили в пустоте — садовник копал ровную траву,
 * пильщик пилил воздух. Точки работы задаются данными (config/work.ts),
 * и реквизит строится по тем же данным, так что двигать огород
 * по-прежнему нужно ровно в одном месте.
 *
 * Всё склеивается по цветам в несколько мешей, как двери нор: пятнадцать
 * мест по четыре предмета стоили бы под сотню вызовов отрисовки.
 */
export class WorkSites {
  readonly group = new THREE.Group();
  /** Круги реквизита: сквозь козлы и грядку ходить не следует. */
  readonly blockers: Circle[] = [];

  constructor() {
    this.group.name = 'work_sites';

    const byColor = new Map<number, THREE.BufferGeometry[]>();
    const add = (color: number, geometry: THREE.BufferGeometry): void => {
      const bucket = byColor.get(color);
      if (bucket === undefined) byColor.set(color, [geometry]);
      else bucket.push(geometry);
    };

    for (const point of WORK_POINTS) {
      const spot = propPosition(point);
      const yaw = workFacing(point);
      const base = heightAt(spot.x, spot.z);
      // Небольшой разброс поворота, чтобы ряд грядок не выглядел чертежом
      const random = makeRandom(hashSeed(point.id));
      const tilt = yaw + (random() - 0.5) * 0.5;

      const place = (geometry: THREE.BufferGeometry, color: number): void => {
        geometry.rotateY(tilt);
        geometry.translate(spot.x, base, spot.z);
        add(color, geometry);
      };

      for (const part of propsFor(point.role, random)) place(part.geometry, part.color);
      this.blockers.push({ x: spot.x, z: spot.z, radius: blockRadius(point.role) });
    }

    for (const [color, geometries] of byColor) {
      const merged = mergeGeometries(geometries, false);
      for (const geometry of geometries) geometry.dispose();
      if (merged === null) throw new Error('[worksites] не удалось склеить геометрию');

      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged);
      mesh.name = `worksite_parts_${color.toString(16)}`;
      // Сначала в граф, потом стилизация: обводку applyStyle вешает
      // рядом с мешем, значит родитель нужен уже сейчас
      this.group.add(mesh);
      applyStyle(mesh, { color, outline: true });
    }
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    });
  }
}

interface Part {
  geometry: THREE.BufferGeometry;
  color: number;
}

function blockRadius(role: VillagerRole): number {
  return role === 'fisher' ? 0.35 : 0.6;
}

function propsFor(role: VillagerRole, random: () => number): Part[] {
  switch (role) {
    case 'gardener': return gardenBed(random);
    case 'miller': return sawBench();
    case 'fisher': return reeds(random);
    case 'idler': return bench();
  }
}

/** Грядка: земляной короб и ростки рядами. */
function gardenBed(random: () => number): Part[] {
  const parts: Part[] = [];

  const soil = new THREE.BoxGeometry(2, 0.16, 1.2);
  soil.translate(0, 0.08, 0);
  parts.push({ geometry: soil, color: PALETTE.earth });

  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 3; i++) {
      const sprout = new THREE.ConeGeometry(0.07, 0.24 + random() * 0.1, 4);
      sprout.translate(-0.6 + i * 0.6, 0.28, -0.28 + row * 0.56);
      parts.push({ geometry: sprout, color: PALETTE.grass });
    }
  }
  return parts;
}

/** Козлы с бревном: то, что пилят. */
function sawBench(): Part[] {
  const parts: Part[] = [];

  const beam = new THREE.BoxGeometry(1.5, 0.12, 0.16);
  beam.translate(0, 0.52, 0);
  parts.push({ geometry: beam, color: PALETTE.wood });

  for (const x of [-0.55, 0.55]) {
    for (const z of [-0.25, 0.25]) {
      const leg = new THREE.BoxGeometry(0.09, 0.52, 0.09);
      leg.translate(x, 0.26, z);
      parts.push({ geometry: leg, color: PALETTE.woodDark });
    }
  }

  const log = new THREE.CylinderGeometry(0.2, 0.2, 1.3, 8);
  log.rotateZ(Math.PI / 2);
  log.translate(0, 0.68, 0);
  parts.push({ geometry: log, color: PALETTE.woodDark });

  return parts;
}

/** Камыш у воды и ящик под улов. */
function reeds(random: () => number): Part[] {
  const parts: Part[] = [];

  for (let i = 0; i < 6; i++) {
    const stalk = new THREE.ConeGeometry(0.045, 0.8 + random() * 0.5, 4);
    stalk.translate(-0.5 + random(), 0.5, -0.35 + random() * 0.7);
    parts.push({ geometry: stalk, color: PALETTE.grassDry });
  }

  const crate = new THREE.BoxGeometry(0.5, 0.36, 0.4);
  crate.translate(0.55, 0.18, 0.2);
  parts.push({ geometry: crate, color: PALETTE.wood });

  return parts;
}

/** Скамья на площади: бездельнику надо где-то бездельничать. */
function bench(): Part[] {
  const parts: Part[] = [];

  const seat = new THREE.BoxGeometry(1.3, 0.1, 0.38);
  seat.translate(0, 0.42, 0);
  parts.push({ geometry: seat, color: PALETTE.wood });

  for (const x of [-0.5, 0.5]) {
    const leg = new THREE.BoxGeometry(0.12, 0.42, 0.34);
    leg.translate(x, 0.21, 0);
    parts.push({ geometry: leg, color: PALETTE.woodDark });
  }

  return parts;
}
