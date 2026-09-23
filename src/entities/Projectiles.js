import * as THREE from 'three';
import { GRAVITY } from '../physics/PhysicsWorld.js';
import { AMMO_PICKUPS } from '../gameplay/Weapons.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const GEO = {
  disc: new THREE.CylinderGeometry(0.2, 0.16, 0.11, 14),
  // `new THREE.CapsuleGeometry ? …` was not a feature detect — it *called*
  // the constructor, so a missing CapsuleGeometry threw at module load
  // instead of falling back. Test the reference, not a construction of it.
  club: THREE.CapsuleGeometry
    ? new THREE.CapsuleGeometry(0.055, 0.3, 4, 8)
    : new THREE.CylinderGeometry(0.06, 0.09, 0.4, 8),
  flake: new THREE.BoxGeometry(0.09, 0.02, 0.13),
  debris: new THREE.SphereGeometry(0.5, 8, 6),
  droplet: new THREE.SphereGeometry(0.5, 6, 5),
  pickup: new THREE.BoxGeometry(0.4, 0.4, 0.4),
};

/**
 * Reuses meshes instead of allocating per shot. The confetti cannon fires
 * fourteen at once and the seltzer bottle emits three per fixed step — at
 * those rates `new Mesh()` shows up as GC stutter within a few seconds.
 */
class MeshPool {
  constructor(scene, build) {
    this.scene = scene;
    this.build = build;
    this.free = [];
  }

  acquire() {
    const mesh = this.free.pop() || this.build();
    mesh.visible = true;
    mesh.scale.setScalar(1);
    this.scene.add(mesh);
    return mesh;
  }

  release(mesh) {
    this.scene.remove(mesh);
    this.free.push(mesh);
  }
}

export class Projectiles {
  constructor({ scene, physics, audio }) {
    this.scene = scene;
    this.physics = physics;
    this.audio = audio;

    this.live = [];
    this.bursts = [];
    this.droplets = [];
    this.pickups = [];

    this.materials = {};
    this.pools = {};

    this._dir = new THREE.Vector3();
    this._to = new THREE.Vector3();
    this._sprayAccum = 0;

    this.debrisMat = new THREE.MeshStandardMaterial({ roughness: 0.7, transparent: true });
    this.dropletMat = new THREE.MeshStandardMaterial({
      color: 0xbfe4f2, roughness: 0.15, metalness: 0.1,
      transparent: true, opacity: 0.85, emissive: 0x2a5566, emissiveIntensity: 0.4,
    });
    this.dropletPool = new MeshPool(scene, () => new THREE.Mesh(GEO.droplet, this.dropletMat));
  }

  _material(shape, color, emissive) {
    const key = `${shape}:${color}`;
    if (!this.materials[key]) {
      this.materials[key] = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.5,
        emissive: emissive ?? 0x000000,
        emissiveIntensity: emissive ? 0.5 : 0,
      });
    }
    return this.materials[key];
  }

  _pool(shape, color, emissive) {
    const key = `${shape}:${color}`;
    if (!this.pools[key]) {
      const geo = GEO[shape] || GEO.disc;
      const mat = this._material(shape, color, emissive);
      this.pools[key] = new MeshPool(this.scene, () => {
        const m = new THREE.Mesh(geo, mat);
        m.castShadow = true;
        return m;
      });
    }
    return this.pools[key];
  }

  /**
   * @param {object} spec {weapon, origin, direction, speed, returning, owner,
   *                       onCatch, colorIndex}
   */
  spawn(spec) {
    const w = spec.weapon;
    const v = w.visual;
    const color = v.colors
      ? v.colors[(spec.colorIndex ?? 0) % v.colors.length]
      : v.color;

    const pool = this._pool(v.shape, color, v.emissive);
    const mesh = pool.acquire();
    mesh.position.copy(spec.origin).addScaledVector(spec.direction, 0.75);
    mesh.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));

    this.live.push({
      mesh,
      poolKey: `${v.shape}:${color}`,
      vel: spec.direction.clone().multiplyScalar(spec.speed),
      spin: rand(-9, 9),
      age: 0,
      life: w.life,
      gravityScale: w.gravityScale,
      damage: w.damage,
      headshotMult: w.headshotMult,
      knockback: w.knockback,
      radius: w.radius,
      splat: w.splat,
      returning: spec.returning ? { after: w.returnAfter, speed: w.returnSpeed, catch: w.catchRadius } : null,
      // Only returning throws can hit twice, so only they need the ledger.
      // The cannon fires 14 at once; a Set each undoes the pooling.
      phase: 'out',
      owner: spec.owner || null,
      onCatch: spec.onCatch || null,
      hits: spec.returning ? new Set() : null,
    });
  }

  /** Visual spray for the stream weapon. Damage is handled in WeaponSystem. */
  spray(origin, direction, w, dt) {
    this._sprayAccum += w.spray.perStep;
    while (this._sprayAccum >= 1) {
      this._sprayAccum -= 1;
      const mesh = this.dropletPool.acquire();
      mesh.position.copy(origin).addScaledVector(direction, 0.5);
      mesh.scale.setScalar(rand(w.spray.size * 0.6, w.spray.size * 1.5) * 2);
      const vel = direction.clone()
        .add(new THREE.Vector3(
          rand(-w.spray.spread, w.spray.spread),
          rand(-w.spray.spread, w.spray.spread),
          rand(-w.spray.spread, w.spray.spread),
        ))
        .normalize()
        .multiplyScalar(w.spray.speed * rand(0.7, 1.2));
      this.droplets.push({ mesh, vel, life: w.spray.life, max: w.spray.life });
    }
  }

  burst(position, color, count, speed, size, life) {
    const mat = this.debrisMat.clone();
    mat.color = new THREE.Color(color);
    const group = new THREE.Group();
    for (let i = 0; i < count; i++) {
      const piece = new THREE.Mesh(GEO.debris, mat);
      piece.scale.setScalar(rand(size * 0.6, size * 1.4));
      piece.userData.v = new THREE.Vector3(rand(-1, 1), rand(0.1, 1), rand(-1, 1))
        .normalize().multiplyScalar(rand(speed * 0.4, speed));
      group.add(piece);
    }
    group.position.copy(position);
    this.scene.add(group);
    this.bursts.push({ group, mat, life, max: life });
  }

  splat(position, spec) {
    const s = spec || { color: 0xf6f0dc, count: 9, speed: 4.2, size: 0.09, life: 1.1 };
    this.burst(position, s.color, s.count, s.speed, s.size, s.life);
  }

  confetti(position) {
    this.burst(position, 0x8fae6b, 10, 4.0, 0.1, 1.4);
    for (const c of [0xe8b21c, 0xc8102e, 0x2f7fc4, 0x7a4fa8]) {
      this.burst(position, c, 6, 6.5, 0.07, 2.0);
    }
    this.audio.sfx('confetti');
  }

  addPickup(x, y, z, kind) {
    const isHealth = kind === 'health';
    const tint = { pie: 0xf6f0dc, seltzer: 0xbfe4f2, clubs: 0xe8b21c, confetti: 0x7a4fa8, health: 0xc8102e }[kind];
    const mesh = new THREE.Mesh(GEO.pickup, new THREE.MeshStandardMaterial({
      color: tint, emissive: tint, emissiveIntensity: isHealth ? 1.1 : 0.8, roughness: 0.4,
    }));
    mesh.position.set(x, y + 0.6, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.pickups.push({ mesh, kind, base: y + 0.6, seed: rand(0, 6) });
  }

  update(dt, elapsed, player, zombies, onKill) {
    this._updateProjectiles(dt, player, zombies, onKill);
    this._updateDroplets(dt);
    this._updateBursts(dt);
    this._updatePickups(dt, elapsed, player);
  }

  _updateProjectiles(dt, player, zombies, onKill) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;

      // Returning throw: outbound, then home back to the thrower.
      if (p.returning && p.phase === 'out' && p.age > p.returning.after) {
        p.phase = 'back';
        p.hits?.clear();          // it can hit the same target on the way home
      }

      if (p.phase === 'back' && p.owner) {
        this._to.copy(p.owner.pos).sub(p.mesh.position);
        this._to.y += 0.6;
        const dist = this._to.length();
        if (dist < p.returning.catch) {
          p.onCatch?.();
          this._retire(i, p);
          continue;
        }
        this._to.divideScalar(dist);
        p.vel.lerp(this._to.multiplyScalar(p.returning.speed), Math.min(1, dt * 9));
      } else {
        p.vel.y += GRAVITY * p.gravityScale * dt;
      }

      const step = p.vel.length() * dt;
      this._dir.copy(p.vel).normalize();

      let consumed = false;

      for (const z of zombies) {
        if (z.dead || p.hits?.has(z)) continue;
        const m = p.mesh.position;
        const ax = m.x - z.pos.x, ay = m.y - z.pos.y, az = m.z - z.pos.z;
        if (ax * ax + ay * ay * 0.7 + az * az > p.radius) continue;

        // Head height varies by archetype — a tot is nearly impossible to
        // headshot, a stiltwalker demands you aim well above the crosshair.
        const headshot = ay > (z.headHeight ?? 0.55) && p.headshotMult > 1;
        const dmg = headshot ? p.damage * p.headshotMult : p.damage;
        const killed = z.damage(dmg, m.x, m.z, { knockback: p.knockback });
        this.splat(m, p.splat);
        this.audio.sfx(headshot ? 'headshot' : 'hitFlesh');
        onKill?.(killed ? z : null, headshot);
        if (killed) this.confetti(z.pos);

        p.hits?.add(z);
        // Clubs punch through and keep going; everything else stops here.
        if (!p.returning) { consumed = true; }
        break;
      }

      if (!consumed && p.phase === 'out') {
        const wall = this.physics.raycast(p.mesh.position, this._dir, step + 0.12);
        if (wall) {
          p.mesh.position.copy(wall.point);
          this.splat(wall.point, p.splat);
          // Clubs bounce off geometry rather than dying on it.
          if (p.returning) { p.phase = 'back'; p.hits?.clear(); }
          else consumed = true;
        }
      }

      if (!consumed) {
        p.mesh.position.addScaledVector(p.vel, dt);
        p.mesh.rotation.x += p.spin * dt;
        p.mesh.rotation.z += p.spin * 0.5 * dt;
      }

      if (consumed || p.age > p.life) this._retire(i, p);
    }
  }

  _retire(index, p) {
    this._pool(p.poolKey.split(':')[0], Number(p.poolKey.split(':')[1])).release(p.mesh);
    this.live.splice(index, 1);
  }

  _updateDroplets(dt) {
    for (let i = this.droplets.length - 1; i >= 0; i--) {
      const d = this.droplets[i];
      d.vel.y += GRAVITY * 0.7 * dt;
      d.mesh.position.addScaledVector(d.vel, dt);
      d.life -= dt;
      if (d.life <= 0) {
        this.dropletPool.release(d.mesh);
        this.droplets.splice(i, 1);
      }
    }
  }

  _updateBursts(dt) {
    for (let i = this.bursts.length - 1; i >= 0; i--) {
      const b = this.bursts[i];
      b.life -= dt;
      b.mat.opacity = clamp(b.life / b.max, 0, 1);
      for (const piece of b.group.children) {
        piece.userData.v.y += GRAVITY * dt;
        piece.position.addScaledVector(piece.userData.v, dt);
        piece.rotation.x += dt * 4;
      }
      if (b.life <= 0) {
        this.scene.remove(b.group);
        b.mat.dispose();
        this.bursts.splice(i, 1);
      }
    }
  }

  _updatePickups(dt, elapsed, player) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const k = this.pickups[i];
      k.mesh.rotation.y += dt * 1.9;
      k.mesh.position.y = k.base + Math.sin(elapsed * 2 + k.seed) * 0.12;
      if (k.mesh.position.distanceTo(player.pos) > 1.3) continue;

      if (k.kind === 'health') {
        player.heal(30);
        this.onPickup?.('+30 greasepaint');
      } else {
        const def = AMMO_PICKUPS[k.kind];
        if (def) {
          player.weapons.give(def.weapon, def.amount);
          this.onPickup?.(def.label);
        }
      }
      this.audio.sfx('pickup');
      this.scene.remove(k.mesh);
      this.pickups.splice(i, 1);
    }
  }
}
