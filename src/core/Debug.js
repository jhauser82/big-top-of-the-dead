import { WEAPONS, WEAPON_ORDER } from '../gameplay/Weapons.js';
import { ZOMBIE_TYPES, TYPE_ORDER } from '../gameplay/ZombieTypes.js';

/**
 * Live tuning panel. Toggle with backtick, or load with ?debug to start open.
 *
 * Weapon feel is not something you can reason your way to — it's twenty
 * small adjustments you only recognise as right when you fire the thing.
 * Editing constants and reloading turns that into an evening. This turns it
 * into twenty minutes.
 *
 * lil-gui is a dev dependency and the import is dynamic, so it is tree-shaken
 * out of production builds entirely.
 */
export async function mountDebug({ postfx, player, atmosphere, engine, director, missions, nav, scene }) {
  const wanted = new URLSearchParams(location.search).has('debug');
  if (!import.meta.env.DEV && !wanted) return null;

  let GUI;
  try {
    ({ GUI } = await import('lil-gui'));
  } catch {
    console.info('[debug] lil-gui not installed — run `npm i -D lil-gui`');
    return null;
  }

  const gui = new GUI({ title: 'Big Top — tuning', width: 300 });
  gui.domElement.style.zIndex = '30';
  if (!wanted) gui.close();

  // ── weapons ────────────────────────────────────────────────────────────
  const weaponsFolder = gui.addFolder('Weapons');
  for (const id of WEAPON_ORDER) {
    const w = WEAPONS[id];
    const f = weaponsFolder.addFolder(w.name);

    if (w.kind === 'stream') {
      f.add(w, 'dps', 0, 12, 0.1);
      f.add(w, 'range', 1, 20, 0.5);
      f.add(w, 'coneDegrees', 4, 80, 1);
      f.add(w, 'knockback', 0, 40, 0.5);
      f.add(w, 'slowFactor', 0.05, 1, 0.05);
      f.add(w, 'slowDuration', 0, 5, 0.1);
      f.add(w, 'drainPerSecond', 1, 90, 1);
      f.add(w, 'regenPerSecond', 0, 40, 1);
    } else {
      f.add(w, 'damage', 0, 12, 0.1);
      f.add(w, 'headshotMult', 1, 8, 0.1);
      f.add(w, 'cooldown', 0.03, 3, 0.01);
      f.add(w, 'speed', 4, 70, 1);
      f.add(w, 'spread', 0, 0.5, 0.005);
      f.add(w, 'gravityScale', 0, 2, 0.01);
      f.add(w, 'knockback', 0, 40, 0.5);
      f.add(w, 'life', 0.1, 8, 0.05);
      f.add(w, 'radius', 0.2, 3, 0.05);
      f.add(w, 'trauma', 0, 1, 0.01);
      if (w.count !== undefined) f.add(w, 'count', 1, 30, 1);
      if (w.returnAfter !== undefined) {
        f.add(w, 'returnAfter', 0.05, 3, 0.05);
        f.add(w, 'returnSpeed', 4, 60, 1);
        f.add(w, 'catchRadius', 0.3, 3, 0.05);
      }
    }
    f.close();
  }
  weaponsFolder.close();

  // ── enemies ────────────────────────────────────────────────────────────
  const enemies = gui.addFolder('Enemies');
  for (const id of TYPE_ORDER) {
    const t = ZOMBIE_TYPES[id];
    const f = enemies.addFolder(t.name);
    f.add(t, 'hp', 1, 40, 1);
    f.add(t.speedRange, '0', 0.3, 10, 0.1).name('speed min');
    f.add(t.speedRange, '1', 0.3, 12, 0.1).name('speed max');
    f.add(t, 'aggroRange', 3, 40, 0.5);
    f.add(t, 'headHeight', 0, 3, 0.05);
    f.add(t, 'knockbackResist', -1, 1, 0.05);
    f.add(t, 'staggerThreshold', 0, 10, 0.5);
    f.add(t, 'soakResist', 0, 1, 0.05);
    f.add(t, 'chaseTurnRate', 0.5, 14, 0.1);
    f.add(t.attack, 'damage', 0, 60, 1).name('attack damage');
    f.add(t.attack, 'range', 0.5, 6, 0.1).name('attack range');
    f.add(t.attack, 'cooldown', 0.2, 6, 0.1).name('attack cooldown');
    if (t.dash) {
      f.add(t.dash, 'speed', 4, 30, 0.5).name('dash speed');
      f.add(t.dash, 'cooldown', 0.5, 10, 0.1).name('dash cooldown');
      f.add(t.dash, 'windUp', 0.05, 1.5, 0.05).name('dash tell');
    }
    f.close();
  }
  enemies.close();

  // ── look ───────────────────────────────────────────────────────────────
  const look = gui.addFolder('Post-processing');
  const u = postfx.grade.uniforms;
  look.add(u.uBloom, 'value', 0, 2, 0.01).name('bloom');
  look.add(u.uVig, 'value', 0, 1.5, 0.01).name('vignette');
  look.add(u.uGrain, 'value', 0, 0.3, 0.005).name('grain');
  look.add(u.uAber, 'value', 0, 3, 0.05).name('aberration');
  look.add(u.uSat, 'value', 0, 2, 0.01).name('saturation');
  look.add(postfx.bright.uniforms.threshold, 'value', 0, 2, 0.01).name('bloom threshold');
  look.close();

  const spawnFolder = gui.addFolder('Spawn a…');
  for (const id of TYPE_ORDER) {
    spawnFolder.add({
      [id]: () => director?.spawn(id, [
        player.pos.x + (Math.random() - 0.5) * 8, 0,
        player.pos.z + 6 + Math.random() * 4,
      ]),
    }, id).name(ZOMBIE_TYPES[id].name);
  }
  spawnFolder.close();

  if (missions) {
    const m = gui.addFolder('Mission');
    m.add({ skip: () => missions.advance() }, 'skip').name('skip to next act');
    m.add({ heat: () => { player.heat = 100; } }, 'heat').name('max heat');
    m.close();
  }

  if (nav) {
    const n = gui.addFolder('Navigation');
    n.add({ small: () => nav.helper('small', scene) }, 'small').name('show navmesh (small)');
    n.add({ large: () => nav.helper('large', scene) }, 'large').name('show navmesh (large)');
    n.add(nav, 'budgetPerStep', 1, 20, 1).name('repaths / step');
    n.close();
  }

  const world = gui.addFolder('World');
  world.add(atmosphere.moon, 'intensity', 0, 6, 0.05).name('moonlight');
  world.add(atmosphere.scene.fog, 'density', 0, 0.08, 0.001).name('fog density');
  world.close();

  // ── readouts ───────────────────────────────────────────────────────────
  const stats = gui.addFolder('Readout');
  const readout = { fps: 0, weapon: '', ammo: 0, state: '', draws: 0, alive: 0, heat: 0, pathing: 0 };
  stats.add(readout, 'fps').listen().disable();
  stats.add(readout, 'weapon').listen().disable();
  stats.add(readout, 'ammo').listen().disable();
  stats.add(readout, 'state').listen().disable();
  stats.add(readout, 'draws').listen().disable();
  stats.add(readout, 'alive').listen().disable();
  stats.add(readout, 'heat').listen().disable();
  stats.add(readout, 'pathing').listen().disable();
  stats.open();

  let frames = 0, acc = 0;
  engine.addFrame(dt => {
    frames++; acc += dt;
    if (acc >= 0.5) {
      readout.fps = Math.round(frames / acc);
      frames = 0; acc = 0;
      readout.draws = postfx.r.gl.info.render.calls;
    }
    readout.weapon = player.weapons.weapon.name;
    readout.ammo = Math.round(player.weapons.ammoLeft);
    readout.state = player.state;
    readout.alive = player.zombies ? player.zombies.filter(z => !z.dead).length : 0;
    readout.heat = Math.round(player.heat);
    readout.pathing = player.zombies
      ? player.zombies.filter(z => z.path && !z.dead).length : 0;
  });

  addEventListener('keydown', e => {
    if (e.code === 'Backquote') {
      e.preventDefault();
      gui._closed ? gui.open() : gui.close();
    }
  });

  return gui;
}
