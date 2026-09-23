/**
 * Fixed-step loop. Simulation runs at exactly 60Hz so physics and the
 * animation state machine are frame-rate independent; rendering and camera
 * smoothing run on the real frame delta.
 *
 * Systems registered with addFixed() get a constant dt.
 * Systems registered with addFrame() get the variable dt.
 */
export class Engine {
  constructor({ hz = 60, maxSteps = 5 } = {}) {
    this.step = 1 / hz;
    this.maxSteps = maxSteps;
    this.fixed = [];
    this.frame = [];
    this.accumulator = 0;
    this.last = performance.now();
    this.running = false;
    this.elapsed = 0;
  }

  addFixed(fn) { this.fixed.push(fn); return this; }
  addFrame(fn) { this.frame.push(fn); return this; }

  start() {
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    // elapsed is play time, not page time. It was counting the whole stretch
    // you sat on the start screen, which showed up in the victory clock.
    this.elapsed = 0;
  }

  pause() { this.running = false; }

  tick = now => {
    requestAnimationFrame(this.tick);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.25) dt = 0.25;
    if (this.running) this.elapsed += dt;

    if (this.running) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= this.step && steps < this.maxSteps) {
        for (const fn of this.fixed) fn(this.step, this.elapsed);
        this.accumulator -= this.step;
        steps++;
      }
      // Ran out of budget: drop the backlog rather than spiral.
      if (steps === this.maxSteps) this.accumulator = 0;
    }

    for (const fn of this.frame) fn(dt, now);
  };

  mount() { requestAnimationFrame(this.tick); }
}
