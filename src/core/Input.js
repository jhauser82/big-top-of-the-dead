/**
 * Single source of truth for intent. Systems read flags off this; nothing
 * else attaches its own listeners, so rebinding lives in one place.
 */
export class Input {
  constructor(canvas, touchRoot) {
    this.canvas = canvas;
    this.keys = Object.create(null);
    this.move = { x: 0, y: 0 };      // -1..1, y is forward (negative = away)
    this.lookDx = 0;
    this.lookDy = 0;
    this.aiming = false;
    this.fireHeld = false;
    this.fireQueued = false;
    this.rollQueued = false;
    this.weaponSlot = null;   // 0-based, consumed by WeaponSystem
    this.weaponCycle = 0;
    this.interactHeld = false;
    this.jumpHeld = false;
    this.restockQueued = false;
    this.sensitivity = 0.0023;

    this._bindKeyboard();
    this._bindMouse();
    if (touchRoot) this._bindTouch(touchRoot);
  }

  _bindKeyboard() {
    addEventListener('keydown', e => {
      this.keys[e.code] = true;
      if (e.code === 'Space') { e.preventDefault(); this.jumpHeld = true; }
      if (e.code === 'ControlLeft' || e.code === 'ControlRight') this.rollQueued = true;
      if (e.code === 'KeyR') this.restockQueued = true;
      if (e.code.startsWith('Digit')) {
        const n = Number(e.code.slice(5));
        if (n >= 1 && n <= 9) this.weaponSlot = n - 1;
      }
      if (e.code === 'KeyQ') this.weaponCycle = -1;
      if (e.code === 'KeyE') this.interactHeld = true;
    });
    addEventListener('keyup', e => {
      this.keys[e.code] = false;
      if (e.code === 'Space') this.jumpHeld = false;
      if (e.code === 'KeyE') this.interactHeld = false;
    });
    addEventListener('blur', () => {
      for (const k in this.keys) this.keys[k] = false;
      this.jumpHeld = false;
      this.aiming = false;
      this.fireHeld = false;
      this.interactHeld = false;
    });
    addEventListener('contextmenu', e => e.preventDefault());
  }

  _bindMouse() {
    const cv = this.canvas;
    let dragging = false, lastX = 0, lastY = 0;

    cv.addEventListener('mousedown', e => {
      if (document.pointerLockElement === cv) {
        if (e.button === 0) { this.fireQueued = true; this.fireHeld = true; }
        if (e.button === 2) this.aiming = true;
        return;
      }
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      cv.requestPointerLock?.();
    });
    addEventListener('mouseup', e => {
      dragging = false;
      if (e.button === 0) this.fireHeld = false;
      if (e.button === 2) this.aiming = false;
    });
    cv.addEventListener('wheel', e => {
      this.weaponCycle = Math.sign(e.deltaY);
    }, { passive: true });
    addEventListener('mousemove', e => {
      if (document.pointerLockElement === cv) {
        this.lookDx += e.movementX;
        this.lookDy += e.movementY;
      } else if (dragging) {
        this.lookDx += e.clientX - lastX;
        this.lookDy += e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
      }
    });
  }

  _bindTouch(root) {
    const stick = root.querySelector('#stick');
    const nub = root.querySelector('#nub');
    let stickId = null, lookId = null, lookX = 0, lookY = 0;

    const updateStick = t => {
      const r = stick.getBoundingClientRect();
      let dx = t.clientX - (r.left + r.width / 2);
      let dy = t.clientY - (r.top + r.height / 2);
      const max = r.width / 2, len = Math.hypot(dx, dy);
      if (len > max) { dx = dx / len * max; dy = dy / len * max; }
      nub.style.transform = `translate(${dx}px,${dy}px)`;
      this.move.x = dx / max;
      this.move.y = dy / max;
    };

    stick.addEventListener('touchstart', e => {
      e.preventDefault();
      stickId = e.changedTouches[0].identifier;
      updateStick(e.changedTouches[0]);
    }, { passive: false });

    root.addEventListener('touchstart', e => {
      const t = e.changedTouches[0];
      if (t.target === root && lookId === null) {
        lookId = t.identifier; lookX = t.clientX; lookY = t.clientY;
      }
    }, { passive: true });

    addEventListener('touchmove', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) updateStick(t);
        else if (t.identifier === lookId) {
          this.lookDx += (t.clientX - lookX) * 1.8;
          this.lookDy += (t.clientY - lookY) * 1.8;
          lookX = t.clientX; lookY = t.clientY;
        }
      }
    }, { passive: false });

    addEventListener('touchend', e => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null; this.move.x = 0; this.move.y = 0;
          nub.style.transform = 'translate(0,0)';
        }
        if (t.identifier === lookId) lookId = null;
      }
    });

    const btn = (id, fn) => root.querySelector(id)
      .addEventListener('touchstart', e => { e.preventDefault(); fn(); }, { passive: false });
    btn('#bRoll', () => { this.rollQueued = true; });
    btn('#bSwap', () => { this.weaponCycle = 1; });

    const use = root.querySelector('#bUse');
    use.addEventListener('touchstart', e => {
      e.preventDefault(); this.interactHeld = true;
    }, { passive: false });
    use.addEventListener('touchend', e => {
      e.preventDefault(); this.interactHeld = false;
    }, { passive: false });
    btn('#bJump', () => {
      this.jumpHeld = true;
      setTimeout(() => { this.jumpHeld = false; }, 110);
    });

    // Fire is press-and-hold so the stream weapon works on touch.
    const fire = root.querySelector('#bThrow');
    fire.addEventListener('touchstart', e => {
      e.preventDefault(); this.fireQueued = true; this.fireHeld = true;
    }, { passive: false });
    fire.addEventListener('touchend', e => {
      e.preventDefault(); this.fireHeld = false;
    }, { passive: false });
  }

  /** Consume accumulated look delta. Call once per frame. */
  takeLook() {
    const dx = this.lookDx, dy = this.lookDy;
    this.lookDx = 0; this.lookDy = 0;
    return [dx * this.sensitivity, dy * this.sensitivity];
  }

  /** Keyboard WASD folded into the same -1..1 pair the thumbstick produces. */
  axis() {
    const k = this.keys;
    let x = this.move.x, y = this.move.y;
    if (k.KeyW || k.ArrowUp) y -= 1;
    if (k.KeyS || k.ArrowDown) y += 1;
    if (k.KeyD || k.ArrowRight) x += 1;
    if (k.KeyA || k.ArrowLeft) x -= 1;
    const len = Math.hypot(x, y);
    return len > 1 ? [x / len, y / len] : [x, y];
  }

  get sprinting() { return !!(this.keys.ShiftLeft || this.keys.ShiftRight); }
}
