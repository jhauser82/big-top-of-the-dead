import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

export const GRAVITY = -21;

/**
 * Rapier wrapper. Replaces the hand-rolled AABB solver: the kinematic
 * character controller handles autostep (stairs), slope limits, and
 * ground snapping, which is most of what that solver was doing badly.
 *
 * We use the -compat build, which inlines the WASM as base64. Slightly
 * slower to boot and marginally slower at runtime than the raw build, but it
 * needs no vite-plugin-wasm and no top-level-await plugin. Switch to
 * @dimforge/rapier3d when you want the last few percent.
 */
export class PhysicsWorld {
  static async create() {
    await RAPIER.init();
    return new PhysicsWorld();
  }

  constructor() {
    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = 1 / 60;

    // One controller is enough — computeColliderMovement is called per
    // character and its result read immediately.
    this.controller = this.world.createCharacterController(0.02);
    this.controller.enableAutostep(0.5, 0.2, true);
    this.controller.enableSnapToGround(0.3);
    this.controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
    this.controller.setMinSlopeSlideAngle((40 * Math.PI) / 180);
    this.controller.setApplyImpulsesToDynamicBodies(false);

    this._ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    this._hitPoint = new THREE.Vector3();
    this._hitNormal = new THREE.Vector3();
  }

  /** Static level geometry. cx/cy/cz is the centre, w/h/d the full extents. */
  addStaticBox(cx, cy, cz, w, h, d) {
    const desc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(cx, cy, cz);
    return this.world.createCollider(desc);
  }

  /**
   * Kinematic capsule. halfHeight is the cylindrical section only, so total
   * height is 2 * (halfHeight + radius).
   */
  createCharacter(position, radius = 0.33, halfHeight = 0.57) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased()
        .setTranslation(position.x, position.y, position.z),
    );
    const collider = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(halfHeight, radius),
      body,
    );
    return { body, collider, radius, halfHeight, height: halfHeight + radius };
  }

  /**
   * Slide a character by `desired`. Returns the corrected displacement plus
   * grounded and ceiling flags so callers can zero their velocity.
   */
  moveCharacter(character, desired, out = new THREE.Vector3()) {
    this.controller.computeColliderMovement(character.collider, desired);
    const m = this.controller.computedMovement();
    out.set(m.x, m.y, m.z);
    const grounded = this.controller.computedGrounded();
    const ceiling = desired.y > 0 && m.y < desired.y * 0.5;
    return { movement: out, grounded, ceiling };
  }

  setCharacterPosition(character, position) {
    character.body.setNextKinematicTranslation(position);
  }

  /** Teleport, skipping interpolation. Use for respawns. */
  warpCharacter(character, position) {
    character.body.setTranslation(position, true);
  }

  removeCharacter(character) {
    this.world.removeRigidBody(character.body);
  }

  /**
   * @returns {{distance:number, point:THREE.Vector3}|null}
   */
  raycast(origin, direction, maxDistance, exclude = undefined) {
    this._ray.origin.x = origin.x; this._ray.origin.y = origin.y; this._ray.origin.z = origin.z;
    this._ray.dir.x = direction.x; this._ray.dir.y = direction.y; this._ray.dir.z = direction.z;
    const hit = this.world.castRay(
      this._ray, maxDistance, true, undefined, undefined, exclude || undefined,
    );
    if (!hit) return null;
    // Rapier renamed `toi` to `timeOfImpact`; accept either.
    const d = hit.timeOfImpact !== undefined ? hit.timeOfImpact : hit.toi;
    this._hitPoint.copy(origin).addScaledVector(direction, d);
    return { distance: d, point: this._hitPoint };
  }

  /**
   * Like raycast, but also returns the surface normal — needed by projectiles
   * that ricochet.
   * @returns {{distance:number, point:THREE.Vector3, normal:THREE.Vector3}|null}
   */
  raycastNormal(origin, direction, maxDistance, exclude = undefined) {
    this._ray.origin.x = origin.x; this._ray.origin.y = origin.y; this._ray.origin.z = origin.z;
    this._ray.dir.x = direction.x; this._ray.dir.y = direction.y; this._ray.dir.z = direction.z;
    const hit = this.world.castRayAndGetNormal(
      this._ray, maxDistance, true, undefined, undefined, exclude || undefined,
    );
    if (!hit) return null;
    const d = hit.timeOfImpact !== undefined ? hit.timeOfImpact : hit.toi;
    this._hitPoint.copy(origin).addScaledVector(direction, d);
    this._hitNormal.set(hit.normal.x, hit.normal.y, hit.normal.z);
    return { distance: d, point: this._hitPoint, normal: this._hitNormal };
  }

  /**
   * Height of the first surface beneath a point. -Infinity if nothing.
   * Pass the character's own collider as `exclude` — a ray starting inside a
   * shape reports a hit at distance zero, which would pin every blob shadow
   * to the character's feet.
   */
  groundHeight(x, y, z, reach = 24, exclude = undefined) {
    const hit = this.raycast({ x, y: y + 0.05, z }, { x: 0, y: -1, z: 0 }, reach, exclude);
    return hit ? y + 0.05 - hit.distance : -Infinity;
  }

  step() { this.world.step(); }
}
