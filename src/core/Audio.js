/**
 * Synthesised soundscape. No sample files, so no licensing homework and no
 * loading screen — and it means the project still ships sound on a fresh
 * clone with an empty assets folder.
 *
 * Three layers:
 *   sfx      one-shots, built from oscillators and a shared noise buffer
 *   ambient  filtered-noise wind plus randomised house creaks
 *   tension  a drone and pulse whose rate and brightness follow heat
 *
 * When you get the CC0 packs, `sfx()` is the single seam to reroute through
 * Howler. Everything calls it by name, not by frequency.
 */
export class Audio {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.noiseBuffer = null;
    this.heat = 0;
    this.indoors = 0;
    this._creakTimer = 4;
  }

  unlock() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch {
      this.ctx = null;
      return;
    }

    const ctx = this.ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.85;

    // Keeps the confetti cannon from clipping when six things fire at once.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 24;
    comp.ratio.value = 7;
    comp.attack.value = 0.004;
    comp.release.value = 0.22;

    this.master.connect(comp);
    comp.connect(ctx.destination);

    this.noiseBuffer = this._makeNoise(2.0);
    this._buildAmbient();
    this._buildTension();
  }

  _makeNoise(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _noiseSource(loop) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = !!loop;
    return src;
  }

  // ── ambient bed ─────────────────────────────────────────────────────────
  _buildAmbient() {
    const ctx = this.ctx;
    const wind = this._noiseSource(true);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 340;
    filter.Q.value = 0.7;

    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.035;

    wind.connect(filter);
    filter.connect(this.windGain);
    this.windGain.connect(this.master);
    wind.start();

    this.windFilter = filter;
  }

  /** Irregular timber creaks. Regular ones read as a loop and kill the mood. */
  _creak() {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    const base = 55 + Math.random() * 90;
    osc.frequency.setValueAtTime(base, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(base * 0.72, ctx.currentTime + 0.9);

    filter.type = 'lowpass';
    filter.frequency.value = 500 + Math.random() * 400;

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.02 + Math.random() * 0.02, ctx.currentTime + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.1);

    osc.connect(filter); filter.connect(gain); gain.connect(this.master);
    osc.start(); osc.stop(ctx.currentTime + 1.2);
  }

  // ── tension layer ───────────────────────────────────────────────────────
  _buildTension() {
    const ctx = this.ctx;

    const drone = ctx.createOscillator();
    drone.type = 'sawtooth';
    drone.frequency.value = 48;

    const detune = ctx.createOscillator();
    detune.type = 'sawtooth';
    detune.frequency.value = 48.7;

    this.droneFilter = ctx.createBiquadFilter();
    this.droneFilter.type = 'lowpass';
    this.droneFilter.frequency.value = 160;
    this.droneFilter.Q.value = 3;

    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;

    drone.connect(this.droneFilter);
    detune.connect(this.droneFilter);
    this.droneFilter.connect(this.droneGain);
    this.droneGain.connect(this.master);
    drone.start(); detune.start();

    this._pulseTimer = 0;
  }

  /** @param heat 0-100  @param indoors 0 or 1 */
  update(dt, heat, indoors) {
    if (!this.ctx) return;
    const k = Math.min(1, Math.max(0, heat / 100));
    this.heat += (k - this.heat) * Math.min(1, dt * 1.5);
    this.indoors += ((indoors ? 1 : 0) - this.indoors) * Math.min(1, dt * 2);

    // Indoors the wind muffles and the creaks take over.
    this.windGain.gain.value = 0.035 * (1 - this.indoors * 0.65);
    this.windFilter.frequency.value = 340 - this.indoors * 180;

    this.droneGain.gain.value = 0.02 + this.heat * 0.075;
    this.droneFilter.frequency.value = 160 + this.heat * 420;

    this._creakTimer -= dt * (0.5 + this.indoors * 1.6);
    if (this._creakTimer <= 0) {
      this._creakTimer = 3 + Math.random() * 9;
      this._creak();
    }

    // A heartbeat that only appears once things are genuinely bad.
    if (this.heat > 0.35) {
      this._pulseTimer -= dt;
      if (this._pulseTimer <= 0) {
        this._pulseTimer = 1.5 - this.heat * 0.85;
        this._thud(40 + this.heat * 18, 0.1 * this.heat);
      }
    }
  }

  _thud(freq, gain) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, ctx.currentTime + 0.18);
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);
    osc.connect(g); g.connect(this.master);
    osc.start(); osc.stop(ctx.currentTime + 0.24);
  }

  // ── one-shots ───────────────────────────────────────────────────────────
  blip(freq, dur, type = 'sine', gain = 0.1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(); osc.stop(ctx.currentTime + dur);
  }

  /** Filtered noise burst — impacts, sprays, splats. */
  noise({ dur = 0.2, gain = 0.1, type = 'lowpass', from = 2000, to = 300, q = 1 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const src = this._noiseSource(false);
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();

    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), ctx.currentTime + dur);

    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);

    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(); src.stop(ctx.currentTime + dur);
  }

  /**
   * Named one-shots. Everything in the game calls these rather than raw
   * frequencies, so swapping in real samples later is one function.
   */
  sfx(name, opts = {}) {
    if (!this.ctx) return;
    const r = Math.random();
    switch (name) {
      case 'pie':        this.blip(560, 0.06, 'square', 0.1); this.noise({ dur: 0.12, gain: 0.05, from: 1800, to: 500 }); break;
      case 'clubs':      this.blip(380, 0.09, 'triangle', 0.11); break;
      case 'catch':      this.blip(880, 0.06, 'sine', 0.09); break;
      case 'cannon':     this.blip(150, 0.22, 'sawtooth', 0.16); this.noise({ dur: 0.35, gain: 0.16, from: 3200, to: 180 }); break;
      case 'seltzer':    this.noise({ dur: 0.07, gain: 0.03, type: 'bandpass', from: 4200 + r * 2500, to: 3000, q: 3 }); break;
      case 'splat':      this.noise({ dur: 0.16, gain: 0.09, from: 1200, to: 200 }); break;
      case 'hitFlesh':   this.blip(170, 0.13, 'triangle', 0.13); this.noise({ dur: 0.1, gain: 0.07, from: 900, to: 160 }); break;
      case 'headshot':   this.blip(300, 0.13, 'triangle', 0.15); this.blip(620, 0.08, 'sine', 0.08); break;
      case 'confetti':   this.blip(660, 0.18, 'triangle', 0.12); this.noise({ dur: 0.4, gain: 0.07, type: 'highpass', from: 900, to: 2600 }); break;
      case 'jump':       this.blip(430, 0.09, 'square', 0.08); break;
      case 'land':       this.noise({ dur: 0.12, gain: 0.06 * (opts.force ?? 1), from: 700, to: 90 }); break;
      case 'roll':       this.noise({ dur: 0.26, gain: 0.07, from: 500, to: 160 }); break;
      case 'pickup':     this.blip(780, 0.1, 'sine', 0.1); this.blip(1170, 0.14, 'sine', 0.06); break;
      case 'swap':       this.blip(300 + (opts.slot ?? 0) * 90, 0.05, 'square', 0.07); break;
      case 'empty':      this.blip(110, 0.05, 'square', 0.05); break;
      case 'hurt':       this.blip(300, 0.14, 'sawtooth', 0.14); setTimeout(() => this.blip(205, 0.18, 'sawtooth', 0.12), 115); break;
      case 'objective':  this.blip(523, 0.14, 'triangle', 0.1); setTimeout(() => this.blip(784, 0.22, 'triangle', 0.1), 130); break;
      case 'unlock':     this.blip(392, 0.1, 'square', 0.09); setTimeout(() => this.blip(587, 0.12, 'square', 0.09), 90); setTimeout(() => this.blip(784, 0.3, 'triangle', 0.1), 190); break;
      case 'alarm':      this.blip(220, 0.5, 'sawtooth', 0.09); setTimeout(() => this.blip(180, 0.6, 'sawtooth', 0.09), 260); break;
      case 'interact':   this.blip(440 + (opts.progress ?? 0) * 420, 0.05, 'sine', 0.05); break;
      case 'victory':    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.32, 'triangle', 0.11), i * 150)); break;

      // Archetype voices — pitch scales inversely with size.
      case 'notice': {
        const pitch = opts.pitch ?? 1;
        this.blip((80 + r * 60) * pitch, 0.3, 'sawtooth', 0.05);
        break;
      }
      case 'dashTell': this.blip(520, 0.1, 'square', 0.06); break;
      default: break;
    }
  }

  honk() { this.sfx('hurt'); }
}
