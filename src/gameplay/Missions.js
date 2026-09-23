import { Interactable } from '../world/Interactables.js';
import { FLOOR_H } from '../world/Level.js';

/**
 * Three-act campaign across the one map.
 *
 *   1  Restore power   — a fuse box per floor, forcing a full tour of the house
 *   2  Start the generator — a timed defence in the shed, pressure at maximum
 *   3  Escape          — back through the house to the front gate, with two
 *                        strongmen parked in the way
 *
 * Stages are plain objects with enter/update/status, so adding a fourth is a
 * table entry. The Director takes direction from here rather than the other
 * way round — missions decide what pressure means, escalation just delivers it.
 */
export function createCampaign(ctx) {
  return new MissionSystem([fuseStage(), generatorStage(), escapeStage()], ctx);
}

// ── act one ────────────────────────────────────────────────────────────────
function fuseStage() {
  const spots = [
    [-8.2, 0, 5.6],
    [8.4, FLOOR_H, 5.4],
    [-8.4, FLOOR_H * 2, -5.4],
  ];

  return {
    id: 'fuses',
    title: 'Restore the power',
    hint: 'Three fuse boxes. One on each floor.',
    enter(ctx) {
      this.done = 0;
      this.boxes = spots.map((p, i) => ctx.interactions.add(new Interactable({
        scene: ctx.scene,
        position: p,
        label: `Fuse box ${i + 1} of 3`,
        holdTime: 2.2,
        onComplete: () => {
          this.done++;
          ctx.audio.sfx('objective');
          ctx.hud.toast(`Power restored — ${this.done} of 3`);
          // Every fuse wakes the house up a little more.
          ctx.player.heat = Math.min(100, ctx.player.heat + 22);
          ctx.director.spawnWaveNear(ctx.player.pos, 3);
        },
      })));
    },
    update() {},
    status() {
      return { progress: this.done / 3, detail: `${this.done} / 3` };
    },
    isComplete() { return this.done >= 3; },
    exit(ctx) {
      for (const b of this.boxes) ctx.interactions.remove(b);
    },
  };
}

// ── act two ────────────────────────────────────────────────────────────────
function generatorStage() {
  const SPIN_UP = 45;

  return {
    id: 'generator',
    title: 'Start the generator',
    hint: 'In the shed, back of the yard. It needs 45 seconds to spin up.',
    enter(ctx) {
      this.started = false;
      this.elapsed = 0;
      this.waveTimer = 0;
      this.unit = ctx.interactions.add(new Interactable({
        scene: ctx.scene,
        position: [-12, 0, 9.4],
        label: 'Start the generator',
        holdTime: 3,
        tint: 0xc8102e,
        onComplete: () => {
          this.started = true;
          ctx.audio.sfx('alarm');
          ctx.hud.toast('It is awake. Hold the yard.');
          ctx.player.heat = 100;
          ctx.director.setSiege(true);
        },
      }));
    },
    update(dt, ctx) {
      if (!this.started) return;
      this.elapsed += dt;
      // Heat can't decay during the siege, or the tiers fall away mid-defence.
      ctx.player.heat = Math.max(ctx.player.heat, 82);

      this.waveTimer -= dt;
      if (this.waveTimer <= 0) {
        this.waveTimer = 7.5;
        ctx.director.spawnWaveNear([-12, 0, 9], 3);
      }
    },
    status() {
      if (!this.started) return { progress: 0, detail: 'not started' };
      const left = Math.max(0, SPIN_UP - this.elapsed);
      return { progress: this.elapsed / SPIN_UP, detail: `${left.toFixed(0)}s` };
    },
    isComplete() { return this.started && this.elapsed >= SPIN_UP; },
    exit(ctx) {
      ctx.interactions.remove(this.unit);
      ctx.director.setSiege(false);
    },
  };
}

// ── act three ──────────────────────────────────────────────────────────────
function escapeStage() {
  return {
    id: 'escape',
    title: 'Get out the front',
    hint: 'The gate is open. Through the house.',
    enter(ctx) {
      ctx.audio.sfx('unlock');
      this.reached = false;
      this.gate = ctx.interactions.add(new Interactable({
        scene: ctx.scene,
        position: [0, 0, -11.5],
        label: 'Leave',
        holdTime: 1.2,
        tint: 0x8fae6b,
        onComplete: () => { this.reached = true; },
      }));
      // Two strongmen parked in the hallway, so you can't simply sprint it.
      ctx.director.spawn('strongman', [-2.5, 0, 1], 1);
      ctx.director.spawn('strongman', [3, 0, -3], 1);
      ctx.director.spawn('stiltwalker', [0, 0, -5], 1);
    },
    update() {},
    status() { return { progress: this.reached ? 1 : 0, detail: 'front gate' }; },
    isComplete() { return this.reached; },
    exit(ctx) { ctx.interactions.remove(this.gate); },
  };
}

// ── runner ─────────────────────────────────────────────────────────────────
export class MissionSystem {
  constructor(stages, ctx) {
    this.stages = stages;
    this.ctx = ctx;
    this.index = -1;
    this.complete = false;
    this.advance();
  }

  get stage() { return this.stages[this.index] || null; }

  advance() {
    this.stage?.exit?.(this.ctx);
    this.index++;

    if (this.index >= this.stages.length) {
      this.complete = true;
      this.ctx.audio.sfx('victory');
      this.ctx.onVictory?.();
      return;
    }

    const stage = this.stage;
    stage.enter(this.ctx);
    this.ctx.audio.sfx('objective');
    this.ctx.hud.setObjective(stage.title, stage.hint);
  }

  update(dt) {
    if (this.complete) return;
    const stage = this.stage;
    stage.update(dt, this.ctx);
    this.ctx.hud.setObjectiveStatus(stage.status(this.ctx));
    if (stage.isComplete()) this.advance();
  }
}
