import * as THREE from 'three';

import {
  RIVER_FADE_END,
  RIVER_SEGMENTS_ACROSS,
  RIVER_SEGMENTS_ALONG,
  RIVER_WATER_DEPTH,
  RIVER_WAVE_HEIGHT,
  RIVER_WAVE_SPEED,
  RIVER_WIDTH,
  VALLEY_RADIUS,
} from '../config/constants';
import { PALETTE } from '../config/palette';
import { toonSurface } from '../render/style';
import { groundHeight, riverCenterZ } from './heightfield';

/**
 * Вода в русле: лента вдоль оси реки.
 *
 * Поверхность идёт не по горизонтали, а повторяет окрестную землю со
 * сдвигом вниз. Физически река так себя не ведёт, но дно долины ровное
 * с точностью до полутора метров на сто, и на глаз это читается как
 * вода, а не как наклонная плоскость. Зато не нужно ни выравнивать
 * рельеф под уровень, ни считать сток.
 *
 * Русло прорезано в самом террейне (heightfield.ts), так что дно —
 * часть коллизий: в реку можно зайти, и BVH честно поставит на дно.
 * Глубина подобрана так, чтобы полурослику было по колено.
 */
export class River {
  readonly mesh: THREE.Mesh;
  private readonly uniforms = { uTime: { value: 0 } };

  constructor() {
    const geometry = buildRibbon();

    const material = toonSurface(PALETTE.water).clone();
    material.onBeforeCompile = (shader) => {
      shader.uniforms['uTime'] = this.uniforms.uTime;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\nuniform float uTime;`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           // Две волны под углом друг к другу: одна даёт полосы,
           // две — рябь без заметного повтора
           transformed.y += ${RIVER_WAVE_HEIGHT.toFixed(4)} * (
             sin(position.x * 1.7 + uTime * ${RIVER_WAVE_SPEED.toFixed(3)}) +
             sin(position.z * 2.3 - uTime * ${(RIVER_WAVE_SPEED * 0.8).toFixed(3)})
           );`,
        );
    };
    // three кэширует шейдерные программы по параметрам материала, а
    // onBeforeCompile в ключ не входит: без своего ключа вода могла бы
    // получить программу обычного тонового материала — или отдать свою
    // ему, и рябью пошла бы вся сцена
    material.customProgramCacheKey = () => 'river-waves';
    material.needsUpdate = true;

    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.name = 'river';
    // Вода тень не отбрасывает, но принимает: иначе она светится
    // там, где берег в тени
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.matrixAutoUpdate = false;
    this.mesh.updateMatrix();
  }

  update(delta: number): void {
    this.uniforms.uTime.value += delta;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/**
 * Лента по оси русла. Строится в мировых координатах, поэтому меш
 * стоит в начале координат с единичной матрицей.
 */
function buildRibbon(): THREE.BufferGeometry {
  const limit = VALLEY_RADIUS * RIVER_FADE_END;
  const positions: number[] = [];
  const indices: number[] = [];
  const uvs: number[] = [];

  // Чуть шире русла: кромка воды должна заходить под берег, иначе
  // на стыке видна щель
  const halfWidth = RIVER_WIDTH * 1.15;

  for (let i = 0; i <= RIVER_SEGMENTS_ALONG; i++) {
    const t = i / RIVER_SEGMENTS_ALONG;
    const x = -limit + t * limit * 2;
    const centerZ = riverCenterZ(x);

    for (let j = 0; j <= RIVER_SEGMENTS_ACROSS; j++) {
      const s = j / RIVER_SEGMENTS_ACROSS;
      const z = centerZ - halfWidth + s * halfWidth * 2;
      positions.push(x, groundHeight(x, z) - RIVER_WATER_DEPTH, z);
      uvs.push(t * 20, s);
    }
  }

  const stride = RIVER_SEGMENTS_ACROSS + 1;
  for (let i = 0; i < RIVER_SEGMENTS_ALONG; i++) {
    for (let j = 0; j < RIVER_SEGMENTS_ACROSS; j++) {
      const a = i * stride + j;
      const b = a + stride;
      // Порядок вершин задаёт сторону грани. Соседний индекс идёт
      // поперёк русла (+Z), следующий ряд — вдоль (+X), и обход
      // a -> a+1 -> b даёт нормаль вверх: ẑ × x̂ = +ŷ. При обратном
      // порядке нормали смотрят вниз, и вода видна только снизу —
      // сверху её грани отсекает FrontSide
      indices.push(a, a + 1, b, b, a + 1, b + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}
