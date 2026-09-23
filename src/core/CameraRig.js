import * as THREE from 'three';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, l, dt) => lerp(a, b, 1 - Math.exp(-l * dt));

/**
 * Third-person spring arm. Occlusion uses a physics raycast rather than a
 * three.js Raycaster, so it respects the same colliders the player does and
 * costs nothing to walk the scene graph.
 */
export class CameraRig {
  constructor(camera, physics) {
    this.camera = camera;
    this.physics = physics;
    this.yaw = 0;
    this.pitch = -0.1;
    this.dist = 5.4;
    this.fov = 62;
    this.trauma = 0;

    this.anchor = new THREE.Vector3();
    this.dir = new THREE.Vector3();
    this.want = new THREE.Vector3();
    this.shake = new THREE.Vector3();
  }

  look(dx, dy, aiming) {
    const k = aiming ? 0.5 : 1;
    this.yaw -= dx * k;
    this.pitch = clamp(this.pitch - dy * k, -1.05, 0.8);
  }

  addTrauma(a) { this.trauma = Math.min(1, this.trauma + a); }

  /** Forward and right vectors on the ground plane, for camera-relative input. */
  basis(outFwd, outRight) {
    outFwd.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    outRight.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  update(dt, target, velocity, aimBlend, maxSpeed) {
    const aim = aimBlend;

    this.anchor.copy(target);
    this.anchor.y += lerp(1.25, 1.45, aim);
    this.anchor.x += Math.cos(this.yaw) * 0.55 * aim;
    this.anchor.z += -Math.sin(this.yaw) * 0.55 * aim;
    this.anchor.x += clamp(velocity.x, -6, 6) * 0.045 * (1 - aim);
    this.anchor.z += clamp(velocity.z, -6, 6) * 0.045 * (1 - aim);

    this.dir.set(
      Math.sin(this.yaw) * Math.cos(this.pitch),
      -Math.sin(this.pitch),
      Math.cos(this.yaw) * Math.cos(this.pitch),
    );

    let want = lerp(5.4, 2.4, aim);
    const hit = this.physics.raycast(this.anchor, this.dir, want + 0.5);
    if (hit) want = Math.max(1.0, hit.distance - 0.35);
    this.dist = damp(this.dist, want, 14, dt);

    this.want.copy(this.anchor).addScaledVector(this.dir, this.dist);
    this.camera.position.lerp(this.want, 1 - Math.exp(-22 * dt));

    this.trauma = Math.max(0, this.trauma - dt * 2.6);
    if (this.trauma > 0.001) {
      const t = performance.now() * 0.05;
      this.shake
        .set(Math.sin(t * 1.7), Math.sin(t * 2.3), Math.sin(t * 1.1))
        .multiplyScalar(this.trauma * 0.18);
      this.camera.position.add(this.shake);
    }

    this.camera.lookAt(this.anchor.x, this.anchor.y - 0.08, this.anchor.z);

    const speedK = clamp(Math.hypot(velocity.x, velocity.z) / maxSpeed, 0, 1);
    this.fov = damp(this.fov, lerp(62 + speedK * 7, 46, aim), 8, dt);
    if (Math.abs(this.camera.fov - this.fov) > 0.01) {
      this.camera.fov = this.fov;
      this.camera.updateProjectionMatrix();
    }
  }
}
