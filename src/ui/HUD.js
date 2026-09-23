import './hud.css';
import { FLOOR_H } from '../world/Level.js';
import { WEAPONS, WEAPON_ORDER } from '../gameplay/Weapons.js';

const FLOORS = ['Ground floor', 'Second floor', 'Attic', 'Roof'];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const MARKUP = `
<div id="hud">
  <div class="row">
    <div class="panel">
      <div class="k">Greasepaint</div><div id="healthTrack"><div id="healthFill"></div></div>
      <div class="k" style="margin:7px 0 3px">Ringmaster's attention</div>
      <div id="heatTrack"><div id="heatFill"></div></div>
    </div>
    <div class="panel"><div class="k">Splatted</div><div class="v" id="kills">0</div></div>
  </div>
  <div class="row" style="align-items:flex-end">
    <div>
      <div id="floorTag">Ground floor</div>
      <div id="stateTag"></div>
    </div>
    <div id="weapons" class="panel" style="margin-left:auto"></div>
  </div>
</div>
<div id="reticle"><i></i><i></i><i></i><i></i></div>
<div id="toast"></div>
<div id="objective">
  <div class="olabel">Objective</div>
  <div class="otitle" id="objTitle">—</div>
  <div class="ohint" id="objHint"></div>
  <div id="objTrack"><div id="objFill"></div></div>
  <div class="odetail" id="objDetail"></div>
</div>
<div id="prompt"><span id="promptLabel"></span>
  <div id="promptTrack"><div id="promptFill"></div></div>
</div>
<div id="touch">
  <div class="stick" id="stick"><div class="nub" id="nub"></div></div>
  <div class="btn" id="bThrow">Pie</div>
  <div class="btn" id="bJump">Jump</div>
  <div class="btn" id="bRoll">Roll</div>
  <div class="btn" id="bSwap">Swap</div>
  <div class="btn" id="bUse">Use</div>
</div>
<div id="start">
  <div class="card">
    <h1>Big Top<br>of the Dead</h1>
    <p class="sub">Three floors, one bad yard, and a great many reanimated clowns.</p>
    <ul>
      <li><b>W A S D</b> move</li><li><b>Mouse</b> look</li>
      <li><b>Shift</b> sprint</li><li><b>Space</b> jump</li>
      <li><b>Left click</b> throw a pie</li><li><b>Right click</b> aim</li>
      <li><b>Ctrl</b> dodge roll</li><li><b>R</b> restock</li>
      <li><b>1–4 / wheel</b> switch weapon</li><li><b>E</b> hold to use</li>
      <li><b>`</b> tuning panel</li>
    </ul>
    <button id="go" disabled>Loading…</button>
    <p id="assetNote"></p>
  </div>
</div>`;

export class HUD {
  constructor(mount) {
    const wrap = document.createElement('div');
    wrap.innerHTML = MARKUP;
    while (wrap.firstChild) mount.appendChild(wrap.firstChild);

    // Cached: update() reads ~10 nodes every frame, and querySelector on
    // each was pure waste.
    this._nodes = new Map();
    this.el = id => {
      let node = this._nodes.get(id);
      if (!node) {
        node = mount.querySelector('#' + id);
        if (node) this._nodes.set(id, node);
      }
      return node;
    };
    this.touchRoot = this.el('touch');
    this.toastTimer = 0;

    this.el('weapons').innerHTML = WEAPON_ORDER.map((id, i) => `
      <div class="wslot" data-w="${id}">
        <span class="wkey">${i + 1}</span>
        <span class="wname">${WEAPONS[id].name}</span>
        <span class="wammo" id="ammo-${id}">0</span>
      </div>`).join('');
    this.slots = new Map(WEAPON_ORDER.map(id => [id, mount.querySelector(`.wslot[data-w="${id}"]`)]));
  }

  setObjective(title, hint) {
    this.el('objTitle').textContent = title;
    this.el('objHint').textContent = hint || '';
    const banner = this.el('objective');
    banner.classList.remove('flash');
    void banner.offsetWidth;          // restart the CSS animation
    banner.classList.add('flash');
  }

  setObjectiveStatus(status) {
    if (!status) return;
    this.el('objFill').style.width = `${Math.round((status.progress || 0) * 100)}%`;
    this.el('objDetail').textContent = status.detail || '';
  }

  setPrompt(prompt) {
    const el = this.el('prompt');
    if (!prompt) { el.classList.remove('on'); return; }
    el.classList.add('on');
    this.el('promptLabel').textContent = prompt.label;
    this.el('promptFill').style.width = `${Math.round(prompt.progress * 100)}%`;
  }

  victory(kills, elapsed, onRestart) {
    const start = this.el('start');
    start.style.display = 'flex';
    start.querySelector('h1').innerHTML = 'The show<br>is over';
    start.querySelector('.sub').textContent =
      `Out the front door in ${Math.floor(elapsed / 60)}m ${Math.round(elapsed % 60)}s, `
      + `${kills} of them splatted on the way.`;
    start.querySelector('ul').style.display = 'none';
    const btn = this.el('go');
    btn.disabled = false;
    btn.textContent = 'Again';
    btn.onclick = onRestart;
  }

  setProgress(fraction) {
    const btn = this.el('go');
    btn.textContent = `Loading… ${Math.round(fraction * 100)}%`;
  }

  ready(onStart, note) {
    const btn = this.el('go');
    btn.disabled = false;
    btn.textContent = 'Enter the house';
    btn.onclick = () => { this.el('start').style.display = 'none'; onStart(); };
    if (note) this.el('assetNote').textContent = note;
  }

  toast(message) {
    this.el('toast').textContent = message;
    this.el('toast').style.opacity = '1';
    this.toastTimer = 1.6;
  }

  update(dt, player) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) this.el('toast').style.opacity = '0';
    }

    this.el('healthFill').style.width = `${Math.max(0, player.health)}%`;
    this.el('heatFill').style.width = `${Math.min(100, player.heat)}%`;
    this.el('kills').textContent = player.kills;

    const active = player.weapons.weapon.id;
    for (const [id, slot] of this.slots) {
      slot.classList.toggle('active', id === active);
      const left = player.weapons.ammo[id];
      slot.querySelector('.wammo').textContent = Math.round(left);
      slot.classList.toggle('empty', left < 1);
    }

    const p = player.pos;
    const inHouse = Math.abs(p.x) < 10.3 && p.z > -7.3 && p.z < 7.3;
    const lvl = clamp(Math.floor((p.y + 0.5) / FLOOR_H), 0, 3);
    this.el('floorTag').textContent = inHouse ? FLOORS[lvl] : 'Backyard';
    this.el('stateTag').textContent = player.state;
    this.el('reticle').className = player.aiming ? 'aim' : '';
  }

  gameOver(kills, onRestart) {
    const start = this.el('start');
    start.style.display = 'flex';
    start.querySelector('h1').innerHTML = 'Curtains';
    start.querySelector('.sub').textContent =
      `You splatted ${kills} of them before the greasepaint ran out.`;
    start.querySelector('ul').style.display = 'none';
    const btn = this.el('go');
    btn.disabled = false;
    btn.textContent = 'Back to the house';
    btn.onclick = onRestart;
  }
}
