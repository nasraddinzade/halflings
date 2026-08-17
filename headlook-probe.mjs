// Throwaway probe: runs the real rig + real mixer + a verbatim port of
// HeadLook.apply and reports, per frame, whether the mixer actually rewrote
// head.quaternion and where the head ends up pointing.
import fs from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkeletonHierarchy } from 'three/examples/jsm/utils/SkeletonUtils.js';

const NOTICE_NEAR = 9, NOTICE_FAR = 13;
const NOTICE_YAW_LIMIT = (70 * Math.PI) / 180;
const NOTICE_YAW_FADE = (100 * Math.PI) / 180;
const NOTICE_PITCH_LIMIT = (22 * Math.PI) / 180;
const NOTICE_EASE = 3.5;
const CHARACTER_SCALE = 0.50451;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smoothstep = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const load = async (p) => {
  const b = fs.readFileSync(p);
  return new Promise((res, rej) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej));
};

const rogue = await load('D:/hobbits/assets/characters/parts/Rogue.glb');
const clipFiles = ['general.glb', 'movement.glb', 'simulation.glb', 'tools.glb'];
const clips = new Map();
for (const f of clipFiles) {
  const g = await load(`D:/hobbits/assets/animations/${f}`);
  for (const c of g.animations) if (!clips.has(c.name)) clips.set(c.name, c);
}

// ---- port of HeadLook -------------------------------------------------------
class HeadLook {
  constructor(skeleton, root) {
    const name = THREE.PropertyBinding.sanitizeNodeName('head');
    this.head = skeleton.bones.find((b) => b.name === name);
    this.parent = this.head.parent;
    this.weight = 0;
    this.aimYaw = 0; this.aimPitch = 0; this.hasAim = false;
    this.restForward = new THREE.Vector3();
    this.headWorld = new THREE.Vector3();
    this.headQuaternion = new THREE.Quaternion();
    this.parentWorld = new THREE.Quaternion();
    this.parentInverse = new THREE.Quaternion();
    this.facing = new THREE.Vector3();
    this.wanted = new THREE.Vector3();
    this.delta = new THREE.Quaternion();
    this.blended = new THREE.Quaternion();
    this.turn = new THREE.Quaternion();
    this.IDENTITY = new THREE.Quaternion();
    root.updateMatrixWorld(true);
    const relative = root.getWorldQuaternion(new THREE.Quaternion()).invert()
      .multiply(this.head.getWorldQuaternion(new THREE.Quaternion()));
    this.restForward.set(0, 0, 1).applyQuaternion(relative.invert()).normalize();
  }
  get idle() { return this.weight < 1e-3; }
  apply(target, bodyYaw, delta) {
    const strength = target === null ? 0 : this.aim(target, bodyYaw);
    this.weight += (strength - this.weight) * (1 - Math.exp(-NOTICE_EASE * delta));
    if (this.idle) { this.weight = 0; return; }
    if (!this.hasAim) return;
    this.wanted.set(
      Math.sin(bodyYaw + this.aimYaw) * Math.cos(this.aimPitch),
      Math.sin(this.aimPitch),
      Math.cos(bodyYaw + this.aimYaw) * Math.cos(this.aimPitch),
    );
    this.head.getWorldQuaternion(this.headQuaternion);
    this.facing.copy(this.restForward).applyQuaternion(this.headQuaternion).normalize();
    if (this.facing.dot(this.wanted) < -0.999) return;
    this.turn.setFromUnitVectors(this.facing, this.wanted);
    this.parent.getWorldQuaternion(this.parentWorld);
    this.parentInverse.copy(this.parentWorld).invert();
    this.delta.copy(this.parentInverse).multiply(this.turn).multiply(this.parentWorld);
    this.blended.copy(this.IDENTITY).slerp(this.delta, this.weight);
    this.head.quaternion.premultiply(this.blended);
  }
  aim(target, bodyYaw) {
    this.head.getWorldPosition(this.headWorld);
    const dx = target.x - this.headWorld.x, dz = target.z - this.headWorld.z, dy = target.y - this.headWorld.y;
    const flat = Math.hypot(dx, dz);
    if (flat < 1e-4) return 0;
    let yaw = Math.atan2(dx, dz) - bodyYaw;
    yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw));
    this.aimYaw = clamp(yaw, -NOTICE_YAW_LIMIT, NOTICE_YAW_LIMIT);
    this.aimPitch = clamp(Math.atan2(dy, flat), -NOTICE_PITCH_LIMIT, NOTICE_PITCH_LIMIT);
    this.hasAim = true;
    const byDistance = 1 - smoothstep(NOTICE_NEAR, NOTICE_FAR, Math.hypot(flat, dy));
    const byCone = 1 - smoothstep(NOTICE_YAW_LIMIT, NOTICE_YAW_FADE, Math.abs(yaw));
    return byDistance * byCone;
  }
}

// ---- rig --------------------------------------------------------------------
function makeRig() {
  const copy = cloneSkeletonHierarchy(rogue.scene);
  let skinned = null;
  const meshes = [];
  copy.traverse((c) => { if (c.isSkinnedMesh && skinned === null) skinned = c; if (c.isMesh) meshes.push(c); });
  const skeleton = skinned.skeleton;
  for (const m of meshes) m.removeFromParent();
  const root = new THREE.Group();
  root.add(copy);
  root.scale.setScalar(CHARACTER_SCALE);
  const scene = new THREE.Scene();
  scene.add(root);
  return { root, skeleton, mixer: new THREE.AnimationMixer(root) };
}

function run(clipName, frames, label, dropTargetAt = Infinity) {
  const { root, skeleton, mixer } = makeRig();
  const look = new HeadLook(skeleton, root);
  const head = skeleton.bones.find((b) => b.name === 'head');
  const action = mixer.clipAction(clips.get(clipName));
  action.play();

  const bodyYaw = 0;
  root.rotation.y = bodyYaw;
  const player = new THREE.Vector3(3, 0.95, 3); // 45 deg to the left, in the cone

  const dt = 1 / 60;
  const afterLook = new THREE.Quaternion();
  let writes = 0, skips = 0;
  const angles = [];
  for (let f = 0; f < frames; f++) {
    mixer.update(dt);
    // did the mixer overwrite what we left in the bone last frame?
    if (f > 0) {
      if (head.quaternion.equals(afterLook)) skips++; else writes++;
    }
    root.updateMatrixWorld(true);
    look.apply(f < dropTargetAt ? player : null, bodyYaw, dt);
    afterLook.copy(head.quaternion);
    root.updateMatrixWorld(true);
    const q = head.getWorldQuaternion(new THREE.Quaternion());
    const fwd = look.restForward.clone().applyQuaternion(q).normalize();
    angles.push({ f, yaw: (Math.atan2(fwd.x, fwd.z) * 180) / Math.PI, w: look.weight });
  }
  const want = (Math.atan2(player.x, player.z) * 180) / Math.PI;
  console.log(`\n--- ${label}: clip=${clipName} frames=${frames} dropTargetAt=${dropTargetAt}`);
  console.log(`    mixer wrote head.quaternion on ${writes} frames, SKIPPED it on ${skips}`);
  console.log(`    target world yaw = ${want.toFixed(2)} deg (cone clamp 70 deg)`);
  const show = [0, 1, 2, 5, 10, 20, 40, 60, 90, 120, 150, 200, 250, 299].filter((i) => i < frames);
  for (const i of show) {
    const a = angles[i];
    console.log(`      frame ${String(a.f).padStart(3)}  headYaw=${a.yaw.toFixed(2).padStart(9)} deg  weight=${a.w.toFixed(3)}`);
  }
}

run('Idle_A', 300, 'moving head track (mixer rewrites)');
run('Walking_A', 300, 'CONSTANT head track');
run('Fishing_Idle', 300, 'CONSTANT head track');
run('Walking_A', 300, 'CONSTANT head track, target dropped at frame 120', 120);
run('Idle_A', 300, 'moving head track, target dropped at frame 120', 120);
