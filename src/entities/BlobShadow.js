import * as THREE from 'three';

/**
 * Cheap contact shadow. The interior point lights are unshadowed, so without
 * this characters float. One transparent quad beats a shadow-casting light
 * by a wide margin.
 */
export class BlobShadow {
  constructor(scene, physics, texture, ownCollider = null, size = 1.5) {
    this.physics = physics;
    this.ownCollider = ownCollider;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0.62 }),
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.scene = scene;
  }

  update(position, feetOffset) {
    const ground = this.physics.groundHeight(
      position.x, position.y - feetOffset + 0.1, position.z, 6, this.ownCollider,
    );
    if (!Number.isFinite(ground)) { this.mesh.visible = false; return; }
    const drop = THREE.MathUtils.clamp(position.y - feetOffset - ground, 0, 3);
    const k = 1 - drop / 3;
    this.mesh.visible = true;
    this.mesh.position.set(position.x, ground + 0.02, position.z);
    this.mesh.scale.setScalar(0.85 + drop * 0.35);
    this.mesh.material.opacity = 0.62 * k * k;
  }

  fade(amount) { this.mesh.material.opacity = Math.max(0, this.mesh.material.opacity - amount); }
  dispose() { this.scene.remove(this.mesh); }
}
