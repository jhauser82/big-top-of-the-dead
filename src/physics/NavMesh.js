import * as THREE from 'three';

/**
 * Recast navmesh, generated at boot from the level geometry.
 *
 * The README originally said generate offline, and for an authored GLB level
 * that's right. Ours is built in code, so there's nothing to pre-bake from —
 * generation costs tens of milliseconds behind the loading screen and keeps
 * the level and its navmesh from ever drifting apart.
 *
 * Two agent profiles get baked. One navmesh at a single radius meant
 * strongmen wedging in doorways their collider doesn't fit through, which is
 * the exact failure this was added to fix.
 *
 * If the package isn't installed, build() returns null and callers fall back
 * to direct steering — same graceful degradation as the character GLBs.
 */

export const NAV_PROFILES = {
  small: { radius: 0.36, height: 1.8 },
  large: { radius: 0.52, height: 2.0 },
};

const CELL_SIZE = 0.16;
const CELL_HEIGHT = 0.10;

function baseConfig(profile) {
  return {
    cs: CELL_SIZE,
    ch: CELL_HEIGHT,
    walkableSlopeAngle: 50,
    walkableHeight: Math.ceil(profile.height / CELL_HEIGHT),
    // 0.4m climb, which is what lets Recast connect our box stairs into a
    // continuous surface. Below the step rise (0.243m) they read as cliffs.
    walkableClimb: Math.ceil(0.4 / CELL_HEIGHT),
    walkableRadius: Math.ceil(profile.radius / CELL_SIZE),
    maxEdgeLen: 12,
    maxSimplificationError: 1.3,
    minRegionArea: 6,
    mergeRegionArea: 20,
    maxVertsPerPoly: 6,
    detailSampleDist: 6,
    detailSampleMaxError: 1,
  };
}

/** Recast has renamed result shapes between releases; normalise them here. */
function toVec3(p) {
  return p instanceof THREE.Vector3 ? p.clone() : new THREE.Vector3(p.x, p.y, p.z);
}

function normalisePath(result) {
  if (!result) return null;
  const raw = Array.isArray(result) ? result : (result.path || result.corners);
  if (!raw || !raw.length) return null;
  if (result.success === false) return null;
  return raw.map(toVec3);
}

export class NavMesh {
  /**
   * @param {THREE.Mesh[]} meshes  static level geometry
   * @returns {Promise<NavMesh|null>}
   */
  static async build(meshes, onProgress) {
    let recast, three;
    try {
      recast = await import('recast-navigation');
      three = await import('@recast-navigation/three');
    } catch {
      console.info(
        '[nav] recast-navigation not installed — zombies will use direct '
        + 'steering. `npm i recast-navigation @recast-navigation/three`',
      );
      return null;
    }

    await recast.init();

    const instance = new NavMesh(recast, three);
    const ids = Object.keys(NAV_PROFILES);

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const t0 = performance.now();
      const result = three.threeToSoloNavMesh(meshes, baseConfig(NAV_PROFILES[id]));
      if (!result.success || !result.navMesh) {
        console.warn(`[nav] generation failed for profile "${id}"`);
        continue;
      }
      instance.profiles.set(id, {
        navMesh: result.navMesh,
        query: new recast.NavMeshQuery(result.navMesh),
      });
      console.info(`[nav] "${id}" built in ${(performance.now() - t0).toFixed(0)}ms`);
      onProgress?.((i + 1) / ids.length);
    }

    return instance.profiles.size ? instance : null;
  }

  constructor(recast, three) {
    this.recast = recast;
    this.three = three;
    this.profiles = new Map();
    this.budget = 0;
    this.budgetPerStep = 4;
    this.helpers = new Map();
  }

  /**
   * Repathing every agent every frame is the easy way to make a navmesh
   * slower than the thing it replaced. Four per step, round-robin by whoever
   * asks first.
   */
  beginStep() { this.budget = this.budgetPerStep; }
  canPath() { return this.budget > 0; }

  findPath(profileId, from, to) {
    const p = this.profiles.get(profileId) || this.profiles.get('small');
    if (!p || this.budget <= 0) return null;
    this.budget--;

    try {
      const start = p.query.findClosestPoint(from);
      const end = p.query.findClosestPoint(to);
      const a = start?.point || start || from;
      const b = end?.point || end || to;
      return normalisePath(p.query.computePath(a, b));
    } catch {
      return null;
    }
  }

  /** Snap a spawn point onto walkable ground. */
  closestPoint(profileId, point) {
    const p = this.profiles.get(profileId) || this.profiles.get('small');
    if (!p) return null;
    try {
      const r = p.query.findClosestPoint(point);
      return toVec3(r?.point || r);
    } catch {
      return null;
    }
  }

  /** Debug wireframe, built lazily because it is not cheap. */
  helper(profileId, scene) {
    if (this.helpers.has(profileId)) {
      const h = this.helpers.get(profileId);
      h.visible = !h.visible;
      return h;
    }
    const p = this.profiles.get(profileId);
    if (!p) return null;
    const helper = new this.three.NavMeshHelper(p.navMesh);
    helper.position.y += 0.06;   // lift it off the floor so z-fighting doesn't strobe
    scene.add(helper);
    this.helpers.set(profileId, helper);
    return helper;
  }
}
