import * as THREE from 'three';
import { Renderer } from './core/Renderer.js';
import { PostFX } from './core/PostFX.js';
import { Input } from './core/Input.js';
import { CameraRig } from './core/CameraRig.js';
import { Audio } from './core/Audio.js';
import { Engine } from './core/Engine.js';
import { PhysicsWorld } from './physics/PhysicsWorld.js';
import { NavMesh } from './physics/NavMesh.js';
import { buildMaterials } from './world/TextureForge.js';
import { Level, FLOOR_H } from './world/Level.js';
import { Atmosphere } from './world/Atmosphere.js';
import { CharacterFactory } from './characters/CharacterFactory.js';
import { Player, SPEED } from './entities/Player.js';
import { Zombie } from './entities/Zombie.js';
import { Projectiles } from './entities/Projectiles.js';
import { WeaponSystem } from './gameplay/WeaponSystem.js';
import { mountDebug } from './core/Debug.js';
import { Director } from './gameplay/Director.js';
import { createCampaign } from './gameplay/Missions.js';
import { InteractionSystem } from './world/Interactables.js';
import { ZOMBIE_TYPES } from './gameplay/ZombieTypes.js';
import { HUD } from './ui/HUD.js';

const MAX_ZOMBIES = 26;
const ZOMBIE_VARIANTS = ['clown-zombie-a', 'clown-zombie-b', 'clown-zombie-c'];

async function boot() {
  const mount = document.getElementById('app');

  const renderer = new Renderer(mount);
  const postfx = new PostFX(renderer);
  const hud = new HUD(mount);
  const input = new Input(renderer.gl.domElement, hud.touchRoot);
  const audio = new Audio();

  const physics = await PhysicsWorld.create();
  const camera = new CameraRig(renderer.camera, physics);

  const mats = buildMaterials();
  const level = new Level(renderer.scene, physics, mats);
  const atmosphere = new Atmosphere(renderer.scene, mats, level.windows);

  hud.setProgress(0.05);
  const nav = await NavMesh.build(level.navMeshes, f => hud.setProgress(0.05 + f * 0.25));

  const factory = new CharacterFactory({ basePath: import.meta.env.BASE_URL + 'assets/' });
  await factory.preload(
    ['clown-player', ...ZOMBIE_VARIANTS],
    ['locomotion', 'actions', 'zombie'],
    f => hud.setProgress(0.3 + f * 0.7),
  );

  const projectiles = new Projectiles({ scene: renderer.scene, physics, audio });
  projectiles.onPickup = msg => hud.toast(msg);

  const weapons = new WeaponSystem({ projectiles, audio, camera, hud });

  const player = new Player({
    scene: renderer.scene,
    physics,
    character: factory.spawn('clown-player', { profile: 'player' }),
    input, camera, audio, hud, projectiles, weapons,
    blobTexture: mats.tex.blob,
  });

  const zombies = [];

  /**
   * Archetype -> mesh. With GLBs present we pick a variant and let the
   * archetype's scale and capsule do the differentiating; without them the
   * procedural clown takes the full build spec, so the five types are
   * visually distinct even on a fresh clone with no assets.
   */
  const spawnZombie = (typeId, position) => {
    if (zombies.length >= MAX_ZOMBIES) return null;
    const type = ZOMBIE_TYPES[typeId];
    const variant = Math.floor(Math.random() * ZOMBIE_VARIANTS.length);
    const palette = type.palette[Math.floor(Math.random() * type.palette.length)];

    // Snap the spawn onto walkable ground so nothing starts inside a wall or
    // hovering over the stairwell hole.
    const grounded = nav?.closestPoint(type.navProfile, {
      x: position[0], y: position[1] + 0.5, z: position[2],
    });
    const at = grounded ? [grounded.x, grounded.y, grounded.z] : position;

    const z = new Zombie({
      scene: renderer.scene,
      physics,
      nav,
      character: factory.spawn(ZOMBIE_VARIANTS[variant], {
        profile: 'zombie', variant, skin: palette, build: type.build,
      }),
      blobTexture: mats.tex.blob,
      position: at,
      audio,
      typeId,
    });
    zombies.push(z);
    return z;
  };

  const director = new Director({ spawn: spawnZombie, level, maxAlive: MAX_ZOMBIES, hud });
  director.populate();

  for (const [x, y, z, kind] of [
    [-6, 0, -4, 'pie'], [7, 0, 5, 'seltzer'], [2, 0, -5, 'confetti'],
    [-4, FLOOR_H, 3, 'health'], [6, FLOOR_H, -4, 'clubs'], [-8, FLOOR_H, 5, 'pie'],
    [0, FLOOR_H * 2, 0, 'health'], [-7, FLOOR_H * 2, -5, 'clubs'],
    [5, FLOOR_H * 2, 4, 'pie'],
    [0, 0, 17, 'confetti'], [-12, 0, 9, 'health'], [11, 0, 23, 'pie'],
    [-9, 0, 25, 'seltzer'], [13, 0, 13, 'clubs'], [-3, 0, 27, 'confetti'],
  ]) projectiles.addPickup(x, y, z, kind);

  const interactions = new InteractionSystem();

  const engine = new Engine({ hz: 60 });

  const missions = createCampaign({
    scene: renderer.scene,
    interactions, director, hud, audio, player, level,
    onVictory: () => {
      engine.pause();
      document.exitPointerLock?.();
      hud.victory(player.kills, engine.elapsed, () => location.reload());
    },
  });

  player.onDeath = () => {
    engine.pause();
    document.exitPointerLock?.();
    hud.gameOver(player.kills, () => location.reload());
  };

  function onKill(zombie, headshot) {
    if (headshot) hud.toast('Right in the greasepaint');
    if (!zombie) return;
    player.registerKill();
    // Escalation lives in the Director now; kills only feed it heat.
    director.onKill(player);
  }

  weapons.onKill = onKill;

  engine.addFixed(dt => {
    const [dx, dy] = input.takeLook();
    if (dx || dy) camera.look(dx, dy, player.aiming);

    nav?.beginStep();           // reset the per-step repath budget
    player.zombies = zombies;   // the stream weapon needs the live list
    player.update(dt);
    for (const z of zombies) z.update(dt, player, zombies);
    projectiles.update(dt, engine.elapsed, player, zombies, onKill);

    for (let i = zombies.length - 1; i >= 0; i--) {
      if (zombies[i].expired) { zombies[i].dispose(); zombies.splice(i, 1); }
    }

    director.update(dt, player, zombies.filter(z => !z.dead).length);
    hud.setPrompt(interactions.update(dt, player, input.interactHeld));
    missions.update(dt);

    physics.step();
  });

  engine.addFrame((dt, now) => {
    camera.update(dt, player.pos, player.vel, player.aimBlend, SPEED.sprint);
    atmosphere.update(dt, now * 0.001);
    const inside = Math.abs(player.pos.x) < 10.3 && player.pos.z > -7.3 && player.pos.z < 7.3;
    audio.update(dt, player.heat, inside);
    hud.update(dt, player);
    postfx.render(now, player.hurtFlash);
  });

  const notes = [];
  if (!factory.hasAssets) {
    notes.push('Running on procedural clowns — drop the CC0 GLBs into public/assets/ for the rigged cast.');
  }
  if (!nav) notes.push('No navmesh: install recast-navigation for pathfinding.');
  const note = notes.length ? `${notes.join(' ')} See README.` : null;

  await mountDebug({ postfx, player, atmosphere, engine, director, missions, nav,
                     scene: renderer.scene });

  hud.ready(() => {
    audio.unlock();
    renderer.gl.domElement.requestPointerLock?.();
    engine.start();
  }, note);

  engine.mount();

  // Handy in the console while reconciling clip names.
  window.__game = { player, zombies, factory, physics, nav, engine, camera, director, weapons, missions };

  // Test surface. Exposed in dev and under ?debug only — the smoke suite
  // drives the real game through these rather than simulating input, so it
  // exercises the same code paths a player does.
  if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
    window.__test = {
      get running() { return engine.running; },
      get elapsed() { return engine.elapsed; },
      get alive() { return zombies.filter(z => !z.dead).length; },
      get pathing() { return zombies.filter(z => z.path && !z.dead).length; },
      get act() { return missions.complete ? 'complete' : missions.stage?.id; },
      get grounded() { return player.grounded; },
      get health() { return player.health; },
      navProfiles: () => (nav ? [...nav.profiles.keys()] : []),
      hasAssets: () => factory.hasAssets,
      ammo: () => ({ ...weapons.ammo }),
      selectWeapon: i => weapons.select(i),
      fire: () => weapons.fire(player),
      skipAct: () => missions.advance(),
      spawn: (typeId, at) => director.spawn(typeId, at, 1),
      teleport: (x, y, z) => {
        player.pos.set(x, y, z);
        player.vel.set(0, 0, 0);
        physics.warpCharacter(player.body, player.pos);
      },
      playerY: () => player.pos.y,
    };
  }

  window.__booted = true;
}

boot().catch(err => {
  window.__bootError = String(err?.stack || err);
  console.error(err);
  document.getElementById('app').innerHTML =
    `<pre style="color:#f2e8d5;padding:24px;font:13px monospace">Failed to start:\n\n${err.stack || err}</pre>`;
});
