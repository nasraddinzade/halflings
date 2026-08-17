// Compresses the animation files with EXT_meshopt_compression.
//
// Why animations only. Along with compressing, gltf-transform quantizes
// geometry, and for skinned meshes it bakes the dequantization into
// inverseBindMatrices — it even splits a single skin into several, one
// per mesh. Our villagers are merged out of parts from different files
// onto one shared skeleton (character/mergeSkinned.ts), so after that
// treatment the parts would arrive at different scales.
//
// The animation files have no meshes and no skins at all: strip-anim-meshes.mjs
// cut them out, leaving bones and tracks. There is nothing to quantize there
// besides the tracks themselves, and GLTFLoader reads those as usual.
//
// Run: node tools/compress-animations.mjs
// Re-running is safe: already compressed files are skipped.

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
  throw new Error(`no JSON chunk: ${file}`);
}

/** The things that must survive compression unchanged. */
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
    console.log(`  ${name.padEnd(24)} already compressed, skipping`);
    skipped++;
    continue;
  }

  const sourceSize = fs.statSync(file).size;
  const expected = fingerprint(sourceJson);

  // The CLI writes to a separate file: it refuses to work in place.
  // The name has to end in .glb — otherwise it decides glTF is what we
  // want and lays the result out as a JSON and a .bin next to it
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
    console.error(`  ERROR ${name}: compression changed clips or bones, file left untouched`);
    continue;
  }

  fs.rmSync(file);
  fs.renameSync(temporary, file);

  const nextSize = fs.statSync(file).size;
  before += sourceSize;
  after += nextSize;
  console.log(
    `  ${name.padEnd(24)} ${(sourceSize / 1024).toFixed(0).padStart(5)} KB -> ` +
    `${(nextSize / 1024).toFixed(0).padStart(4)} KB  (-${(100 - (nextSize / sourceSize) * 100).toFixed(0)}%)  ` +
    `clips ${actual.clips.length}, bones ${actual.bones.length}  check ok`,
  );
}

if (before > 0) {
  console.log(
    `\n  total ${(before / 1024 / 1024).toFixed(2)} MB -> ${(after / 1024 / 1024).toFixed(2)} MB ` +
    `(-${(100 - (after / before) * 100).toFixed(0)}%)`,
  );
}
if (skipped === files.length) console.log('\n  everything is already compressed');
if (failures) { console.error(`\n  failed files: ${failures}`); process.exit(1); }
