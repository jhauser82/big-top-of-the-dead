import * as THREE from 'three';

export const FLOOR_H = 3.4;
export const WALL_H = 3.1;
export const LEVELS = [0, FLOOR_H, FLOOR_H * 2];

const rand = (a, b) => a + Math.random() * (b - a);
const BOX = new THREE.BoxGeometry(1, 1, 1);

/**
 * Builds the house and yard once, pushing a mesh into the scene and a static
 * cuboid into Rapier for every solid. Visual-only pieces (window panes,
 * banisters, branches) skip the collider.
 */
export class Level {
  constructor(scene, physics, mats) {
    this.scene = scene;
    this.physics = physics;
    this.mats = mats;
    this.windows = [];
    this.navMeshes = [];   // solid geometry only — Recast input
    this.spawnPoints = { yard: [], floors: [[], [], []] };
    this.build();
  }

  box(cx, cy, cz, w, h, d, mat, { solid = true, cast = true } = {}) {
    const m = new THREE.Mesh(BOX, mat);
    m.position.set(cx, cy, cz);
    m.scale.set(w, h, d);
    m.castShadow = cast;
    m.receiveShadow = true;
    this.scene.add(m);
    if (solid) {
      this.physics.addStaticBox(cx, cy, cz, w, h, d);
      this.navMeshes.push(m);
    }
    return m;
  }

  wall(x1, z1, x2, z2, y, h, mat) {
    const w = Math.max(Math.abs(x2 - x1), 0.3);
    const d = Math.max(Math.abs(z2 - z1), 0.3);
    return this.box((x1 + x2) / 2, y + h / 2, (z1 + z2) / 2, w, h, d, mat || this.mats.paper);
  }

  /** Floor plate with a rectangular stairwell hole cut out. */
  slab(y, x0, x1, z0, z1, hole, mat) {
    const t = 0.3;
    const m = mat || this.mats.wood;
    const plate = (a, b, c, d) => {
      if (b - a > 0.01 && d - c > 0.01) {
        this.box((a + b) / 2, y - t / 2, (c + d) / 2, b - a, t, d - c, m, { cast: false });
      }
    };
    if (!hole) { plate(x0, x1, z0, z1); return; }
    plate(x0, hole.x0, z0, z1);
    plate(hole.x1, x1, z0, z1);
    plate(hole.x0, hole.x1, z0, hole.z0);
    plate(hole.x0, hole.x1, hole.z1, z1);
  }

  /**
   * Individual step boxes. Rapier's autostep (0.5 max height) carries
   * characters up them without ramps or special-case code.
   */
  stairs(xc, zStart, zEnd, yBase, totalRise, width) {
    const steps = 14;
    const dz = (zEnd - zStart) / steps;
    const rise = totalRise / steps;
    for (let i = 0; i < steps; i++) {
      const top = rise * (i + 1);
      const z = zStart + dz * (i + 0.5);
      this.box(xc, yBase + top / 2, z, width, top, Math.abs(dz) + 0.02, this.mats.wood, { cast: false });
    }
    const side = Math.sign(xc || 1);
    for (let i = 0; i <= steps; i += 2) {
      this.box(xc + (width / 2) * side, yBase + rise * i + 0.5, zStart + dz * i,
        0.09, 1.0, 0.09, this.mats.trim, { solid: false });
    }
  }

  pane(x, y, z, facing) {
    const w = facing === 'z' ? 1.5 : 0.14;
    const d = facing === 'z' ? 0.14 : 1.5;
    this.box(x, y + 1.5, z, w, 1.5, d, this.mats.glass, { solid: false, cast: false });
    this.windows.push({ x, y: y + 1.5, z, facing });
  }

  build() {
    const M = this.mats;
    const HOLE_A = { x0: 5.2, x1: 9.4, z0: -6.6, z1: 0.7 };
    const HOLE_B = { x0: -9.4, x1: -5.2, z0: -0.7, z1: 6.6 };

    this.box(0, -0.25, 10, 96, 0.5, 96, M.ground, { cast: false });

    this.slab(FLOOR_H, -10, 10, -7, 7, HOLE_A);
    this.slab(FLOOR_H * 2, -10, 10, -7, 7, HOLE_B);
    this.slab(FLOOR_H * 3, -10, 10, -7, 7, null, M.trim);

    this.stairs(7.3, -6.3, 0.3, 0, FLOOR_H, 3.2);
    this.stairs(-7.3, 6.3, -0.3, FLOOR_H, FLOOR_H, 3.2);

    LEVELS.forEach((y, lvl) => {
      this.wall(-10, -7, -10, 7, y, WALL_H, M.clap);
      this.wall(10, -7, 10, 7, y, WALL_H, M.clap);

      if (lvl === 0) {
        this.wall(-10, -7, -1.7, -7, y, WALL_H, M.clap);
        this.wall(1.7, -7, 10, -7, y, WALL_H, M.clap);
        this.box(0, y + 2.78, -7, 3.4, 0.64, 0.3, M.clap);
        this.wall(-10, 7, -1.7, 7, y, WALL_H, M.clap);
        this.wall(1.7, 7, 10, 7, y, WALL_H, M.clap);
        this.box(0, y + 2.78, 7, 3.4, 0.64, 0.3, M.clap);
      } else {
        this.wall(-10, -7, 10, -7, y, WALL_H, M.clap);
        this.wall(-10, 7, 10, 7, y, WALL_H, M.clap);
      }

      this.pane(-6, y, -7.12, 'z');
      this.pane(6, y, -7.12, 'z');
      this.pane(-10.12, y, 2, 'x');
      this.pane(10.12, y, -3, 'x');
      if (lvl > 0) { this.pane(-4, y, 7.12, 'z'); this.pane(4, y, 7.12, 'z'); }

      const px = lvl === 0 ? -3 : lvl === 1 ? 2.5 : -1.5;
      this.wall(px, -7, px, -2.5, y, WALL_H, M.paper);
      this.wall(px, 0.7, px, 7, y, WALL_H, M.paper);
      const pz = lvl === 1 ? -2.5 : 3;
      this.wall(px, pz, px + (lvl === 1 ? 5.4 : 5.0), pz, y, WALL_H, M.paper);

      for (const bx of [-9.85, 9.85]) {
        this.box(bx, y + 0.13, 0, 0.14, 0.26, 13.6, M.trim, { solid: false });
      }

      for (let i = 0; i < 4; i++) {
        this.spawnPoints.floors[lvl].push([rand(-8, 8), y, rand(-5, 5)]);
      }
    });

    this.furnish();
    this.yard();
  }

  furnish() {
    const M = this.mats;
    const lumps = [
      [-6, 0, -4], [-7, 0, 3], [4, 0, 5], [-6, FLOOR_H, -3], [6, FLOOR_H, 3.6],
      [-3, FLOOR_H * 2, -4], [3, FLOOR_H * 2, 4], [7, FLOOR_H * 2, -2],
    ];
    for (const [x, y, z] of lumps) {
      this.box(x, y + 0.42, z, rand(1.3, 2.1), 0.84, rand(0.9, 1.4), M.sheet);
      this.box(x, y + 0.95, z, rand(0.8, 1.2), 0.3, rand(0.6, 0.9), M.sheet, { solid: false });
    }
    for (const [x, y, z] of [[10, 0, 14], [-6, 0, 18], [3, 0, 11], [12, 0, 22]]) {
      this.box(x, y + 0.4, z, 0.8, 0.8, 0.8, M.wood);
    }
  }

  yard() {
    const M = this.mats;
    for (let x = -16; x <= 16; x += 2) this.box(x, 0.9, 30, 0.2, 1.8, 0.2, M.bark);
    for (let z = 8; z <= 30; z += 2) {
      this.box(-16, 0.9, z, 0.2, 1.8, 0.2, M.bark);
      this.box(16, 0.9, z, 0.2, 1.8, 0.2, M.bark);
    }
    this.box(0, 1.55, 30, 32, 0.12, 0.12, M.bark, { solid: false });
    this.box(-16, 1.55, 19, 0.12, 0.12, 22, M.bark, { solid: false });
    this.box(16, 1.55, 19, 0.12, 0.12, 22, M.bark, { solid: false });

    const graves = [[-9, 13], [-5, 17], [-11, 22], [-3, 24], [7, 14],
                    [10, 19], [4, 25], [13, 26], [-13, 27], [1, 15]];
    for (const [x, z] of graves) {
      const g = this.box(x, 0.6, z, 1.0, 1.2, 0.22, M.stone);
      g.rotation.z = rand(-0.16, 0.16);
      this.box(x, 0.06, z, 1.5, 0.14, 0.8, M.stone, { cast: false });
    }

    for (const [x, z] of [[-13, 10], [13, 11], [2, 21], [-4, 29]]) {
      this.box(x, 2.4, z, 0.55, 4.8, 0.55, M.bark);
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05 + rand(0, 0.4);
        this.box(x + Math.cos(a) * 1.2, 4.3 + i * 0.2, z + Math.sin(a) * 1.2,
          2.2, 0.13, 0.13, M.bark, { solid: false });
      }
    }

    this.box(-13.5, 1.4, 9, 0.25, 2.8, 4.2, M.bark);
    this.box(-10.6, 1.4, 9, 0.25, 2.8, 4.2, M.bark);
    this.box(-12, 1.4, 11, 3.2, 2.8, 0.25, M.bark);
    this.box(-12, 2.9, 9, 3.4, 0.3, 4.6, M.bark);

    for (let i = 0; i < 12; i++) {
      this.spawnPoints.yard.push([rand(-13, 13), 0, rand(10, 27)]);
    }
  }
}
