import * as THREE from 'three';

import { OUTLINE_DARKEN, OUTLINE_THICKNESS } from '../config/constants';

/**
 * Обводка методом inverted hull (решение №5).
 *
 * Идея: рядом с мешем ставится его копия, раздутая по нормалям и
 * отрисованная только задними гранями. Передние грани копии отброшены,
 * так что видно только то, что торчит за силуэтом оригинала, — это и
 * читается как контур. Постобработки не нужно, работает на любом железе
 * и стоит один лишний draw call на объект.
 *
 * Тонкости, из-за которых наивная реализация ломается:
 *
 * 1. Раздуваем в пространстве камеры, а не в локальном. Модель игрока
 *    отмасштабирована в 0.5, и в локальных координатах контур получился
 *    бы вдвое тоньше, чем у объектов в натуральную величину.
 * 2. Нормаль считаем сами, а не через чанк `defaultnormal_vertex`: при
 *    `side: BackSide` three определяет FLIP_SIDED и разворачивает её,
 *    отчего копия раздувалась бы внутрь и контур пропадал.
 * 3. Для скиннованных мешей копия делит скелет с оригиналом — иначе
 *    контур не поспевал бы за анимацией.
 * 4. Если у объекта текстура, контур сэмплит её же и затемняет — тогда
 *    он и правда «затемнённый цвет самого объекта», а не общий тёмный
 *    тон. Текстуру приходится декодировать вручную: в своём шейдере
 *    three не делает этого за нас, и без sRGBTransferEOTF цвет уехал бы.
 */

const vertexShader = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
#include <fog_pars_vertex>

uniform float thickness;

#ifdef OUTLINE_USE_MAP
varying vec2 vOutlineUv;
#endif

void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <begin_vertex>
  #include <skinning_vertex>

  // Своя нормаль в пространстве камеры, без FLIP_SIDED
  vec3 outlineNormal = normalize( normalMatrix * objectNormal );

  vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
  mvPosition.xyz += outlineNormal * thickness;

  gl_Position = projectionMatrix * mvPosition;

  #ifdef OUTLINE_USE_MAP
  vOutlineUv = uv;
  #endif

  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
// colorspace_pars_fragment не подключаем: three добавляет его в префикс
// любого фрагментного шейдера сам, и явный include продублировал бы
// тела функций — шейдер не соберётся
#include <fog_pars_fragment>

uniform vec3 outlineColor;
uniform float darkenFactor;

#ifdef OUTLINE_USE_MAP
uniform sampler2D outlineMap;
varying vec2 vOutlineUv;
#endif

void main() {
  #ifdef OUTLINE_USE_MAP
  // Текстура лежит в sRGB, а считать надо в линейном пространстве
  vec3 base = sRGBTransferEOTF( texture2D( outlineMap, vOutlineUv ) ).rgb;
  #else
  vec3 base = outlineColor;
  #endif

  gl_FragColor = vec4( base * darkenFactor, 1.0 );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Материалы кэшируются: одна программа на цвет или на текстуру. */
const materials = new Map<string, THREE.ShaderMaterial>();

function outlineMaterial(
  color: number,
  thickness: number,
  map: THREE.Texture | null,
): THREE.ShaderMaterial {
  const key = map === null ? `c${color}:${thickness}` : `m${map.uuid}:${thickness}`;
  const cached = materials.get(key);
  if (cached !== undefined) return cached;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    // clone, а не merge: merge портит объекты Color, а туман приносит
    // свои uniform'ы, без которых чанки fog_* не соберутся
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      thickness: { value: thickness },
      darkenFactor: { value: OUTLINE_DARKEN },
      outlineColor: { value: new THREE.Color(color) },
      outlineMap: { value: map },
    },
    defines: map === null ? {} : { OUTLINE_USE_MAP: '' },
    side: THREE.BackSide,
    fog: true,
  });

  materials.set(key, material);
  return material;
}

export interface OutlineOptions {
  /** Плоский цвет обводки. Игнорируется, если передана текстура. */
  color: number;
  /** Текстура объекта: контур возьмёт её и затемнит. */
  map?: THREE.Texture | undefined;
  thickness?: number;
}

/**
 * Строит меш-обводку для одного меша. Возвращает null, если геометрия
 * не годится (нет нормалей — раздувать не по чему).
 */
export function createOutline(source: THREE.Mesh, options: OutlineOptions): THREE.Mesh | null {
  if (source.geometry.getAttribute('normal') === undefined) return null;

  const { color, map = null, thickness = OUTLINE_THICKNESS } = options;
  const material = outlineMaterial(color, thickness, map);

  // Копия встаёт рядом с оригиналом в том же родителе, поэтому обязана
  // повторить его локальный трансформ: у KayKit он единичный, но
  // полагаться на это нельзя — у пропсов будет иначе
  const copyTransform = (target: THREE.Object3D): void => {
    target.position.copy(source.position);
    target.quaternion.copy(source.quaternion);
    target.scale.copy(source.scale);
  };

  const finish = (outline: THREE.Mesh): THREE.Mesh => {
    copyTransform(outline);
    outline.frustumCulled = source.frustumCulled;
    // Контур не отбрасывает тень: он же не объект, а его силуэт
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.renderOrder = source.renderOrder - 1;
    outline.name = `${source.name}_outline`;
    return outline;
  };

  if (source instanceof THREE.SkinnedMesh) {
    const outline = new THREE.SkinnedMesh(source.geometry, material);
    finish(outline);
    // Общий скелет: собственного скиннинга у копии нет, она повторяет позу
    outline.bind(source.skeleton, source.bindMatrix);
    outline.bindMode = source.bindMode;
    return outline;
  }

  return finish(new THREE.Mesh(source.geometry, material));
}
