import * as THREE from 'three';

import { OUTLINE_THICKNESS } from '../config/constants';

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
 */

const vertexShader = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
#include <fog_pars_vertex>

uniform float thickness;

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

  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
#include <common>
#include <fog_pars_fragment>

uniform vec3 outlineColor;

void main() {
  gl_FragColor = vec4( outlineColor, 1.0 );

  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Материалы кэшируются по цвету: одна программа на всю сцену. */
const materials = new Map<string, THREE.ShaderMaterial>();

function outlineMaterial(color: number, thickness: number): THREE.ShaderMaterial {
  const key = `${color}:${thickness}`;
  const cached = materials.get(key);
  if (cached !== undefined) return cached;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    // clone, а не merge: merge теряет тип у Color, а туман приносит
    // свои uniform'ы, без которых чанки fog_* не соберутся
    uniforms: {
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
      thickness: { value: thickness },
      outlineColor: { value: new THREE.Color(color) },
    },
    side: THREE.BackSide,
    fog: true,
  });

  materials.set(key, material);
  return material;
}

/**
 * Строит меш-обводку для одного меша. Возвращает null, если геометрия
 * не годится (нет нормалей — раздувать не по чему).
 */
export function createOutline(
  source: THREE.Mesh,
  color: number,
  thickness = OUTLINE_THICKNESS,
): THREE.Mesh | null {
  if (source.geometry.getAttribute('normal') === undefined) return null;

  const material = outlineMaterial(color, thickness);

  // Копия встаёт рядом с оригиналом в том же родителе, поэтому обязана
  // повторить его локальный трансформ: у KayKit он единичный, но
  // полагаться на это нельзя — у пропсов будет иначе
  const copyTransform = (target: THREE.Object3D): void => {
    target.position.copy(source.position);
    target.quaternion.copy(source.quaternion);
    target.scale.copy(source.scale);
  };

  if (source instanceof THREE.SkinnedMesh) {
    const outline = new THREE.SkinnedMesh(source.geometry, material);
    copyTransform(outline);
    // Общий скелет: собственного скиннинга у копии нет, она повторяет позу
    outline.bind(source.skeleton, source.bindMatrix);
    outline.bindMode = source.bindMode;
    outline.frustumCulled = source.frustumCulled;
    // Контур не отбрасывает тень: он же не объект, а его силуэт
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.name = `${source.name}_outline`;
    return outline;
  }

  const outline = new THREE.Mesh(source.geometry, material);
  copyTransform(outline);
  outline.frustumCulled = source.frustumCulled;
  outline.castShadow = false;
  outline.receiveShadow = false;
  outline.name = `${source.name}_outline`;
  return outline;
}
