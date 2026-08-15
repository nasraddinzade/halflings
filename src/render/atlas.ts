import * as THREE from 'three';

import { CLOTH_VARIANT_COUNT, SOURCE_COLUMNS, SOURCE_ROWS } from '../config/constants';
import { CLOTH_VARIANTS, nearestTone } from '../config/palette';
import type { PartFile } from '../config/villagers';

/**
 * Атлас жителей: перенос зон пака в палитру проекта.
 *
 * Что не сработало раньше. Паковый атлас — сетка 8×4, и первым подходом
 * был сдвиг UV на целую колонку. Но UV-острова одной части размазаны по
 * четырём-восьми колонкам сразу (docs/ASSETS.md, раздел 6), поэтому сдвиг
 * двигал их все разом: кожа уезжала на цвет ткани, ткань на цвет металла.
 * Получалась не расцветка, а лотерея.
 *
 * Что делаем вместо этого. Ячейка пакового атласа — и есть зона материала,
 * так её задал художник: тут кожа, тут рубаха, тут сапоги. Мы читаем
 * исходную текстуру, для каждой из 32 ячеек берём её цвет и подтягиваем
 * к ближайшему тону проекта. Дальше UV каждой вершины переписывается на
 * один тексель нового атласа: колонка — зона, строка — вариант расцветки.
 *
 * Разбиение на зоны при этом целиком остаётся авторским, а цвета —
 * целиком нашими (решение №6). Развёртку пака не трогаем, Blender не нужен.
 *
 * Вариант меняет только те зоны, что попали в семейство одежды. Кожа
 * и волосы одинаковы у всех: иначе вместо разнообразия вышли бы
 * разноцветные лица.
 */

const CELLS_PER_FILE = SOURCE_COLUMNS * SOURCE_ROWS;

/** Источники, из которых GLTFLoader отдаёт паковую текстуру. */
export type AtlasImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

export interface AtlasSource {
  file: PartFile;
  image: AtlasImage;
}

export class ZoneAtlas {
  readonly texture: THREE.DataTexture;
  private readonly fileOrder: readonly PartFile[];
  private readonly zoneCount: number;

  private constructor(texture: THREE.DataTexture, fileOrder: readonly PartFile[], zoneCount: number) {
    this.texture = texture;
    this.fileOrder = fileOrder;
    this.zoneCount = zoneCount;
  }

  static build(sources: readonly AtlasSource[]): ZoneAtlas {
    const fileOrder = sources.map((source) => source.file);
    const zoneCount = sources.length * CELLS_PER_FILE;

    // Цвет каждой ячейки каждого пакового атласа -> ближайший тон проекта
    const tones = sources.flatMap((source) =>
      sampleCells(source.image).map((color) => nearestTone(color)),
    );

    const width = zoneCount;
    const height = CLOTH_VARIANT_COUNT;
    const data = new Uint8Array(width * height * 4);

    for (let variant = 0; variant < height; variant++) {
      for (let zone = 0; zone < width; zone++) {
        const tone = tones[zone];
        const color = tone === undefined
          ? 0xffffff
          : tone.family === 'cloth'
            ? CLOTH_VARIANTS[variant % CLOTH_VARIANTS.length] ?? tone.color
            : tone.color;

        const offset = (variant * width + zone) * 4;
        data[offset] = (color >> 16) & 0xff;
        data[offset + 1] = (color >> 8) & 0xff;
        data[offset + 2] = color & 0xff;
        data[offset + 3] = 255;
      }
    }

    const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;

    return new ZoneAtlas(texture, fileOrder, zoneCount);
  }

  /**
   * Переписывает UV вершины: из координаты в паковом атласе — в один
   * тексель нашего. Возвращает центр текселя, чтобы NearestFilter брал
   * его гарантированно, без риска зацепить соседний.
   */
  remap(file: PartFile, variant: number, u: number, v: number): readonly [number, number] {
    const fileIndex = this.fileOrder.indexOf(file);
    if (fileIndex === -1) throw new Error(`[atlas] файл "${file}" не участвовал в сборке атласа`);

    const column = clampIndex(Math.floor(u * SOURCE_COLUMNS), SOURCE_COLUMNS);
    const row = clampIndex(Math.floor(v * SOURCE_ROWS), SOURCE_ROWS);
    const zone = fileIndex * CELLS_PER_FILE + row * SOURCE_COLUMNS + column;

    return [
      (zone + 0.5) / this.zoneCount,
      (clampIndex(variant, CLOTH_VARIANT_COUNT) + 0.5) / CLOTH_VARIANT_COUNT,
    ];
  }
}

function clampIndex(value: number, count: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(count - 1, Math.max(0, value));
}

/** Цвета 32 ячеек пакового атласа: берём середину каждой. */
function sampleCells(image: AtlasImage): number[] {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) throw new Error('[atlas] не удалось получить контекст 2d');
  context.drawImage(image, 0, 0);

  const colors: number[] = [];
  for (let row = 0; row < SOURCE_ROWS; row++) {
    for (let column = 0; column < SOURCE_COLUMNS; column++) {
      // Ячейка — вертикальный градиент; середина представляет её честнее
      // краёв, где начинается переход к соседней
      const x = Math.floor(((column + 0.5) / SOURCE_COLUMNS) * image.width);
      const y = Math.floor(((row + 0.5) / SOURCE_ROWS) * image.height);
      const pixel = context.getImageData(x, y, 1, 1).data;
      colors.push(((pixel[0] ?? 0) << 16) | ((pixel[1] ?? 0) << 8) | (pixel[2] ?? 0));
    }
  }
  return colors;
}
