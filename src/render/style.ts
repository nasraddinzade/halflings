import * as THREE from 'three';

import { OUTLINE_DARKEN, TOON_STEPS } from '../config/constants';
import { darken } from '../config/palette';
import { createOutline } from './Outline';

/**
 * Единая точка стилизации (решение №6). Всё, что попадает в сцену,
 * проходит через applyStyle: материал из ассета выбрасывается и
 * заменяется тоновым из палитры проекта.
 */

/**
 * Рампа освещения для MeshToonMaterial.
 *
 * MeshToonMaterial берёт освещённость, полученную обычным способом, и
 * вместо плавной подстановки читает по ней цвет из этой одномерной
 * текстуры. NearestFilter превращает градиент в ступени: три текселя —
 * три уровня света, тень / полутон / свет. Без Nearest получился бы
 * тот же градиент, только через текстуру.
 */
function createToonGradient(steps: number): THREE.DataTexture {
  const data = new Uint8Array(steps);
  for (let i = 0; i < steps; i++) {
    data[i] = Math.round(((i + 1) / steps) * 255);
  }
  const texture = new THREE.DataTexture(data, steps, 1, THREE.RedFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

const gradientMap = createToonGradient(TOON_STEPS);

/** Материалы кэшируются: одинаковый цвет или атлас — одна программа. */
const surfaces = new Map<string, THREE.MeshToonMaterial>();

export function toonSurface(color: number, map: THREE.Texture | null = null): THREE.MeshToonMaterial {
  const key = map === null ? `c${color}` : `m${map.uuid}`;
  const cached = surfaces.get(key);
  if (cached !== undefined) return cached;

  const material = new THREE.MeshToonMaterial({
    // С текстурой цвет должен быть белым: MeshToonMaterial перемножает
    // color и map, и любой другой оттенок подкрасил бы весь атлас
    color: map === null ? color : 0xffffff,
    gradientMap,
    fog: true,
    ...(map === null ? {} : { map }),
  });
  surfaces.set(key, material);
  return material;
}

export interface StyleOptions {
  /** Цвет из палитры. Другие источники цвета в проекте не допускаются. */
  color: number;
  /** Атлас проекта — для жителей, у которых цвет задан развёрткой. */
  map?: THREE.Texture | undefined;
  /** Обводка inverted hull. Для земли не нужна — контур у неё бессмысленен. */
  outline?: boolean;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Проходит по поддереву, подменяет материалы и по желанию навешивает
 * обводку. Обводки собираются в список и добавляются после обхода:
 * добавлять детей прямо в traverse — значит обходить и их тоже.
 *
 * Возвращает созданные обводки: их гасят по расстоянию (шаг 6),
 * и для этого нужны ссылки.
 */
export function applyStyle(root: THREE.Object3D, options: StyleOptions): THREE.Mesh[] {
  const { color, map, outline = false, castShadow = true, receiveShadow = true } = options;

  const material = toonSurface(color, map ?? null);
  // Без текстуры контур — затемнённый цвет объекта; с текстурой он
  // затемняет её сам, попиксельно (см. Outline.ts)
  const outlineColor = darken(color, OUTLINE_DARKEN);
  const pending: Array<{ parent: THREE.Object3D; outline: THREE.Mesh }> = [];

  root.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (child.name.endsWith('_outline')) return;

    child.material = material;
    child.castShadow = castShadow;
    child.receiveShadow = receiveShadow;

    if (!outline) return;
    const hull = createOutline(child, { color: outlineColor, map });
    if (hull !== null && child.parent !== null) {
      pending.push({ parent: child.parent, outline: hull });
    }
  });

  for (const { parent, outline: hull } of pending) parent.add(hull);
  return pending.map((entry) => entry.outline);
}
