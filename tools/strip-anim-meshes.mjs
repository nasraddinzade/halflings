// Strips the dummy mesh from animation GLBs, keeping only skeleton and clips.
//
// Why: KayKit animation files carry a 6916-triangle dummy inside. The game
// reads only gltf.animations from them, so the mesh is dead weight: across
// the five files we need that is ~3 MB out of 4.4.
//
// Removed: meshes, skins, materials, nodes that carry a mesh.
// Kept: bone nodes with the rest pose, animations and their accessors.
// Bones are left untouched — clip tracks address them by name.
//
// Run: node tools/strip-anim-meshes.mjs
// No dependencies: the GLB is parsed and rebuilt by hand.

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'KayKit_Character_Animations_1.1',
  'KayKit_Character_Animations_1.1', 'Animations', 'gltf', 'Rig_Medium');
const OUT = path.join(ROOT, 'assets', 'animations');

// Only the categories allowed by CLAUDE.md. Combat* and Special are out.
const FILES = {
  'Rig_Medium_General.glb': 'general.glb',
  'Rig_Medium_MovementBasic.glb': 'movement.glb',
  'Rig_Medium_MovementAdvanced.glb': 'movement_advanced.glb',
  'Rig_Medium_Simulation.glb': 'simulation.glb',
  'Rig_Medium_Tools.glb': 'tools.glb',
};

const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function readGlb(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`not a GLB: ${file}`);
  const total = buf.readUInt32LE(8);
  let offset = 12, json = null, bin = null;
  while (offset < total) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(data));
    else if (type === BIN_CHUNK) bin = data;
    offset += 8 + length;
    offset += (4 - (offset % 4)) % 4;
  }
  if (!json) throw new Error(`no JSON chunk: ${file}`);
  return { json, bin, size: buf.length };
}

function writeGlb(file, json, bin) {
  const pad = (buf, filler) => {
    const rem = (4 - (buf.length % 4)) % 4;
    return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(rem, filler)]);
  };
  const jsonChunk = pad(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const binChunk = pad(bin, 0x00);
  const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;
  const out = Buffer.alloc(total);
  out.writeUInt32LE(0x46546c67, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(total, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(JSON_CHUNK, 16);
  jsonChunk.copy(out, 20);
  const binStart = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, binStart);
  out.writeUInt32LE(BIN_CHUNK, binStart + 4);
  binChunk.copy(out, binStart + 8);
  fs.writeFileSync(file, out);
  return total;
}

/** Pulls accessor data out tightly packed, dropping byteStride. */
function extractAccessor(src, accessor) {
  const elementSize = COMPONENT_BYTES[accessor.componentType] * TYPE_COUNT[accessor.type];
  const out = Buffer.alloc(accessor.count * elementSize);
  if (accessor.bufferView === undefined) return out; // sparse/empty — rare
  const view = src.json.bufferViews[accessor.bufferView];
  const stride = view.byteStride || elementSize;
  const base = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  for (let i = 0; i < accessor.count; i++) {
    src.bin.copy(out, i * elementSize, base + i * stride, base + i * stride + elementSize);
  }
  return out;
}

function strip(srcFile) {
  const src = readGlb(srcFile);
  const j = src.json;

  // 1. Nodes to drop are the ones carrying a mesh. The rest is the skeleton
  //    and the rig container.
  const dropped = new Set();
  j.nodes.forEach((n, i) => { if (n.mesh !== undefined) dropped.add(i); });

  const keptNodes = j.nodes.map((_, i) => i).filter((i) => !dropped.has(i));
  const nodeRemap = new Map(keptNodes.map((oldIdx, newIdx) => [oldIdx, newIdx]));

  // No channel is allowed to point at a dropped node.
  for (const anim of j.animations || []) {
    for (const ch of anim.channels) {
      if (ch.target.node !== undefined && dropped.has(ch.target.node)) {
        throw new Error(`channel of clip "${anim.name}" targets mesh node ${ch.target.node}`);
      }
    }
  }

  // 2. The accessors referenced by animation samplers — those are the only
  //    ones we need.
  const keptAccessors = [];
  const accessorRemap = new Map();
  const keepAccessor = (oldIdx) => {
    if (accessorRemap.has(oldIdx)) return accessorRemap.get(oldIdx);
    const newIdx = keptAccessors.length;
    accessorRemap.set(oldIdx, newIdx);
    keptAccessors.push(oldIdx);
    return newIdx;
  };

  const animations = (j.animations || []).map((anim) => ({
    ...anim,
    samplers: anim.samplers.map((s) => ({
      ...s,
      input: keepAccessor(s.input),
      output: keepAccessor(s.output),
    })),
    channels: anim.channels.map((ch) => ({
      sampler: ch.sampler,
      target: { ...ch.target, node: nodeRemap.get(ch.target.node) },
    })),
  }));

  // 3. New buffer: every accessor gets its own tightly packed bufferView.
  const chunks = [];
  const bufferViews = [];
  const accessors = [];
  let cursor = 0;
  for (const oldIdx of keptAccessors) {
    const acc = j.accessors[oldIdx];
    const data = extractAccessor(src, acc);
    // 4-byte alignment — the spec requires it for bufferView
    const padding = (4 - (cursor % 4)) % 4;
    if (padding) { chunks.push(Buffer.alloc(padding)); cursor += padding; }
    bufferViews.push({ buffer: 0, byteOffset: cursor, byteLength: data.length });
    chunks.push(data);
    cursor += data.length;
    const next = {
      bufferView: bufferViews.length - 1,
      componentType: acc.componentType,
      count: acc.count,
      type: acc.type,
    };
    if (acc.min) next.min = acc.min;
    if (acc.max) next.max = acc.max;
    if (acc.normalized) next.normalized = acc.normalized;
    if (acc.name) next.name = acc.name;
    accessors.push(next);
  }
  const bin = Buffer.concat(chunks);

  // 4. Nodes: drop the mesh and skin references, reindex the children.
  const nodes = keptNodes.map((oldIdx) => {
    const n = { ...j.nodes[oldIdx] };
    delete n.mesh;
    delete n.skin;
    if (n.children) {
      const kids = n.children.filter((c) => !dropped.has(c)).map((c) => nodeRemap.get(c));
      if (kids.length) n.children = kids; else delete n.children;
    }
    return n;
  });

  const scenes = (j.scenes || []).map((s) => ({
    ...s,
    nodes: (s.nodes || []).filter((n) => !dropped.has(n)).map((n) => nodeRemap.get(n)),
  }));

  const out = {
    asset: { ...j.asset, generator: 'strip-anim-meshes.mjs (KayKit source)' },
    scene: j.scene ?? 0,
    scenes,
    nodes,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bin.length }],
    animations,
  };

  return { out, bin, src };
}

/** Recomputes the things that must match before and after. */
function fingerprint(glb) {
  const j = glb.json;
  const clips = (j.animations || []).map((a) => {
    let duration = 0;
    for (const s of a.samplers) {
      const acc = j.accessors[s.input];
      if (acc.max) duration = Math.max(duration, acc.max[0]);
    }
    return `${a.name}@${duration.toFixed(3)}:${a.channels.length}`;
  }).sort();
  const bones = j.nodes.filter((n) => n.mesh === undefined && n.name).map((n) => n.name).sort();
  return { clips, bones };
}

fs.mkdirSync(OUT, { recursive: true });

let before = 0, after = 0, failures = 0;
for (const [srcName, outName] of Object.entries(FILES)) {
  const srcPath = path.join(SRC, srcName);
  const outPath = path.join(OUT, outName);
  const { out, bin, src } = strip(srcPath);
  const size = writeGlb(outPath, out, bin);

  // Check: clips, durations, channel counts and the bone set are unchanged.
  const a = fingerprint(src);
  const b = fingerprint(readGlb(outPath));
  const ok = JSON.stringify(a) === JSON.stringify(b);
  if (!ok) {
    failures++;
    console.error(`  ERROR ${outName}: mismatch after rebuild`);
    if (JSON.stringify(a.clips) !== JSON.stringify(b.clips)) console.error('    clips diverged');
    if (JSON.stringify(a.bones) !== JSON.stringify(b.bones)) console.error(`    bones: ${a.bones.length} -> ${b.bones.length}`);
  }
  before += src.size;
  after += size;
  const pct = (100 - (size / src.size) * 100).toFixed(0);
  console.log(`  ${srcName.padEnd(32)} -> assets/animations/${outName.padEnd(22)} ` +
    `${(src.size / 1024).toFixed(0).padStart(5)} KB -> ${(size / 1024).toFixed(0).padStart(4)} KB  (-${pct}%)  ` +
    `clips ${a.clips.length}, bones ${b.bones.length}  ${ok ? 'check ok' : 'CHECK FAILED'}`);
}

console.log(`\n  total ${(before / 1024 / 1024).toFixed(2)} MB -> ${(after / 1024 / 1024).toFixed(2)} MB ` +
  `(-${(100 - (after / before) * 100).toFixed(0)}%)`);
if (failures) { console.error(`\n  failed files: ${failures}`); process.exit(1); }
