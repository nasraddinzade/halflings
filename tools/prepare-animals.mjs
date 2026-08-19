// Prepares the village's animals from the Quaternius pack.
//
// Source: Quaternius, "Ultimate Animated Animal Pack" (July 2021), CC0 1.0.
// The pack sits in the repository root like the two KayKit packs do, and is
// git-ignored; only the prepared files under assets/animals/ are committed.
//
// What this does, and why:
//
//  - Drops every clip the game does not play. The pack ships thirteen per
//    animal, most of them for a game with fighting in it — Attack_Headbutt,
//    Death, two hit reactions, a gallop and a jump. A field animal needs to
//    stand, graze and walk. Nine tenths of the file is animation data, so
//    this is the whole of the size saving.
//
//  - Checks its own work. The two tools next to this one verify that the
//    clips they did not mean to touch came out identical — same names,
//    same durations, same channel counts, same bone set — and this one
//    resamples, which is exactly the step that could silently shorten a
//    clip. A quietly broken animation is the most expensive kind of fault
//    here: it is not visible at a glance and it does not reproduce without
//    the source pack.
//
//  - Does NOT rescale. The pack's cow is 8.07 units long; the game scales it
//    in code, the same rule the characters follow (CLAUDE.md): clips are
//    authored at the model's own scale, and a scale baked into the file puts
//    the feet through the ground.
//
// Run: node tools/prepare-animals.mjs
// Re-running is safe: it always rewrites from the source.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const JSON_CHUNK = 0x4e4f534a;

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE = path.join(ROOT, 'Quaternius_Ultimate_Animated_Animals');
const OUT = path.join(ROOT, 'assets', 'animals');

/**
 * What the pastures need. Two idles and a graze give a herd that is not
 * one pose repeated; the walk is there for when an animal is moved.
 */
const KEEP = ['Idle', 'Idle_2', 'Idle_Headlow', 'Eating', 'Walk'];

/**
 * Source file, and the name it gets in assets/. Lower case, no pack names.
 *
 * Only what the game actually loads. The pack also ships Donkey, Horse,
 * Alpaca, Deer, Stag, Fox, Wolf and three dogs on the same rig and with
 * the same clips — a donkey at the mill and a stag in the wood are both
 * obvious next steps — but an animal prepared and not referenced is a
 * quarter of a megabyte of dead weight in a public repository. Add the
 * line here at the same time as the entry in config/assets.ts.
 */
const ANIMALS = [
  ['Cow.gltf', 'cow'],
  ['Bull.gltf', 'bull'],
];

/** The JSON chunk of a GLB, so the result can be read back and checked. */
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

/**
 * What must survive the pipeline unchanged: the clips by name, their
 * durations to the millisecond, how many channels each drives, and the set
 * of bones those channels can address.
 */
function fingerprint(gltf) {
  const clips = (gltf.animations || []).map((clip) => {
    let duration = 0;
    for (const sampler of clip.samplers) {
      const input = gltf.accessors[sampler.input];
      if (input.max) duration = Math.max(duration, input.max[0]);
    }
    return `${clip.name}@${duration.toFixed(3)}:${clip.channels.length}`;
  }).sort();
  const bones = (gltf.skins || []).flatMap((skin) => skin.joints.map((j) => gltf.nodes[j].name)).sort();
  return { clips, bones };
}

function prepare(sourceName, outName) {
  const sourceFile = path.join(SOURCE, sourceName);
  if (!fs.existsSync(sourceFile)) {
    console.log(`  skip ${sourceName}: not in ${path.relative(ROOT, SOURCE)}`);
    return;
  }

  const gltf = JSON.parse(fs.readFileSync(sourceFile, 'utf8'));
  const had = gltf.animations.length;
  const kept = gltf.animations.filter((clip) => KEEP.includes(clip.name));
  const missing = KEEP.filter((name) => !kept.some((clip) => clip.name === name));
  if (missing.length > 0) throw new Error(`${sourceName}: no clip named ${missing.join(', ')}`);
  gltf.animations = kept;

  fs.mkdirSync(OUT, { recursive: true });
  const temp = path.join(OUT, `${outName}.tmp.gltf`);
  const out = path.join(OUT, `${outName}.glb`);
  fs.writeFileSync(temp, JSON.stringify(gltf));

  const run = (...args) => execFileSync('npx', ['--no-install', 'gltf-transform', ...args], {
    cwd: ROOT,
    stdio: 'pipe',
    shell: process.platform === 'win32',
  });
  // prune drops everything the removed clips were the only reference to;
  // resample then drops the keyframes inside the surviving clips that say
  // nothing — the pack bakes every joint on every frame, and two thirds of
  // what is left after pruning is a joint repeating its own value
  run('prune', temp, out);
  run('resample', out, out);
  // meshopt last. The warning in compress-animations.mjs — that
  // quantization bakes dequantization into inverseBindMatrices and splits
  // one skin into several, one per mesh — does not bite here: an animal is
  // ONE mesh with one skin, so there is nothing to split. The seven
  // primitives inside it are merged at load time and all share that one
  // skin's transform, which is the property that has to hold
  run('meshopt', out, out, '--level', 'high');
  fs.unlinkSync(temp);

  const before = fs.statSync(sourceFile).size;
  const after = fs.statSync(out).size;
  const triangles = gltf.meshes[0].primitives
    .reduce((sum, p) => sum + gltf.accessors[p.indices].count / 3, 0);

  const wanted = fingerprint(gltf);
  const got = fingerprint(readGlbJson(out));
  const ok = JSON.stringify(wanted) === JSON.stringify(got);

  console.log(
    `  ${outName.padEnd(7)} ${String(triangles).padStart(5)} tri  `
    + `${gltf.skins[0].joints.length} joints  ${kept.length}/${had} clips  `
    + `${(before / 1024).toFixed(0)} KB -> ${(after / 1024).toFixed(0)} KB  `
    + `${ok ? 'check ok' : 'CHECK FAILED'}`,
  );
  if (!ok) {
    if (JSON.stringify(wanted.clips) !== JSON.stringify(got.clips)) {
      console.error(`    clips diverged:
      wanted ${wanted.clips.join(', ')}
      got    ${got.clips.join(', ')}`);
    }
    if (JSON.stringify(wanted.bones) !== JSON.stringify(got.bones)) {
      console.error(`    bone set diverged: ${wanted.bones.length} -> ${got.bones.length}`);
    }
  }
  return ok;
}

console.log('animals:');
let failures = 0;
for (const [sourceName, outName] of ANIMALS) {
  if (prepare(sourceName, outName) === false) failures++;
}
if (failures > 0) {
  console.error(`
  failed files: ${failures}`);
  process.exit(1);
}
