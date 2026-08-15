import * as THREE from 'three';

import { ATLAS_COLUMNS, ATLAS_ROWS } from '../config/constants';
import { PALETTE } from '../config/palette';

/**
 * Атлас проекта: сетка 8×4, ровно как у паковых текстур (docs/ASSETS.md,
 * раздел 6), но цвета — свои, из палитры (решение №6).
 *
 * Почему не берём паковый атлас: в его ячейках запечён плавный градиент,
 * то есть готовое затенение. Под toon-шейдером это дало бы двойную
 * растушёвку — ступени легли бы поверх градиента и картинка замылилась.
 * Здесь каждая ячейка ровная, а весь объём рисует освещение.
 *
 * Почему текстура ровно 8×4 текселя, а не 1024×1024: раз ячейки ровные,
 * больше одного текселя на ячейку не нужно. NearestFilter берёт цвет без
 * интерполяции, развёртка пака остаётся валидной, а вся текстура весит
 * 128 байт вместо мегабайта. UV при этом не трогаются — Blender не нужен.
 */

/**
 * Раскладка ячеек. Колонка — вариант расцветки, строка — тон внутри него.
 * Сдвиг UV на 0.125 по U переводит часть на соседнюю колонку целиком.
 */
const CELLS: readonly number[] = [
  // строка 0
  PALETTE.skin, PALETTE.shirt, PALETTE.shirtCool, PALETTE.thatch,
  PALETTE.plaster, PALETTE.door, PALETTE.bloom, PALETTE.water,
  // строка 1
  PALETTE.hair, PALETTE.trousers, PALETTE.wood, PALETTE.roofTile,
  PALETTE.grassDry, PALETTE.rock, PALETTE.earth, PALETTE.woodDark,
  // строка 2
  PALETTE.boots, PALETTE.woodDark, PALETTE.earth, PALETTE.grass,
  PALETTE.rock, PALETTE.trousers, PALETTE.hair, PALETTE.shirt,
  // строка 3
  PALETTE.shirtCool, PALETTE.bloom, PALETTE.thatch, PALETTE.door,
  PALETTE.water, PALETTE.plaster, PALETTE.skin, PALETTE.boots,
];

let cached: THREE.DataTexture | null = null;

export function villagerAtlas(): THREE.DataTexture {
  if (cached !== null) return cached;

  const width = ATLAS_COLUMNS;
  const height = ATLAS_ROWS;
  const data = new Uint8Array(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const color = CELLS[i] ?? PALETTE.plaster;
    data[i * 4] = (color >> 16) & 0xff;
    data[i * 4 + 1] = (color >> 8) & 0xff;
    data[i * 4 + 2] = color & 0xff;
    data[i * 4 + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  // Смещение UV уводит координату за единицу — без повтора она бы
  // зажалась в край и все сдвинутые части покрасились одинаково
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  cached = texture;
  return texture;
}

/** Сдвиг UV для колонки атласа. Строку не трогаем: она несёт тон. */
export function columnShift(column: number): number {
  return (column % ATLAS_COLUMNS) / ATLAS_COLUMNS;
}
