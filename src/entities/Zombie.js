import * as THREE from 'three';
import { GRAVITY } from '../physics/PhysicsWorld.js';
import { BlobShadow } from './BlobShadow.js';
import { ZOMBIE_TYPES } from '../gameplay/ZombieTypes.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));
const rand = (a, b) => a + Math.random() * (b - a);

export const ZS = {
  IDLE: 'idle', WANDER: 'wander', ALERT: 'alert', CHASE: 'chase',
  ATTACK: 'attack', DASH: 'dash', STAGGER: 'stagger', DEAD: 'dead',
};

const STAGGER_TIME = 0.5;

/**
 * One class, five behaviours, driven entirely by the archetype table. The
 * alternative — a subclass per enemy — meant five copies of the steering and
 * collision code drifting apart.
 */
export class Zombie {
  constructor({ scene, physics, nav, character, blobTexture, position, audio, typeId = 'shambler' }) {
    const type = ZOMBIE_TYPES[typeId] || ZOMBIE_TYPES.shambler;
    this.type = type;
    this.typeId = type.id;

    this.physics = physics;
    this.nav = nav || null;
    this.audio = audio;
    this.scene = scene;

    this.pos = new THREE.Vector3(position[0], position[1] + type.capsule.halfHeight + type.capsule.radius + 0.1, position[2]);
    this.vel = new THREE.Vector3();
    this.body = physics.createCharacter(this.pos, type.capsule.radius, type.capsule.halfHeight);
    this.feetOffset = this.body.height;

    this.character = character;
    this.mesh = character.root;
    this.mesh.scale.setScalar(rand(type.scaleRange[0], type.scaleRange[1]));
    scene.add(this.mesh);
    this.blob = new BlobShadow(scene, physics, blobTexture, this.body.collider,
      1.5 * this.mesh.scale.x);

    this.maxHp = type.hp;
    this.hp = type.hp;
    this.speed = rand(type.speedRange[0], type.speedRange[1]);
    this.headHeight = type.headHeight;

    this.state = ZS.WANDER;
    this.stateT = 0;
    this.attackCd = 0;
    this.dashCd = rand(0, type.dash ? type.dash.cooldown : 0);
    this.turnRate = 0;
    this.deadT = 0;
    this.tilt = 0;
    this.grounded = false;
    this.wanderTimer = rand(0, 3);
    this.wanderDir = new THREE.Vector3(rand(-1, 1), 0, rand(-1, 1)).normalize();
    this.knock = new THREE.Vector3();
    this.dashDir = new THREE.Vector3();
    this.soakT = 0;
    this.soakFactor = 1;

    // Path state. repathTimer starts randomised so twenty zombies spawned on
    // the same frame don't all ask for a path on the same frame forever.
    this.path = null;
    this.pathIndex = 0;
    this.repathTimer = rand(0, 0.6);
    this.pathTarget = new THREE.Vector3();

    this._to = new THREE.Vector3();
    this._wp = new THREE.Vector3();
    this._desired = new THREE.Vector3();
    this._moved = new THREE.Vector3();
  }

  get dead() { return this.state === ZS.DEAD; }
  get expired() { return this.dead && this.deadT > this.type.corpseLinger; }

  update(dt, player, peers) {
    const type = this.type;
    this.stateT += dt;
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);

    if (this.soakT > 0) {
      this.soakT -= dt;
      if (this.soakT <= 0) this.soakFactor = 1;
    }

    if (this.state === ZS.DEAD) return this._updateDead(dt);

    this._to.copy(player.pos).sub(this.pos);
    const distY = Math.abs(this._to.y);
    this._to.y = 0;
    const dist = this._to.length();
    const sameFloor = distY < 2.7 + type.capsule.halfHeight;
    const aggro = type.aggroRange + player.heat * 0.2;

    this._think(dt, player, dist, sameFloor, aggro);
    this._navigate(dt, player, dist);

    const steer = this._steer(dt, peers, dist);
    this._move(dt, steer);
    this._present(dt, steer, player, dist);
  }

  // ── behaviour ────────────────────────────────────────────────────────────
  _think(dt, player, dist, sameFloor, aggro) {
    const type = this.type;

    if (this.state === ZS.STAGGER) {
      if (this.stateT > STAGGER_TIME) this._enter(ZS.CHASE);
      return;
    }
    if (this.state === ZS.DASH) {
      const d = type.dash;
      if (this.stateT > d.windUp + d.duration) this._enter(ZS.CHASE);
      return;
    }
    if (this.state === ZS.ATTACK) {
      if (this.stateT > type.attack.time) this._enter(ZS.CHASE);
      return;
    }

    if (player.alive && sameFloor && dist < aggro) {
      if (this.state === ZS.WANDER || this.state === ZS.IDLE) {
        this._enter(ZS.ALERT);
        this.audio.sfx('notice', { pitch: 1 / this.mesh.scale.x });
      }
      if (this.state === ZS.ALERT && this.stateT > type.alertTime) this._enter(ZS.CHASE);

      if (this.state === ZS.CHASE) {
        if (dist < type.attack.trigger && this.attackCd <= 0) {
          this._enter(ZS.ATTACK);
          this.attackCd = type.attack.cooldown;
        } else if (type.dash && this.dashCd <= 0
                   && dist > type.dash.minRange && dist < type.dash.maxRange) {
          this._enter(ZS.DASH);
          this.dashCd = type.dash.cooldown;
          this.dashDir.copy(this._to).normalize();
          this.path = null;
          this.audio.sfx('dashTell');
        }
      }
    } else if (dist > aggro + 7) {
      this.state = ZS.WANDER;
    }
  }

  /**
   * Recast gives a corridor; we still steer along it with the same separation
   * and collision code, so crowding and knockback behave as before. Direct
   * steering stays the fallback for short range, for a failed query, and for
   * builds where recast isn't installed at all.
   */
  _navigate(dt, player, dist) {
    if (!this.nav || this.state !== ZS.CHASE) { this.path = null; return; }

    // Inside a couple of metres the path is noise — go straight at them.
    if (dist < 2.5) { this.path = null; return; }

    this.repathTimer -= dt;
    const drifted = this.pathTarget.distanceToSquared(player.pos) > 4;

    if ((this.repathTimer <= 0 || drifted || !this.path) && this.nav.canPath()) {
      this.repathTimer = 0.45 + Math.random() * 0.35;
      this.pathTarget.copy(player.pos);
      const found = this.nav.findPath(this.type.navProfile, this.pos, player.pos);
      if (found && found.length > 1) {
        this.path = found;
        this.pathIndex = 1;      // [0] is where we already are
      } else if (found) {
        this.path = null;
      }
    }

    if (!this.path) return;

    // Advance past waypoints we've reached, ignoring height so a zombie on
    // the stairs doesn't stall below a corner.
    while (this.pathIndex < this.path.length) {
      const wp = this.path[this.pathIndex];
      const dx = wp.x - this.pos.x, dz = wp.z - this.pos.z;
      if (dx * dx + dz * dz > 0.55 * 0.55) break;
      this.pathIndex++;
    }
    if (this.pathIndex >= this.path.length) this.path = null;
  }

  _steer(dt, peers, dist) {
    const type = this.type;
    let dx = 0, dz = 0, speed = 0;

    switch (this.state) {
      case ZS.CHASE: {
        if (this.path && this.pathIndex < this.path.length) {
          const wp = this.path[this.pathIndex];
          this._wp.set(wp.x - this.pos.x, 0, wp.z - this.pos.z);
          const len = this._wp.length() || 1;
          dx = this._wp.x / len; dz = this._wp.z / len;
        } else {
          this._to.normalize();
          dx = this._to.x; dz = this._to.z;
        }
        speed = this.speed * this.soakFactor;
        break;
      }
      case ZS.ATTACK:
        this._to.normalize();
        dx = this._to.x; dz = this._to.z;
        speed = 0.8 * this.soakFactor;
        break;
      case ZS.DASH: {
        const d = type.dash;
        // Committed: the direction is locked at wind-up, so it can be dodged.
        dx = this.dashDir.x; dz = this.dashDir.z;
        speed = this.stateT < d.windUp ? 0 : d.speed * this.soakFactor;
        break;
      }
      case ZS.WANDER:
        this.wanderTimer -= dt;
        if (this.wanderTimer <= 0) {
          this.wanderTimer = rand(1.6, 4.2);
          this.wanderDir.set(rand(-1, 1), 0, rand(-1, 1)).normalize();
        }
        dx = this.wanderDir.x; dz = this.wanderDir.z;
        speed = 1.0 * this.soakFactor;
        break;
    }

    if (this.state !== ZS.DASH) {
      // `separation` is a distance in metres; the comparison is against a
      // squared distance. It was reading 1.5 as 1.22m, which for a strongman
      // (0.48m radius) meant almost no personal space at all.
      const sep = type.separation * type.separation;
      for (const o of peers) {
        if (o === this || o.dead) continue;
        const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z;
        const d2 = ox * ox + oz * oz;
        if (d2 < sep && d2 > 1e-5) {
          const inv = 1 / Math.sqrt(d2);
          dx += ox * inv * 0.85;
          dz += oz * inv * 0.85;
        }
      }
    }

    const len = Math.hypot(dx, dz) || 1;
    return { x: dx / len, z: dz / len, speed };
  }

  _move(dt, steer) {
    this.knock.multiplyScalar(Math.exp(-7 * dt));
    this.vel.y = Math.max(-38, this.vel.y + GRAVITY * dt);

    this._desired.set(
      (steer.x * steer.speed + this.knock.x) * dt,
      this.vel.y * dt,
      (steer.z * steer.speed + this.knock.z) * dt,
    );
    const r = this.physics.moveCharacter(this.body, this._desired, this._moved);
    this.pos.add(r.movement);
    this.grounded = r.grounded;
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    this.physics.setCharacterPosition(this.body, this.pos);

    const travelled = Math.hypot(r.movement.x, r.movement.z);
    if (this.state === ZS.WANDER && travelled < steer.speed * dt * 0.4) {
      this.wanderDir.set(rand(-1, 1), 0, rand(-1, 1)).normalize();
    }
    // A dash into a wall ends the dash rather than grinding along it.
    if (this.state === ZS.DASH && this.stateT > this.type.dash.windUp
        && travelled < steer.speed * dt * 0.3) {
      this._enter(ZS.STAGGER);
    }
    if (this.pos.y < -14) {
      this.pos.set(rand(-10, 10), 1.2, rand(14, 26));
      this.physics.warpCharacter(this.body, this.pos);
    }
  }

  _present(dt, steer, player, dist) {
    const type = this.type;
    this.mesh.position.copy(this.pos);
    this.mesh.position.y -= this.feetOffset - (type.meshYOffset || 0);

    const prevY = this.mesh.rotation.y;
    if (steer.speed > 0.1 || this.state === ZS.ATTACK || this.state === ZS.DASH) {
      const target = Math.atan2(steer.x, steer.z);
      let d = target - this.mesh.rotation.y;
      while (d > Math.PI) d -= TAU;
      while (d < -Math.PI) d += TAU;
      const rate = this.state === ZS.CHASE ? type.chaseTurnRate : type.chaseTurnRate * 0.55;
      this.mesh.rotation.y += d * Math.min(1, dt * rate);
    }
    let ry = this.mesh.rotation.y - prevY;
    while (ry > Math.PI) ry -= TAU;
    while (ry < -Math.PI) ry += TAU;
    this.turnRate = damp(this.turnRate, clamp((ry / Math.max(dt, 1e-4)) * 0.14, -1, 1), 8, dt);

    this.character.anim.syncToState(this._animState(), {
      speed: steer.speed,
      turn: this.turnRate,
      grounded: this.grounded,
      stateT: this.stateT,
    }, dt);

    if (this.state === ZS.ATTACK) {
      const a = type.attack;
      const t = this.stateT / a.time;
      if (t > a.hitStart / a.time && t < a.hitEnd / a.time && dist < a.range) {
        player.hurt(a.damage);
      }
    }
    // A dashing tumbler hurts on contact — that's the whole threat.
    if (this.state === ZS.DASH && this.stateT > type.dash.windUp && dist < 1.4) {
      player.hurt(Math.round(type.attack.damage * 0.8));
      this._enter(ZS.STAGGER);
    }

    this.blob.update(this.pos, this.feetOffset);
  }

  /** Dash has no clip of its own; it reads as a fast chase. */
  _animState() {
    return this.state === ZS.DASH ? ZS.CHASE : this.state;
  }

  _updateDead(dt) {
    this.deadT += dt;
    this.tilt = Math.min(Math.PI / 2, this.tilt + dt * 4.2);
    this.mesh.rotation.z = this.tilt;
    this.blob.fade(dt * 0.22);
    this.mesh.position.copy(this.pos);
    this.mesh.position.y -= this.feetOffset;
    this.character.anim.syncToState('dead', { speed: 0, stateT: this.stateT }, dt);
  }

  _enter(state) { this.state = state; this.stateT = 0; }

  /**
   * @param {object} [opts] {knockback, stagger}
   * @returns {boolean} true if this hit killed it
   *
   * staggerThreshold is what gives the strongman its identity: chip damage
   * doesn't interrupt him, so you have to commit to a weapon that lands
   * enough in one hit rather than plinking.
   */
  damage(amount, fromX, fromZ, opts = {}) {
    if (this.dead) return false;
    this.hp -= amount;

    const force = (opts.knockback ?? 5.5) * (1 - this.type.knockbackResist);
    if (force > 0) {
      const kx = this.pos.x - fromX, kz = this.pos.z - fromZ;
      const kl = Math.hypot(kx, kz) || 1;
      this.knock.set((kx / kl) * force, 0, (kz / kl) * force);
    }

    if (this.hp <= 0) {
      this._enter(ZS.DEAD);
      return true;
    }
    if (opts.stagger !== false && amount >= this.type.staggerThreshold) {
      this._enter(ZS.STAGGER);
    }
    return false;
  }

  soak(factor, duration) {
    const resisted = lerp(factor, 1, this.type.soakResist);
    this.soakFactor = Math.min(this.soakFactor, resisted);
    this.soakT = Math.max(this.soakT, duration * (1 - this.type.soakResist));
  }

  dispose() {
    this.scene.remove(this.mesh);
    this.blob.dispose();
    this.physics.removeCharacter(this.body);
  }
}
