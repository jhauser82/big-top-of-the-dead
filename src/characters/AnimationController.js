import * as THREE from 'three';

/**
 * Each entry is a fallback chain — the first clip present in the library
 * wins, so a partial download still animates. Run `npm run clips -- <glb>`
 * and reconcile this table; Quaternius renames clips between pack releases.
 */
const ALIASES = {
  player: {
    idle:   ['Idle', 'Idle_Loop', 'CharacterArmature|Idle'],
    walk:   ['Walk', 'Walk_Forward', 'Walking'],
    run:    ['Run', 'Run_Forward', 'Running'],
    sprint: ['Sprint', 'Run_Fast', 'Run'],
    jump:   ['Jump_Start', 'Jump', 'Jump_Up'],
    fall:   ['Jump_Idle', 'Fall', 'Falling', 'Jump_Start'],
    land:   ['Jump_Land', 'Land', 'Landing'],
    roll:   ['Roll_Forward', 'Roll', 'Dodge_Forward'],
    throw:  ['Throw', 'Throw_Object', 'Attack_Throw', 'Interact'],
    hurt:   ['Hit_A', 'Hit', 'HitRecieve', 'Damage'],
    dead:   ['Death_A', 'Death', 'Die'],
  },
  zombie: {
    idle:    ['Zombie_Idle', 'Idle_Zombie', 'Idle'],
    wander:  ['Zombie_Walk', 'Walk_Zombie', 'Walk'],
    alert:   ['Zombie_Scream', 'Alert', 'Zombie_Idle', 'Idle'],
    chase:   ['Zombie_Run', 'Run_Zombie', 'Run'],
    attack:  ['Zombie_Attack', 'Attack_Zombie', 'Attack'],
    stagger: ['Zombie_Hit', 'Hit_A', 'Hit'],
    dead:    ['Zombie_Death', 'Death_A', 'Death'],
  },
};

/** Locomotion rungs blend by speed instead of switching. */
const LOCOMOTION = {
  player: [
    { key: 'idle', speed: 0.0 },
    { key: 'walk', speed: 3.4 },
    { key: 'run', speed: 5.0 },
    { key: 'sprint', speed: 7.4 },
  ],
  zombie: [
    { key: 'idle', speed: 0.0 },
    { key: 'wander', speed: 1.0 },
    { key: 'chase', speed: 2.9 },
  ],
};

const ONE_SHOT = {
  jump:    { in: 0.08, clamp: false },
  fall:    { in: 0.15, clamp: false, loop: true },
  land:    { in: 0.05, clamp: true },
  roll:    { in: 0.05, clamp: true },
  hurt:    { in: 0.04, clamp: true },
  stagger: { in: 0.04, clamp: true },
  alert:   { in: 0.10, clamp: true },
  attack:  { in: 0.06, clamp: true },
  dead:    { in: 0.10, clamp: true },
};

const LOCOMOTION_STATES = new Set(['idle', 'walk', 'run', 'wander', 'chase']);

export class AnimationController {
  constructor(mixer, clipLibrary, profile = 'player', root = null) {
    this.mixer = mixer;
    this.library = clipLibrary;
    this.profile = profile;
    this.root = root;
    this.aliases = ALIASES[profile] || ALIASES.player;
    this.rungs = LOCOMOTION[profile] || LOCOMOTION.player;
    this.procedural = false;

    this.actions = new Map();
    this.weights = new Map();
    this.current = null;
    this.upper = null;
    this.warned = new Set();

    for (const rung of this.rungs) {
      const a = this._action(rung.key);
      if (a) { a.play(); a.setEffectiveWeight(0); }
    }
    this._action('idle')?.setEffectiveWeight(1);
  }

  _resolve(key) {
    const chain = this.aliases[key];
    if (!chain) return null;
    for (const name of chain) {
      const clip = this.library.get(name);
      if (clip) return clip;
    }
    if (!this.warned.has(key)) {
      this.warned.add(key);
      console.warn(`[anim] no clip for "${key}" (${this.profile}); tried ${chain.join(', ')}`);
    }
    return null;
  }

  _action(key) {
    if (this.actions.has(key)) return this.actions.get(key);
    const clip = this._resolve(key);
    const action = clip ? this.mixer.clipAction(clip) : null;
    this.actions.set(key, action);
    return action;
  }

  /** Blend the two rungs bracketing `speed`, syncing playback so feet stick. */
  setLocomotion(speed, dt, oneShotWeight = 0) {
    const rungs = this.rungs;
    let lo = rungs[0], hi = rungs[rungs.length - 1], t = 0;

    for (let i = 0; i < rungs.length - 1; i++) {
      if (speed <= rungs[i + 1].speed) {
        lo = rungs[i]; hi = rungs[i + 1];
        const span = hi.speed - lo.speed;
        t = span > 0 ? (speed - lo.speed) / span : 0;
        break;
      }
      if (i === rungs.length - 2) { lo = hi; t = 0; }
    }

    const rate = THREE.MathUtils.clamp(speed / (hi.speed || 1), 0.55, 1.7);

    for (const rung of rungs) {
      const action = this._action(rung.key);
      if (!action) continue;
      let w = 0;
      if (rung === lo) w = 1 - t;
      if (rung === hi) w += t;
      const prev = this.weights.get(rung.key) || 0;
      const next = prev + (w - prev) * Math.min(1, dt * 14);
      this.weights.set(rung.key, next);
      action.setEffectiveWeight(next * (1 - oneShotWeight));
      if (rung.speed > 0) action.timeScale = rate;
    }
  }

  play(key, { restart = false } = {}) {
    if (this.current?.key === key && !restart) return;
    const action = this._action(key);
    if (!action) return;
    const cfg = ONE_SHOT[key] || { in: 0.12, clamp: false };

    if (this.current && this.current.action !== action) this.current.action.fadeOut(cfg.in);

    action.reset();
    action.setLoop(cfg.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = !!cfg.clamp;
    action.fadeIn(cfg.in).play();
    this.current = { key, action };
  }

  release(fade = 0.15) {
    if (!this.current) return;
    this.current.action.fadeOut(fade);
    this.current = null;
  }

  /** Upper-body-only overlay, so a throw reads while the legs keep running. */
  playUpper(key, spineBone = 'Spine1') {
    const clip = this._resolve(key);
    if (!clip || !this.root) return;
    const masked = filterClipToSubtree(clip, this.root, spineBone);
    this.upper?.fadeOut(0.1);
    const action = this.mixer.clipAction(masked);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.setEffectiveWeight(1);
    action.fadeIn(0.06).play();
    this.upper = action;
  }

  /** Same signature as ProceduralAnimator, so callers never branch. */
  syncToState(state, ctx, dt) {
    const speed = ctx.speed || 0;

    if (state === 'dead') {
      this.play('dead');
    } else if (LOCOMOTION_STATES.has(state)) {
      this.release();
      this.setLocomotion(speed, dt);
    } else if (state === 'throw') {
      this.setLocomotion(speed, dt);
      if (ctx.throwStart) this.playUpper('throw');
    } else {
      this.play(state);
      const w = this.current?.action.getEffectiveWeight() || 0;
      this.setLocomotion(speed, dt, w);
    }

    this.mixer.update(dt);
  }
}

/**
 * three.js has no bone masks, so restrict a clip by dropping tracks that
 * don't target the given subtree.
 */
export function filterClipToSubtree(clip, root, rootBoneName) {
  let found = null;
  root.traverse(o => { if (o.name === rootBoneName) found = o; });
  if (!found) return clip;

  const allowed = new Set();
  found.traverse(o => allowed.add(o.name));

  const tracks = clip.tracks.filter(t => allowed.has(t.name.split('.')[0]));
  if (!tracks.length) return clip;
  const out = new THREE.AnimationClip(`${clip.name}_upper`, clip.duration, tracks);
  out.blendMode = clip.blendMode;
  return out;
}
