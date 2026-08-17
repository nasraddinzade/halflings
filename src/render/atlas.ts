import * as THREE from 'three';

import { CLOTH_VARIANT_COUNT, SOURCE_COLUMNS, SOURCE_ROWS } from '../config/constants';
import { CLOTH_VARIANTS, PALETTE, nearestTone } from '../config/palette';
import type { ToolZone } from '../config/tools';
import type { PartFile } from '../config/villagers';

/**
 * Villager atlas: moving the pack's zones onto the project palette.
 *
 * What did not work before. The pack atlas is an 8×4 grid, and the first
 * approach was to shift UVs by a whole column. But the UV islands of a
 * single part are smeared across four to eight columns at once
 * (docs/ASSETS.md, section 6), so the shift moved all of them together:
 * skin slid onto the cloth colour, cloth onto the metal colour. What came
 * out was not a colour scheme but a lottery.
 *
 * What we do instead. A cell of the pack atlas is itself a material zone —
 * that is how the artist laid it out: skin here, shirt there, boots over
 * there. We read the source texture, take the colour of each of the 32
 * cells and snap it to the nearest project tone. Then every vertex UV is
 * rewritten to a single texel of the new atlas: column — zone, row —
 * colour variant.
 *
 * The zone split thus stays entirely the artist's, while the colours are
 * entirely ours (decision #6). The pack's UV layout is untouched, no
 * Blender needed.
 *
 * A variant changes only the zones that fall into the cloth family. Skin
 * and hair are the same for everyone: otherwise, instead of variety, we
 * would get multicoloured faces.
 */

const CELLS_PER_FILE = SOURCE_COLUMNS * SOURCE_ROWS;

/**
 * Columns for props, appended after the pack's zones. Tools do not take
 * their colour from the pack textures — they need their own, identical
 * across every variant row, so that a wooden handle does not change along
 * with the shirt.
 */
const PROP_ZONES: Readonly<Record<ToolZone, number>> = {
  wood: PALETTE.wood,
  metal: PALETTE.rock,
  dark: PALETTE.woodDark,
};
const PROP_ORDER: readonly ToolZone[] = ['wood', 'metal', 'dark'];

/** The forms in which GLTFLoader hands back the pack texture. */
export type AtlasImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

export interface AtlasSource {
  file: PartFile;
  image: AtlasImage;
}

export class ZoneAtlas {
  readonly texture: THREE.DataTexture;
  private readonly fileOrder: readonly PartFile[];
  private readonly zoneCount: number;

  /** UV of the texel a piece of a tool is painted with. */
  propUv(zone: ToolZone, variant: number): readonly [number, number] {
    const index = PROP_ORDER.indexOf(zone);
    const column = this.zoneCount - PROP_ORDER.length + Math.max(0, index);
    return [
      (column + 0.5) / this.zoneCount,
      (clampIndex(variant, CLOTH_VARIANT_COUNT) + 0.5) / CLOTH_VARIANT_COUNT,
    ];
  }

  private constructor(texture: THREE.DataTexture, fileOrder: readonly PartFile[], zoneCount: number) {
    this.texture = texture;
    this.fileOrder = fileOrder;
    this.zoneCount = zoneCount;
  }

  static build(sources: readonly AtlasSource[]): ZoneAtlas {
    const fileOrder = sources.map((source) => source.file);
    const zoneCount = sources.length * CELLS_PER_FILE + PROP_ORDER.length;

    // Colour of every cell of every pack atlas -> nearest project tone
    const tones = sources.flatMap((source) =>
      sampleCells(source.image).map((color) => nearestTone(color)),
    );

    const width = zoneCount;
    const height = CLOTH_VARIANT_COUNT;
    const data = new Uint8Array(width * height * 4);

    for (let variant = 0; variant < height; variant++) {
      for (let zone = 0; zone < width; zone++) {
        const prop = PROP_ORDER[zone - tones.length];
        const tone = tones[zone];
        const color = prop !== undefined
          ? PROP_ZONES[prop]
          : tone === undefined
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
   * Rewrites a vertex UV: from a coordinate in the pack atlas into a
   * single texel of ours. Returns the texel centre so NearestFilter is
   * guaranteed to pick it, with no risk of catching the neighbour.
   */
  remap(file: PartFile, variant: number, u: number, v: number): readonly [number, number] {
    const fileIndex = this.fileOrder.indexOf(file);
    if (fileIndex === -1) throw new Error(`[atlas] file "${file}" was not part of the atlas build`);

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

/** Colours of the 32 pack atlas cells: we sample the centre of each. */
function sampleCells(image: AtlasImage): number[] {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;

  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (context === null) throw new Error('[atlas] could not get a 2d canvas context');
  context.drawImage(image, 0, 0);

  const colors: number[] = [];
  for (let row = 0; row < SOURCE_ROWS; row++) {
    for (let column = 0; column < SOURCE_COLUMNS; column++) {
      // The cell is a vertical gradient; its centre represents it more
      // honestly than the edges, where the blend into the next one starts
      const x = Math.floor(((column + 0.5) / SOURCE_COLUMNS) * image.width);
      const y = Math.floor(((row + 0.5) / SOURCE_ROWS) * image.height);
      const pixel = context.getImageData(x, y, 1, 1).data;
      colors.push(((pixel[0] ?? 0) << 16) | ((pixel[1] ?? 0) << 8) | (pixel[2] ?? 0));
    }
  }
  return colors;
}
