import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));

const G_SPH = new THREE.SphereGeometry(0.5, 16, 12);
const G_CYL = new THREE.CylinderGeometry(0.5, 0.42, 1, 12);
const G_CONE = new THREE.ConeGeometry(0.5, 1, 14);
const G_BOX = new THREE.BoxGeometry(1, 1, 1);

export const SKIN_PLAYER = { suit: 0x2f7fc4, skin: 0xf4efe4, hair: 0xe8b21c, shoe: 0xc8102e, nose: 0xc8102e };
export const SKIN_ZOMBIE = [
  { suit: 0x5c2a52, skin: 0x7e9c5c, hair: 0x8f3527, shoe: 0x2f231a, nose: 0x6e2a1c },
  { suit: 0x2a4a3a, skin: 0x84a069, hair: 0x8f5f26, shoe: 0x261e16, nose: 0x7d2f20 },
  { suit: 0x4e401d, skin: 0x789260, hair: 0x603963, shoe: 0x2d221e, nose: 0x843025 },
];

function part(geo, mat, x, y, z, sx, sy, sz) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
  m.castShadow = true;
  return m;
}

/** Two-segment limb: root pivots at the shoulder/hip, joint at elbow/knee. */
function limb(px, py, upper, lower, thick, mat, endMesh) {
  const root = new THREE.Group();
  root.position.set(px, py, 0);
  root.add(part(G_CYL, mat, 0, -upper / 2, 0, thick, upper, thick));
  const joint = new THREE.Group();
  joint.position.set(0, -upper, 0);
  joint.add(part(G_CYL, mat, 0, -lower / 2, 0, thick * 0.88, lower, thick * 0.88));
  if (endMesh) { endMesh.position.y -= lower; joint.add(endMesh); }
  root.add(joint);
  root.userData.joint = joint;
  return root;
}

/**
 * Primitive clown used when the GLB assets aren't present, so the project
 * runs straight after `npm install` with an empty public/assets folder.
 * Same joint names as the rigged version, so ProceduralAnimator and
 * AnimationController are interchangeable.
 */
export function makeClown(cfg, scene) {
  const g = new THREE.Group();
  const mat = {
    suit: new THREE.MeshStandardMaterial({ color: cfg.suit, roughness: 0.78, metalness: 0.02 }),
    skin: new THREE.MeshStandardMaterial({ color: cfg.skin, roughness: 0.62 }),
    hair: new THREE.MeshStandardMaterial({ color: cfg.hair, roughness: 0.95 }),
    shoe: new THREE.MeshStandardMaterial({ color: cfg.shoe, roughness: 0.42, metalness: 0.1 }),
    nose: new THREE.MeshStandardMaterial({ color: cfg.nose, roughness: 0.3, emissive: cfg.nose, emissiveIntensity: 0.45 }),
    cream: new THREE.MeshStandardMaterial({ color: 0xe8ddc6, roughness: 0.9 }),
  };

  const hips = new THREE.Group();
  g.add(hips);
  const chest = new THREE.Group();
  chest.position.y = 0.72;
  hips.add(chest);

  chest.add(part(G_SPH, mat.suit, 0, 0.3, 0, 0.78, 0.94, 0.64));
  chest.add(part(G_CYL, mat.suit, 0, 0.72, 0, 0.92, 0.46, 0.74));
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6;
    chest.add(part(G_SPH, mat.hair, Math.cos(a) * 0.34, 0.12 + i * 0.16, Math.sin(a) * 0.3, 0.12));
  }
  const ruff = part(new THREE.TorusGeometry(0.35, 0.13, 10, 18), mat.cream, 0, 0.88, 0, 1, 1, 1);
  ruff.rotation.x = Math.PI / 2;
  chest.add(ruff);

  const neck = new THREE.Group();
  neck.position.y = 1.0;
  chest.add(neck);
  const head = new THREE.Group();
  neck.add(head);
  head.add(part(G_SPH, mat.skin, 0, 0.1, 0, 0.62, 0.68, 0.6));
  head.add(part(G_SPH, mat.nose, 0, 0.08, 0.31, 0.19));
  head.add(part(G_SPH, mat.hair, -0.33, 0.2, -0.02, 0.27, 0.32, 0.29));
  head.add(part(G_SPH, mat.hair, 0.33, 0.2, -0.02, 0.27, 0.32, 0.29));
  head.add(part(G_SPH, mat.hair, 0, 0.34, -0.22, 0.29, 0.25, 0.27));
  const hat = part(G_CONE, mat.suit, 0, 0.56, -0.02, 0.46, 0.76, 0.46);
  hat.rotation.z = 0.14;
  head.add(hat);
  head.add(part(G_SPH, mat.hair, 0.1, 0.95, -0.02, 0.12));
  const eye = new THREE.MeshStandardMaterial({ color: 0x120c12 });
  head.add(part(G_SPH, mat.cream, -0.17, 0.2, 0.24, 0.15, 0.17, 0.12));
  head.add(part(G_SPH, mat.cream, 0.17, 0.2, 0.24, 0.15, 0.17, 0.12));
  head.add(part(G_SPH, eye, -0.17, 0.2, 0.285, 0.075));
  head.add(part(G_SPH, eye, 0.17, 0.2, 0.285, 0.075));

  const hand = () => part(G_SPH, mat.skin, 0, 0, 0, 0.15);
  const boot = () => part(G_BOX, mat.shoe, 0, -0.06, 0.16, 0.32, 0.2, 0.66);

  const larm = limb(-0.48, 0.86, 0.42, 0.4, 0.19, mat.suit, hand());
  const rarm = limb(0.48, 0.86, 0.42, 0.4, 0.19, mat.suit, hand());
  chest.add(larm, rarm);

  const lleg = limb(-0.21, 0.02, 0.36, 0.34, 0.23, mat.suit, boot());
  const rleg = limb(0.21, 0.02, 0.36, 0.34, 0.23, mat.suit, boot());
  hips.add(lleg, rleg);

  // Archetype proportions. Scaling the limb roots also scales their child
  // joint offsets, so a stiltwalker's knees end up in the right place without
  // rebuilding the rig.
  const b = cfg.build || {};
  const girth = b.girth ?? 1;
  chest.scale.set(girth, 1, girth);
  hips.scale.set(girth, 1, girth);
  if (b.head) head.scale.setScalar(b.head);
  if (b.arm) { larm.scale.setScalar(b.arm); rarm.scale.setScalar(b.arm); }
  if (b.leg) {
    lleg.scale.setScalar(b.leg);
    rleg.scale.setScalar(b.leg);
    // Lift the body so the feet still reach the floor.
    hips.position.y += (b.leg - 1) * 0.7;
  }

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.rig = { hips, chest, neck, head, larm, rarm, lleg, rleg };
  if (scene) scene.add(g);
  return g;
}

/** Hip swing, phased knee bend, counter-rotating torso, speed lean. */
export function poseLocomotion(rig, phase, amt, speed, turn, dt, lookPitch) {
  const s = Math.sin(phase), s2 = Math.sin(phase * 2);

  rig.lleg.rotation.x = -s * 0.62 * amt;
  rig.rleg.rotation.x = s * 0.62 * amt;
  rig.lleg.userData.joint.rotation.x = Math.max(0, Math.sin(phase + 1.25)) * 1.15 * amt;
  rig.rleg.userData.joint.rotation.x = Math.max(0, Math.sin(phase + 1.25 + Math.PI)) * 1.15 * amt;

  rig.larm.rotation.x = s * 0.5 * amt;
  rig.rarm.rotation.x = -s * 0.5 * amt;
  rig.larm.rotation.z = 0.13 + Math.abs(s) * 0.1 * amt;
  rig.rarm.rotation.z = -0.13 - Math.abs(s) * 0.1 * amt;
  rig.larm.userData.joint.rotation.x = -(0.25 + Math.max(0, s) * 0.55) * amt - 0.12;
  rig.rarm.userData.joint.rotation.x = -(0.25 + Math.max(0, -s) * 0.55) * amt - 0.12;

  rig.hips.position.y = Math.abs(s2) * 0.055 * amt;
  rig.hips.rotation.y = s * 0.1 * amt;
  rig.hips.rotation.z = damp(rig.hips.rotation.z, -turn * 0.5, 9, dt);

  rig.chest.rotation.y = -s * 0.16 * amt;
  rig.chest.rotation.x = damp(rig.chest.rotation.x, -clamp(speed * 0.022, 0, 0.2), 8, dt);
  rig.chest.rotation.z = damp(rig.chest.rotation.z, turn * 0.28, 9, dt);

  rig.neck.rotation.x = damp(rig.neck.rotation.x, (lookPitch || 0) * 0.4 - rig.chest.rotation.x, 12, dt);
  rig.neck.rotation.y = damp(rig.neck.rotation.y, -rig.chest.rotation.y * 0.6, 12, dt);
}

/**
 * Drop-in replacement for AnimationController when running without GLBs.
 * Identical syncToState signature, so Player and Zombie never branch on it.
 */
export class ProceduralAnimator {
  constructor(root, profile = 'player') {
    this.root = root;
    this.rig = root.userData.rig;
    this.profile = profile;
    this.phase = Math.random() * TAU;
    this.stride = 0;
    this.procedural = true;
  }

  syncToState(state, ctx, dt) {
    const rig = this.rig;
    const speed = ctx.speed || 0;
    const maxRun = this.profile === 'zombie' ? 2.9 : 5.0;

    const grounded = ctx.grounded !== false;
    this.stride = damp(this.stride, grounded ? clamp((speed / maxRun) * 1.15, 0, 1) : 0.25, 12, dt);
    this.phase += dt * (2.4 + speed * 1.55);

    poseLocomotion(rig, this.phase, this.stride, speed, ctx.turn || 0, dt, ctx.pitch || 0);

    if (this.profile === 'zombie') this._shamble(state, ctx, dt);
    else this._player(state, ctx, dt);
  }

  _player(state, ctx, dt) {
    const rig = this.rig;

    if (state === 'jump' || state === 'fall') {
      const t = clamp((ctx.vy || 0) * 0.09, -1, 1);
      rig.lleg.rotation.x = damp(rig.lleg.rotation.x, -0.5 + t * 0.3, 14, dt);
      rig.rleg.rotation.x = damp(rig.rleg.rotation.x, 0.2 - t * 0.2, 14, dt);
      rig.lleg.userData.joint.rotation.x = damp(rig.lleg.userData.joint.rotation.x, 0.9, 14, dt);
      rig.rleg.userData.joint.rotation.x = damp(rig.rleg.userData.joint.rotation.x, 0.35, 14, dt);
      rig.larm.rotation.z = damp(rig.larm.rotation.z, 0.9, 12, dt);
      rig.rarm.rotation.z = damp(rig.rarm.rotation.z, -0.9, 12, dt);
      rig.chest.rotation.x = damp(rig.chest.rotation.x, -0.12 - t * 0.1, 10, dt);
    }

    if (state === 'roll') {
      const t = clamp((ctx.stateT || 0) / 0.46, 0, 1);
      rig.hips.rotation.x = -t * TAU;
      rig.hips.position.y = Math.sin(t * Math.PI) * 0.42;
      rig.lleg.userData.joint.rotation.x = 1.7;
      rig.rleg.userData.joint.rotation.x = 1.7;
      rig.larm.rotation.x = 2.2;
      rig.rarm.rotation.x = 2.2;
    } else {
      rig.hips.rotation.x = damp(rig.hips.rotation.x, 0, 16, dt);
    }

    if (ctx.throwT > 0) {
      const t = clamp(ctx.throwT, 0, 1);
      const swing = Math.sin(t * Math.PI);
      rig.rarm.rotation.x = -2.5 + swing * 3.4;
      rig.rarm.rotation.z = -0.35;
      rig.chest.rotation.y = -0.4 + t * 0.75;
    }

    if (ctx.streaming) {
      rig.rarm.rotation.x = damp(rig.rarm.rotation.x, -1.5 + (ctx.pitch || 0) * 0.8, 16, dt);
      rig.rarm.userData.joint.rotation.x = damp(rig.rarm.userData.joint.rotation.x, -0.2, 16, dt);
      rig.larm.rotation.x = damp(rig.larm.rotation.x, -1.1, 14, dt);
      rig.chest.rotation.y = damp(rig.chest.rotation.y, -0.3, 12, dt);
    }

    const aim = ctx.aimBlend || 0;
    if (aim > 0.02) {
      rig.rarm.rotation.x = lerp(rig.rarm.rotation.x, -1.5 + (ctx.pitch || 0) * 0.7, aim);
      rig.rarm.userData.joint.rotation.x = lerp(rig.rarm.userData.joint.rotation.x, -0.35, aim);
      rig.chest.rotation.y = lerp(rig.chest.rotation.y, -0.35, aim);
    }
  }

  _shamble(state, ctx) {
    const rig = this.rig;
    rig.larm.rotation.x -= 1.5;
    rig.rarm.rotation.x -= 1.35;
    rig.larm.userData.joint.rotation.x = -0.5;
    rig.rarm.userData.joint.rotation.x = -0.35;
    rig.lleg.rotation.x *= 1.25;
    rig.hips.rotation.z += Math.sin(this.phase * 0.5) * 0.1;
    rig.chest.rotation.z += Math.sin(this.phase * 0.5 + 1) * 0.09;
    rig.chest.rotation.x -= 0.22;
    rig.neck.rotation.z = Math.sin(this.phase * 0.37) * 0.22;

    const t = clamp((ctx.stateT || 0), 0, 10);
    if (state === 'alert') {
      const k = clamp(t / 0.45, 0, 1);
      rig.chest.rotation.x -= Math.sin(k * Math.PI) * 0.45;
      rig.neck.rotation.x = -0.35;
      rig.larm.rotation.x -= 0.6;
      rig.rarm.rotation.x -= 0.6;
    }
    if (state === 'stagger') {
      const k = clamp(t / 0.5, 0, 1);
      rig.chest.rotation.x += Math.sin(k * Math.PI) * 0.8;
      rig.neck.rotation.x = 0.5;
      rig.larm.rotation.x += 1.0;
      rig.rarm.rotation.x += 1.0;
    }
    if (state === 'attack') {
      const k = clamp(t / 0.75, 0, 1);
      const wind = clamp(k / 0.4, 0, 1);
      const swipe = k > 0.4 ? clamp((k - 0.4) / 0.25, 0, 1) : 0;
      rig.rarm.rotation.x = -1.4 - wind * 1.5 + swipe * 3.2;
      rig.chest.rotation.y = -wind * 0.6 + swipe * 1.0;
    }
    if (state === 'dead') {
      rig.chest.rotation.x = damp(rig.chest.rotation.x, 0.5, 6, 0.016);
    }
  }
}
