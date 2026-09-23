import * as THREE from 'three';
import { WEAPONS, WEAPON_ORDER } from './Weapons.js';
import { ST } from '../entities/Player.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Owns ammo, selection, cooldowns, and the firing verbs. Player delegates
 * here rather than knowing about weapons, so adding a fifth is a table entry
 * plus a case in fire().
 */
export class WeaponSystem {
  constructor({ projectiles, audio, camera, hud }) {
    this.projectiles = projectiles;
    this.audio = audio;
    this.camera = camera;
    this.hud = hud;

    this.order = [...WEAPON_ORDER];
    this.index = 0;
    this.cooldown = 0;
    this.streamIdle = 0;
    this.wasStreaming = false;

    this.ammo = {};
    for (const id of this.order) this.ammo[id] = WEAPONS[id].ammoStart;

    this._dir = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this._origin = new THREE.Vector3();
  }

  get weapon() { return WEAPONS[this.order[this.index]]; }
  get ammoLeft() { return this.ammo[this.weapon.id]; }

  select(slot) {
    const i = clamp(slot, 0, this.order.length - 1);
    if (i === this.index) return;
    this.index = i;
    this.cooldown = Math.max(this.cooldown, 0.18); // small swap penalty
    this.audio.sfx('swap', { slot: i });
    this.hud?.toast(this.weapon.name);
  }

  cycle(delta) {
    const n = this.order.length;
    this.select((this.index + delta + n) % n);
  }

  give(weaponId, amount) {
    const w = WEAPONS[weaponId];
    if (!w) return;
    this.ammo[weaponId] = Math.min(w.ammoMax, this.ammo[weaponId] + amount);
  }

  /** Aim direction from the camera, with per-weapon spread applied. */
  aimDirection(aiming, spreadOverride) {
    const { yaw, pitch } = this.camera;
    const w = this.weapon;
    const spread = spreadOverride !== undefined
      ? spreadOverride
      : (aiming ? w.aimSpread : w.spread) || 0;
    const j = () => (Math.random() * 2 - 1) * spread;
    return this._dir.set(
      -Math.sin(yaw) * Math.cos(pitch) + j(),
      Math.sin(pitch) + j(),
      -Math.cos(yaw) * Math.cos(pitch) + j(),
    ).normalize();
  }

  update(dt, player, zombies) {
    this.cooldown = Math.max(0, this.cooldown - dt);
    const w = this.weapon;

    const streaming = w.kind === 'stream'
      && player.input.fireHeld
      && player.alive
      && player.state !== ST.ROLL
      && this.ammo[w.id] > 0;

    if (streaming) {
      this.streamIdle = 0;
      this._fireStream(dt, player, zombies, w);
    } else {
      this.streamIdle += dt;
      // Every non-stream weapon still regenerates the seltzer tank slowly.
      for (const id of this.order) {
        const def = WEAPONS[id];
        if (!def.regenPerSecond) continue;
        const idle = id === w.id ? this.streamIdle : Infinity;
        if (idle > def.regenDelay) {
          this.ammo[id] = Math.min(def.ammoMax, this.ammo[id] + def.regenPerSecond * dt);
        }
      }
    }

    player.streaming = streaming;
    this.wasStreaming = streaming;
  }

  /** Discrete fire. Returns true if a shot went out. */
  fire(player) {
    const w = this.weapon;
    if (w.kind === 'stream') return false;
    if (this.cooldown > 0 || !player.alive || player.state === ST.ROLL) return false;
    if (this.ammo[w.id] < w.ammoPerShot) {
      this.audio.sfx('empty');
      return false;
    }

    this.ammo[w.id] -= w.ammoPerShot;
    this.cooldown = w.cooldown;

    this._origin.copy(player.pos);
    this._origin.y += 0.55;

    switch (w.kind) {
      case 'projectile': this._fireSingle(player, w); break;
      case 'returning': this._fireFan(player, w); break;
      case 'spread': this._fireSpread(player, w); break;
    }

    this.camera.addTrauma(w.trauma);
    this.audio.sfx(w.id === 'confetti' ? 'cannon' : w.id);
    return true;
  }

  _fireSingle(player, w) {
    const dir = this.aimDirection(player.aiming).clone();
    this.projectiles.spawn({
      weapon: w,
      origin: this._origin,
      direction: dir,
      speed: player.aiming ? w.aimSpeed : w.speed,
    });
  }

  /** Three clubs in a horizontal fan, each of which comes back. */
  _fireFan(player, w) {
    const half = (w.count - 1) / 2;
    for (let i = 0; i < w.count; i++) {
      const offset = ((i - half) * w.fanDegrees * Math.PI) / 180;
      const dir = this.aimDirection(player.aiming).clone();
      dir.applyAxisAngle(UP, offset).normalize();
      this.projectiles.spawn({
        weapon: w,
        origin: this._origin,
        direction: dir,
        speed: player.aiming ? w.aimSpeed : w.speed,
        returning: true,
        owner: player,
        onCatch: () => {
          this.give(w.id, 1);
          this.audio.sfx('catch');
        },
      });
    }
  }

  _fireSpread(player, w) {
    for (let i = 0; i < w.count; i++) {
      const dir = this.aimDirection(player.aiming).clone();
      this.projectiles.spawn({
        weapon: w,
        origin: this._origin,
        direction: dir,
        speed: (player.aiming ? w.aimSpeed : w.speed) * (0.75 + Math.random() * 0.5),
        colorIndex: i,
      });
    }
  }

  /**
   * Continuous cone. No projectiles — a dot-product test against every live
   * zombie, which at this entity count is cheaper than spawning geometry and
   * far easier to tune.
   */
  _fireStream(dt, player, zombies, w) {
    this.ammo[w.id] = Math.max(0, this.ammo[w.id] - w.drainPerSecond * dt);

    this._origin.copy(player.pos);
    this._origin.y += 0.55;
    const dir = this.aimDirection(false, 0);

    this.projectiles.spray(this._origin, dir, w, dt);
    this.camera.addTrauma(w.trauma);

    if (Math.random() < dt * 26) this.audio.sfx('seltzer');

    const cosLimit = Math.cos((w.coneDegrees * Math.PI) / 180);
    for (const z of zombies) {
      if (z.dead) continue;
      this._to.copy(z.pos).sub(this._origin);
      const dist = this._to.length();
      if (dist > w.range || dist < 0.01) continue;
      this._to.divideScalar(dist);
      if (this._to.dot(dir) < cosLimit) continue;

      const falloff = 1 - (dist / w.range) * 0.6;
      // `knock` is a velocity in units/sec, not an impulse, and damage()
      // overwrites it rather than accumulating. Scaling by dt made the shove
      // ~0.9 u/s against a 2.9 u/s chase — the weapon's whole stated identity
      // silently didn't work. Damage is per-second and scales with dt; the
      // push is a sustained velocity and must not.
      const killed = z.damage(w.dps * dt * falloff, this._origin.x, this._origin.z, {
        stagger: false,
        knockback: w.knockback * falloff,
      });
      z.soak(w.slowFactor, w.slowDuration);
      if (killed) this.onKill?.(z, false);
    }
  }
}

const UP = new THREE.Vector3(0, 1, 0);
