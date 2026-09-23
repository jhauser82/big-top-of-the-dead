import * as THREE from 'three';
import { GRAVITY } from '../physics/PhysicsWorld.js';
import { BlobShadow } from './BlobShadow.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));

export const ST = {
  IDLE: 'idle', WALK: 'walk', RUN: 'run', JUMP: 'jump', FALL: 'fall',
  LAND: 'land', ROLL: 'roll', THROW: 'throw', HURT: 'hurt', DEAD: 'dead',
};

export const SPEED = { walk: 3.4, run: 5.0, sprint: 7.4, roll: 9.2 };
const JUMP_V = 6.6;
const COYOTE = 0.12;
const JUMP_BUFFER = 0.15;

export class Player {
  constructor({ scene, physics, character, input, camera, audio, hud, projectiles, weapons, blobTexture }) {
    this.physics = physics;
    this.input = input;
    this.camera = camera;
    this.audio = audio;
    this.hud = hud;
    this.projectiles = projectiles;
    this.weapons = weapons;

    this.pos = new THREE.Vector3(0, 1.0, -13);
    this.vel = new THREE.Vector3();
    this.body = physics.createCharacter(this.pos, 0.33, 0.57);
    this.feetOffset = this.body.height;

    this.character = character;
    this.mesh = character.root;
    scene.add(this.mesh);
    this.blob = new BlobShadow(scene, physics, blobTexture, this.body.collider);

    this.state = ST.IDLE;
    this.stateT = 0;
    this.grounded = false;
    this.coyote = 0;
    this.jumpBuffer = 0;

    this.health = 100;
    this.kills = 0;
    this.streaming = false;
    this.heat = 0;
    this.iframes = 0;
    this.hurtFlash = 0;
    this.throwCd = 0;
    this.rollCd = 0;
    this.aimBlend = 0;
    this.squash = 0;
    this.turnRate = 0;
    this.alive = true;

    this.rollDir = new THREE.Vector3(0, 0, 1);
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._moved = new THREE.Vector3();
  }

  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get aiming() { return this.input.aiming && this.alive; }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
  }

  update(dt) {
    const input = this.input;
    this.stateT += dt;
    this.throwCd = Math.max(0, this.throwCd - dt);
    this.rollCd = Math.max(0, this.rollCd - dt);
    this.iframes = Math.max(0, this.iframes - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.6);
    this.heat = Math.max(0, this.heat - dt * 3.0);
    this.aimBlend = damp(this.aimBlend, this.aiming ? 1 : 0, 11, dt);

    if (input.restockQueued) {
      input.restockQueued = false;
      for (const id of this.weapons.order) this.weapons.give(id, 999);
      this.hud.toast('Restocked');
    }
    if (input.weaponSlot !== null) {
      this.weapons.select(input.weaponSlot);
      input.weaponSlot = null;
    }
    if (input.weaponCycle) {
      this.weapons.cycle(input.weaponCycle);
      input.weaponCycle = 0;
    }
    this.weapons.update(dt, this, this.zombies || []);

    if (this.state === ST.DEAD) {
      // Drain queued input, or it fires the instant you respawn. Harmless
      // while death reloads the page; a real bug the moment checkpoints land.
      input.fireQueued = false;
      input.rollQueued = false;
      this.vel.y += GRAVITY * dt;
      this._integrate(dt);
      this._applyTransform(dt);
      return;
    }

    // ── intent ───────────────────────────────────────────────────────────
    this.camera.basis(this._fwd, this._right);
    const [ax, ay] = input.axis();
    this._wish.set(0, 0, 0)
      .addScaledVector(this._fwd, -ay)
      .addScaledVector(this._right, ax);

    let wishLen = this._wish.length();
    if (wishLen > 0.001) this._wish.divideScalar(wishLen);
    wishLen = Math.min(wishLen, 1);

    const sprinting = input.sprinting && !this.aiming && wishLen > 0.4;
    let target = this.aiming
      ? SPEED.walk
      : sprinting ? SPEED.sprint
      : wishLen > 0.65 ? SPEED.run
      : SPEED.walk * wishLen * 1.4;
    if (this.state === ST.THROW) target *= 0.55;
    if (this.state === ST.HURT) target *= 0.3;

    // ── jump: coyote time + input buffer + variable height ───────────────
    this.coyote = this.grounded ? COYOTE : Math.max(0, this.coyote - dt);
    this.jumpBuffer = input.jumpHeld ? JUMP_BUFFER : Math.max(0, this.jumpBuffer - dt);

    if (this.jumpBuffer > 0 && this.coyote > 0 && this.state !== ST.ROLL) {
      this.vel.y = JUMP_V;
      this.grounded = false;
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.setState(ST.JUMP);
      this.audio.sfx('jump');
    }
    if (!input.jumpHeld && this.vel.y > 1.6) this.vel.y -= 26 * dt;

    // ── roll ──────────────────────────────────────────────────────────────
    if (input.rollQueued) {
      input.rollQueued = false;
      if (this.rollCd <= 0 && this.grounded && wishLen > 0.2 && this.state !== ST.ROLL) {
        this.setState(ST.ROLL);
        this.rollCd = 0.85;
        this.iframes = 0.42;
        this.rollDir.copy(this._wish);
        this.audio.sfx('roll');
      }
    }

    let moving = wishLen > 0.001;
    if (this.state === ST.ROLL) {
      if (this.stateT > 0.46) this.setState(ST.IDLE);
      else { this._wish.copy(this.rollDir); target = SPEED.roll; moving = true; }
    }

    if (input.fireQueued) {
      input.fireQueued = false;
      if (this.weapons.fire(this)) {
        this.throwCd = Math.max(this.throwCd, 0.34);
        this._throwStarted = true;
        this.setState(ST.THROW);
      }
    }

    // ── integrate ─────────────────────────────────────────────────────────
    const accel = this.grounded ? (this.state === ST.ROLL ? 30 : 17) : 6.5;
    const friction = this.grounded ? 14 : 1.4;
    if (moving) {
      this.vel.x = damp(this.vel.x, this._wish.x * target, accel, dt);
      this.vel.z = damp(this.vel.z, this._wish.z * target, accel, dt);
    } else {
      this.vel.x = damp(this.vel.x, 0, friction, dt);
      this.vel.z = damp(this.vel.z, 0, friction, dt);
    }
    this.vel.y = Math.max(-38, this.vel.y + GRAVITY * dt);

    const wasAir = !this.grounded;
    const vyBefore = this.vel.y;
    this._integrate(dt);

    if (this.grounded) {
      if (wasAir && vyBefore < -6) {
        const impact = clamp(-vyBefore / 22, 0, 1);
        this.squash = impact;
        this.camera.addTrauma(impact * 0.35);
        this.audio.sfx('land', { force: impact });
        this.setState(ST.LAND);
      }
      if (this.vel.y < 0) this.vel.y = 0;
    }

    if (this.pos.y < -14) {
      this.pos.set(0, 1.4, -13);
      this.vel.set(0, 0, 0);
      this.physics.warpCharacter(this.body, this.pos);
    }

    // ── state resolution ──────────────────────────────────────────────────
    const hSpeed = this.speed;
    if (this.state !== ST.ROLL && this.state !== ST.HURT) {
      if (!this.grounded) this.setState(this.vel.y > 0.4 ? ST.JUMP : ST.FALL);
      else if (this.state === ST.LAND && this.stateT < 0.18) { /* hold the beat */ }
      else if (this.throwCd > 0.18) this.setState(ST.THROW);
      else if (hSpeed > 5.6) this.setState(ST.RUN);
      else if (hSpeed > 0.5) this.setState(ST.WALK);
      else this.setState(ST.IDLE);
    }
    if (this.state === ST.HURT && this.stateT > 0.28) this.setState(ST.IDLE);

    this._applyTransform(dt);
  }

  _integrate(dt) {
    this._desired.set(this.vel.x * dt, this.vel.y * dt, this.vel.z * dt);
    const r = this.physics.moveCharacter(this.body, this._desired, this._moved);
    this.pos.add(r.movement);
    this.grounded = r.grounded;
    if (r.ceiling) this.vel.y = 0;
    this.physics.setCharacterPosition(this.body, this.pos);
  }

  _applyTransform(dt) {
    const mesh = this.mesh;
    mesh.position.copy(this.pos);
    mesh.position.y -= this.feetOffset;

    const prevY = mesh.rotation.y;
    let faceTarget = mesh.rotation.y;
    if (this.aiming) faceTarget = this.camera.yaw + Math.PI;
    else if (this.speed > 0.6) faceTarget = Math.atan2(this.vel.x, this.vel.z);
    if (this.state === ST.ROLL) faceTarget = Math.atan2(this.rollDir.x, this.rollDir.z);

    let d = faceTarget - mesh.rotation.y;
    while (d > Math.PI) d -= TAU;
    while (d < -Math.PI) d += TAU;
    mesh.rotation.y += d * Math.min(1, dt * (this.aiming ? 20 : 13));

    let dy = mesh.rotation.y - prevY;
    while (dy > Math.PI) dy -= TAU;
    while (dy < -Math.PI) dy += TAU;
    this.turnRate = damp(this.turnRate, clamp((dy / Math.max(dt, 1e-4)) * 0.14, -1, 1), 10, dt);

    this.character.anim.syncToState(this.state, {
      speed: this.speed,
      turn: this.turnRate,
      pitch: this.camera.pitch,
      vy: this.vel.y,
      grounded: this.grounded,
      stateT: this.stateT,
      aimBlend: this.aimBlend,
      throwT: this.throwCd > 0 ? 1 - this.throwCd / 0.34 : 0,
      throwStart: this._throwStarted,
      streaming: this.streaming,
    }, dt);
    this._throwStarted = false;

    this.squash = damp(this.squash, 0, 9, dt);
    mesh.scale.set(1 + this.squash * 0.22, 1 - this.squash * 0.3, 1 + this.squash * 0.22);

    this.blob.update(this.pos, this.feetOffset);
  }

  hurt(amount) {
    if (this.iframes > 0 || !this.alive) return;
    this.health -= amount;
    this.iframes = 0.65;
    this.hurtFlash = 1;
    this.setState(ST.HURT);
    this.camera.addTrauma(0.4);
    this.audio.sfx('hurt');
    if (this.health <= 0) this.die();
  }

  die() {
    this.alive = false;
    this.setState(ST.DEAD);
    this.mesh.rotation.z = Math.PI / 2.1;
    this.onDeath?.();
  }

  registerKill() { this.kills++; }

  heal(amount) { this.health = Math.min(100, this.health + amount); }
}
