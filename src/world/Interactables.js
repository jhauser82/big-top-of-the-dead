import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * Hold-to-use objects. Hold rather than tap because it's the cheapest way to
 * make an objective cost something: standing still for two seconds in a
 * house full of clowns is a real decision.
 */
export class Interactable {
  constructor({ scene, position, label, holdTime = 2, radius = 2.2, tint = 0xe8b21c, onComplete }) {
    this.position = new THREE.Vector3(...position);
    this.label = label;
    this.holdTime = holdTime;
    this.radius = radius;
    this.onComplete = onComplete;
    this.progress = 0;
    this.done = false;
    this.scene = scene;

    const group = new THREE.Group();
    group.position.copy(this.position);

    this.body = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.8, 0.3),
      new THREE.MeshStandardMaterial({ color: 0x241d2a, roughness: 0.7, metalness: 0.3 }),
    );
    this.body.position.y = 0.4;
    this.body.castShadow = true;
    group.add(this.body);

    this.lamp = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 12, 8),
      new THREE.MeshStandardMaterial({ color: tint, emissive: tint, emissiveIntensity: 2 }),
    );
    this.lamp.position.y = 0.86;
    group.add(this.lamp);

    this.light = new THREE.PointLight(tint, 3, 6, 2);
    this.light.position.y = 0.9;
    group.add(this.light);

    this.beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 8, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: tint, transparent: true, opacity: 0.075,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending,
      }),
    );
    this.beacon.position.y = 4;
    group.add(this.beacon);

    this.group = group;
    scene.add(group);
  }

  distanceTo(point) { return this.position.distanceTo(point); }

  /** @returns {number} 0..1 progress this frame, or -1 if out of range */
  tick(dt, player, held) {
    if (this.done) return -1;

    const pulse = 1.6 + Math.sin(performance.now() * 0.004) * 0.7;
    this.lamp.material.emissiveIntensity = pulse;
    this.light.intensity = 2 + pulse;

    if (this.distanceTo(player.pos) > this.radius) {
      this.progress = Math.max(0, this.progress - dt * 0.8);
      return -1;
    }

    if (held) this.progress = clamp(this.progress + dt / this.holdTime, 0, 1);
    else this.progress = Math.max(0, this.progress - dt * 0.6);

    if (this.progress >= 1) this.complete();
    return this.progress;
  }

  complete() {
    this.done = true;
    this.progress = 1;
    this.lamp.material.color.setHex(0x8fae6b);
    this.lamp.material.emissive.setHex(0x8fae6b);
    this.light.color.setHex(0x8fae6b);
    this.light.intensity = 2;
    this.beacon.visible = false;
    this.onComplete?.(this);
  }

  dispose() { this.scene.remove(this.group); }
}

/**
 * Tracks whichever interactable the player is nearest and reports a single
 * prompt to the HUD — avoids two overlapping prompts fighting each other.
 */
export class InteractionSystem {
  constructor() { this.items = []; }

  add(item) { this.items.push(item); return item; }

  clear() {
    for (const item of this.items) item.dispose();
    this.items.length = 0;
  }

  remove(item) {
    const i = this.items.indexOf(item);
    if (i >= 0) { this.items.splice(i, 1); item.dispose(); }
  }

  update(dt, player, held) {
    let nearest = null;
    let nearestDist = Infinity;

    for (const item of this.items) {
      const d = item.distanceTo(player.pos);
      if (!item.done && d < item.radius && d < nearestDist) {
        nearest = item; nearestDist = d;
      }
    }

    for (const item of this.items) {
      item.tick(dt, player, held && item === nearest);
    }

    return nearest
      ? { label: nearest.label, progress: nearest.progress }
      : null;
  }
}
