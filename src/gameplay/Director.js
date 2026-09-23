import { ZOMBIE_TYPES, pickType, tierFor } from './ZombieTypes.js';

/**
 * Decides what shows up and when.
 *
 * Kept separate from spawning mechanics so mission scripting can later drive
 * the same knobs: the Director says "a strongman, at the far fence, now", and
 * doesn't care how one gets built.
 */
export class Director {
  constructor({ spawn, level, maxAlive = 26, hud }) {
    this.spawnOne = spawn;
    this.level = level;
    this.maxAlive = maxAlive;
    this.hud = hud;
    this.reinforceTimer = 0;
    this.lastTier = 0;
    this.announced = new Set();
    this.siege = false;
  }

  /** Squad-aware spawn: tots always arrive in a group. */
  spawn(typeId, position, count) {
    const type = ZOMBIE_TYPES[typeId];
    const n = count ?? type.squad ?? 1;
    const made = [];
    for (let i = 0; i < n; i++) {
      const jitter = i === 0 ? [0, 0] : [(Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4];
      const z = this.spawnOne(typeId, [position[0] + jitter[0], position[1], position[2] + jitter[1]]);
      if (z) made.push(z);
    }
    return made;
  }

  /** Opening population. Deliberately calm — heat earns the rest. */
  populate() {
    const yard = this.level.spawnPoints.yard;
    const floors = this.level.spawnPoints.floors;

    for (let i = 0; i < 6; i++) this.spawn('shambler', yard[i % yard.length], 1);
    this.spawn('tot', yard[7 % yard.length]);
    this.spawn('tumbler', yard[9 % yard.length], 1);

    floors.forEach((list, lvl) => {
      this.spawn('shambler', list[0], 1);
      if (lvl > 0) this.spawn('shambler', list[1], 1);
      if (lvl === 2) this.spawn('stiltwalker', list[2], 1);
    });
  }

  /** Missions call this to apply pressure at a place, not just over time. */
  spawnWaveNear(origin, count) {
    const [ox, , oz] = Array.isArray(origin) ? origin : [origin.x, origin.y, origin.z];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 13 + Math.random() * 6;
      this.spawn(pickType(this.lastHeat ?? 40), [
        ox + Math.cos(angle) * dist,
        0,
        Math.max(9, oz + Math.sin(angle) * dist),
      ]);
    }
  }

  /** During a timed defence, pressure is constant rather than heat-driven. */
  setSiege(on) {
    this.siege = on;
    this.reinforceTimer = 0;
  }

  /** Perimeter spawn, so reinforcements walk in rather than appear beside you. */
  edgePoint() {
    const side = Math.floor(Math.random() * 3);
    if (side === 0) return [-14 + Math.random() * 28, 0, 28];
    if (side === 1) return [-15, 0, 12 + Math.random() * 15];
    return [15, 0, 12 + Math.random() * 15];
  }

  update(dt, player, aliveCount) {
    this.lastHeat = player.heat;
    const tier = tierFor(player.heat);
    const tierIndex = [0, 30, 60, 85].indexOf(tier.at);

    if (tierIndex > this.lastTier && !this.announced.has(tierIndex)) {
      this.announced.add(tierIndex);
      this.lastTier = tierIndex;
      this.hud?.toast(TIER_LINES[tierIndex] || 'The ringmaster is watching');
    } else if (tierIndex < this.lastTier) {
      this.lastTier = tierIndex;
    }

    // Reinforcement pressure scales with heat, and stops when the yard is full.
    const interval = this.siege ? 3.2 : 9 - tierIndex * 1.9;
    this.reinforceTimer += dt;
    if (this.reinforceTimer < interval) return;
    this.reinforceTimer = 0;
    if (aliveCount >= this.maxAlive) return;
    if (!this.siege && player.heat < 18) return;

    this.spawn(pickType(player.heat), this.edgePoint());
  }

  /** Called on every kill, so escalation is earned rather than on a timer. */
  onKill(player) {
    player.heat = Math.min(100, player.heat + 10);
  }
}

const TIER_LINES = [
  null,
  'Something heavy is awake upstairs',
  'The ringmaster sends the troupe',
  'The whole show is coming',
];
