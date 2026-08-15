// Сжимает файлы анимаций через EXT_meshopt_compression.
//
// Почему только анимации. gltf-transform вместе со сжатием квантует
// геометрию, а для скиннованных мешей запекает дескватизацию в
// inverseBindMatrices — и даже расщепляет один скин на несколько, по
// одному на меш. Наши жители склеиваются из частей разных файлов на
// один общий скелет (character/mergeSkinned.ts), так что после такой
// обработки части приехали бы с разным масштабом.
//
// В файлах анимаций мешей и скинов нет вообще: strip-anim-meshes.mjs их
// вырезал, остались кости и дорожки. Квантовать там нечего, кроме самих
// дорожек, а их GLTFLoader читает как обычно.
//
// Запуск: node tools/compress-animations.mjs
// Повторный запуск безопасен: уже сжатые файлы пропускаются.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIR = path.join(ROOT, 'assets', 'animations');
const JSON_CHUNK = 0x4e4f534a;

function readGlbJson(file) {
  const buf = fs.readFileSync(file);
  const total = buf.readUInt32LE(8);
  let offset = 12;
  while (offset < total) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    if (type === JSON_CHUNK) {
      return JSON.parse(new TextDecoder().decode(buf.subarray(offset + 8, offset + 8 + length)));
    }
    offset += 8 + length;
    offset += (4 - (offset % 4)) % 4;
  }
  throw new Error(`нет JSON-чанка: ${file}`);
}

/** То, что обязано пережить сжатие без изменений. */
function fingerprint(json) {
  const clips = (json.animations ?? []).map((animation) => {
    let duration = 0;
    for (const sampler of animation.samplers) {
      const accessor = json.accessors[sampler.input];
      if (accessor.max) duration = Math.max(duration, accessor.max[0]);
    }
    return `${animation.name}@${duration.toFixed(3)}:${animation.channels.length}`;
  }).sort();
  const bones = (json.nodes ?? []).filter((n) => n.name).map((n) => n.name).sort();
  return { clips, bones };
}

const isCompressed = (json) => (json.extensionsUsed ?? []).includes('EXT_meshopt_compression');

const TEMP_PREFIX = 'tmp-compress-';
const files = fs.readdirSync(DIR)
  .filter((name) => name.endsWith('.glb') && !name.startsWith(TEMP_PREFIX))
  .sort();
let before = 0;
let after = 0;
let failures = 0;
let skipped = 0;

for (const name of files) {
  const file = path.join(DIR, name);
  const sourceJson = readGlbJson(file);

  if (isCompressed(sourceJson)) {
    console.log(`  ${name.padEnd(24)} уже сжат, пропускаю`);
    skipped++;
    continue;
  }

  const sourceSize = fs.statSync(file).size;
  const expected = fingerprint(sourceJson);

  // CLI пишет в отдельный файл: на месте он работать отказывается.
  // Имя обязано кончаться на .glb — иначе он решит, что от него хотят
  // glTF, и разложит результат на JSON и .bin рядом
  const temporary = path.join(DIR, `${TEMP_PREFIX}${name}`);
  execFileSync('npx', ['gltf-transform', 'meshopt', file, temporary], {
    cwd: ROOT,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });

  const actual = fingerprint(readGlbJson(temporary));
  const ok = JSON.stringify(expected) === JSON.stringify(actual);

  if (!ok) {
    failures++;
    fs.rmSync(temporary);
    console.error(`  ОШИБКА ${name}: сжатие изменило клипы или кости, файл не тронут`);
    continue;
  }

  fs.rmSync(file);
  fs.renameSync(temporary, file);

  const nextSize = fs.statSync(file).size;
  before += sourceSize;
  after += nextSize;
  console.log(
    `  ${name.padEnd(24)} ${(sourceSize / 1024).toFixed(0).padStart(5)} КБ -> ` +
    `${(nextSize / 1024).toFixed(0).padStart(4)} КБ  (-${(100 - (nextSize / sourceSize) * 100).toFixed(0)}%)  ` +
    `клипов ${actual.clips.length}, костей ${actual.bones.length}  сверка ок`,
  );
}

if (before > 0) {
  console.log(
    `\n  итого ${(before / 1024 / 1024).toFixed(2)} МБ -> ${(after / 1024 / 1024).toFixed(2)} МБ ` +
    `(-${(100 - (after / before) * 100).toFixed(0)}%)`,
  );
}
if (skipped === files.length) console.log('\n  всё уже сжато');
if (failures) { console.error(`\n  провалено файлов: ${failures}`); process.exit(1); }
