# Big Top of the Dead

[![CI](https://github.com/USER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/USER/REPO/actions/workflows/ci.yml)
[![Deploy](https://github.com/USER/REPO/actions/workflows/deploy.yml/badge.svg)](https://github.com/USER/REPO/actions/workflows/deploy.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-e8b21c)](./LICENSE)

> Replace `USER/REPO` in these three badge URLs once the repo exists.

Third-person survival in a three-story haunted house and its backyard.
You are a clown. So is everything trying to eat you.

Browser, three.js, Rapier. No vehicles — the map is one building, so the
budget goes into rendering and animation instead of world streaming.

## Run it

```bash
npm install
npm run dev
```

It runs immediately with an empty `public/assets/` folder. Missing character
GLBs are not an error: `CharacterFactory` falls back to procedurally built
clowns, and the start screen says so. Drop the real assets in later and the
visuals upgrade with no code change.

## Get the real characters

1. Download the CC0 packs listed in [ASSETS.md](./ASSETS.md) — Quaternius
   Universal Base Characters, Universal Animation Library 1 and 2.
2. Put the base humanoid at `assets/source/Universal_Base_Character.glb`.
3. Build the cast:
   ```bash
   blender -b -P blender/build_clowns.py
   ```
   This generates the clown silhouette (nose, wig, ruff, hat, pompoms,
   oversized shoes), skins each piece to one bone of the existing rig,
   applies four palettes, and writes the GLBs into `public/assets/characters/`.
   The rig is untouched, so every animation clip still plays.
4. Copy the animation packs into `public/assets/animations/` as
   `locomotion.glb`, `actions.glb`, `zombie.glb`.
5. Check the clip names and reconcile them:
   ```bash
   npm run clips -- public/assets/animations/*.glb
   ```
   Paste anything that differs into the `ALIASES` table at the top of
   `src/characters/AnimationController.js`. Quaternius renames clips between
   pack releases, so the defaults are a starting point.

## Weapons

Four weapons, four different verbs — the point was to avoid four reskins of
the pie.

| Slot | Weapon | Verb | Feel |
|---|---|---|---|
| 1 | Cream pie | arc projectile | Reliable, slow, 3× headshots |
| 2 | Seltzer bottle | continuous cone | Shoves and slows a crowd, barely kills |
| 3 | Juggling clubs | returning fan of 3 | Punches through, refunds ammo if caught |
| 4 | Confetti cannon | spread burst of 14 | Huge knockback, tiny range, slow |

Switch with `1`–`4`, `Q`/`E`, or the scroll wheel. On touch there's a Swap
button, and Fire is press-and-hold so the stream weapon works.

Notes on the mechanics that aren't obvious from the table:

- **Seltzer** is a dot-product cone test against live zombies, not
  projectiles. At this entity count that's cheaper than spawning geometry and
  much easier to tune. It passes `stagger: false` to `Zombie.damage` — a
  continuous source would otherwise lock targets in a permanent flinch, which
  makes it strictly better than everything else.
- **Clubs** don't consume on hit. They punch through, bounce off walls, turn
  around after `returnAfter` seconds, and refund one ammo each if they reach
  you. Miss and you're down three.
- **Confetti** gets its close-range identity from `life: 0.85`, not from
  damage falloff. The pellets simply expire.

## Enemies

Designed backwards from the arsenal — each weapon needs a target it's clearly
the right answer to, or it's dead weight in the inventory.

| Type | HP | Threat | What answers it |
|---|---|---|---|
| Shambler | 3 | Baseline pressure | Pie, 3× headshots |
| Tot | 1 | Arrives in fours, fast, tiny | Confetti spread, seltzer cone |
| Tumbler | 2 | Telegraphed dash, turns badly | Knockback and slow, not accuracy |
| Strongman | 14 | Stagger-resistant, huge hit | Clubs — they punch through |
| Stiltwalker | 5 | 3.4m reach, head far above the crosshair | Deliberate aim |

One class, five behaviours, all driven by the table in
`src/gameplay/ZombieTypes.js`. A subclass per enemy would have meant five
copies of the steering and collision code drifting apart.

The mechanics that make them feel different aren't the stat lines:

- **`staggerThreshold`** is the strongman's whole identity. Chip damage
  doesn't interrupt him, so plinking away with pies achieves nothing — you
  have to commit to something that lands enough in one hit.
- **`headHeight`** is per-archetype, so the headshot test moves. A tot is
  nearly impossible to headshot; a stiltwalker demands you aim well above
  where the crosshair rests.
- **The tumbler's dash locks its direction at wind-up.** It commits, so it
  can be sidestepped. A homing dash would just be unfair, and dashing into a
  wall staggers it.
- **`knockbackResist` goes negative** for tots and tumblers, which sends them
  further than baseline. That's what makes the confetti cannon feel good.

Composition is driven by heat through four tiers — strongmen only appear once
the ringmaster is paying attention. `src/gameplay/Director.js` owns that,
spawns reinforcements at the yard perimeter so they walk in rather than
appearing beside you, and is deliberately separate from spawning mechanics so
mission scripting can drive the same knobs later.

## The campaign

Three acts across the one map, in `src/gameplay/Missions.js`.

1. **Restore the power** — a fuse box on each floor, which forces a full tour
   of the house before you know it well. Each one restored spikes heat by 22
   and drops a wave near you.
2. **Start the generator** — in the shed at the back of the yard, then hold
   that ground for 45 seconds. Heat pins to maximum and the Director switches
   to siege pacing: reinforcements every 3.2 seconds instead of scaling with
   heat.
3. **Get out the front** — back through the house to the gate, with two
   strongmen and a stiltwalker parked in the hallway so you can't just sprint
   it.

Interactables are hold-to-use (`E`, or the Use button on touch) rather than
tap. Holding is the cheapest way to make an objective cost something:
standing still for three seconds in a house full of clowns is a real
decision.

Stages are plain objects with `enter` / `update` / `status` / `isComplete`,
so a fourth act is a table entry. Missions direct the Director rather than
the reverse — the campaign decides what pressure means, escalation just
delivers it.

## Navigation

Recast, generated at boot from the level's solid geometry
(`src/physics/NavMesh.js`).

I'd originally said generate offline, and for an authored GLB level that's
right. This level is built in code, so there's nothing to pre-bake from.
Generation runs behind the loading screen in tens of milliseconds, and it
means the level and its navmesh can never drift apart.

**Two agent profiles get baked**, small (0.36m) and large (0.52m). One
navmesh at a single radius meant strongmen wedging in doorways their collider
doesn't actually fit through — which was the exact failure the navmesh was
added to fix. The archetype table picks its profile.

Details that took a couple of tries:

- **`walkableClimb` is 0.4m.** Our stairs are individual boxes rising 0.243m
  each. Below that value Recast reads them as a row of cliffs and refuses to
  connect the floors, and every zombie upstairs becomes an ornament.
- **Path following is a corridor, not a rail.** Recast supplies waypoints;
  steering, separation, and knockback still run exactly as before, so
  crowding behaves the same and a shoved zombie doesn't snap back to its line.
- **Under 2.5m the path is discarded** and steering goes direct. Close in, the
  corridor is noise and following it looks robotic.
- **Repathing is budgeted** to four per fixed step, with each zombie's timer
  randomised at spawn. Repathing everything every frame is the reliable way
  to make a navmesh slower than the steering it replaced.
- **Dashes clear the path.** A tumbler commits to a straight line; following
  a corridor mid-dash would make it homing, which is the thing that made it
  fair to begin with.

Spawn points are snapped with `closestPoint`, so nothing starts inside a wall
or hovering over the stairwell hole.

Not installed? `NavMesh.build()` returns null, zombies fall back to direct
steering, and the start screen says so — same degradation path as the
character GLBs.

## Sound

Fully synthesised, no sample files. Three layers:

- **sfx** — one-shots from oscillators plus a shared noise buffer, behind a
  compressor so the confetti cannon doesn't clip when six pellets land at once.
- **ambient** — bandpassed noise for wind, which muffles when you're indoors,
  plus timber creaks on an irregular timer. Regular ones read as a loop and
  kill the mood.
- **tension** — a detuned drone whose filter opens with heat, and a heartbeat
  that only appears above 35.

Everything calls `audio.sfx('name')` rather than raw frequencies, so that one
function is the whole seam for swapping in the CC0 packs through Howler
later. Archetype voices pitch inversely with mesh scale, so a tot shrieks and
a strongman groans off the same cue.

## Tuning

Press backtick in dev, or load with `?debug`, for a lil-gui panel over every
weapon stat, every enemy stat, the post-processing chain, moonlight, and fog
— plus FPS, draw calls, live enemy count, and heat. There's a "Spawn a…"
folder that drops any archetype in front of you, which is the fastest way to
test one matchup in isolation, a Mission folder with skip-to-next-act —
otherwise testing act three means playing act one twice every time — and a
Navigation folder that draws either navmesh and exposes the repath budget.
The readout shows how many zombies are actively following a path. Tune in the browser, then paste the values back into
`src/gameplay/Weapons.js`.

Weapon feel isn't something you reason your way to. It's twenty small
adjustments you only recognise as right when you fire the thing. The import
is dynamic and lil-gui is a dev dependency, so none of it ships.

## Tests

```bash
npm run audit     # static wiring checks, no browser, under a second
npm run test      # audit + Playwright smoke suite
```

The audit checks things that don't need a running game: broken imports,
audio cues that don't exist, HUD methods called but never defined, archetypes
missing required fields, nav profiles that aren't declared, and gameplay
logic that has drifted onto the variable-delta frame hook.

The smoke suite boots the real game in headless Chromium and asserts the
things only a running build can answer — Rapier's WASM loads, all three
floors are solid, Recast builds both agent profiles and connects the
staircases, a strongman upstairs can path down, every weapon fires and
consumes ammo, and all three acts complete.

CI runs both on push and nightly. The nightly run is the point: Rapier and
Recast have each renamed result fields between minor releases, and that kind
of breakage arrives without a commit.

## Layout

```
src/
  core/        Renderer, PostFX, Input, CameraRig, Audio, Engine
  physics/     PhysicsWorld (Rapier), NavMesh (Recast)
  world/       TextureForge, Level, Atmosphere, Interactables
  characters/  CharacterFactory, AnimationController, ProceduralClown
  gameplay/    Weapons, WeaponSystem, ZombieTypes, Director, Missions
  entities/    Player, Zombie, Projectiles, BlobShadow
  ui/          HUD
blender/       build_clowns.py
tools/         list-clips.mjs
```

The loop is fixed-step at 60Hz (`core/Engine.js`). Simulation and animation
state run on a constant dt; rendering, camera smoothing, and atmosphere run
on the real frame delta.

## Notes on the choices

**Rapier over a hand-rolled solver.** The kinematic character controller
handles autostep, slope limits, and ground snapping. Stairs, curbs, and
gravestones all work without special-casing, which is most of what a custom
AABB solver ends up doing badly.

**`rapier3d-compat`, not `rapier3d`.** The compat build inlines its WASM as
base64, so there's no `vite-plugin-wasm` and no top-level-await plugin. It
boots a little slower. Switch to the raw build when you want the last few
percent and are willing to own the plugin config.

**Hand-written post chain instead of `EffectComposer`.** Three passes: bright
pass, two-iteration separable Gaussian at half resolution, then a composite
doing bloom, radial chromatic aberration, a cold-shadow/warm-highlight split
tone, vignette, and grain. If you want SSAO or TAA later, replace
`core/PostFX.js` wholesale — nothing depends on its internals.

**One shadow-casting light.** The moon. The eight interior practicals are
unshadowed point lights, with blob shadows under characters doing the
grounding. Eight shadow maps would cost more than everything else combined.

**Projectiles are pooled.** The cannon fires fourteen at once and the
seltzer emits three droplets per fixed step. At those rates `new Mesh()` per
shot shows up as GC stutter within seconds. `MeshPool` in `Projectiles.js` is
thirty lines and removes it entirely.

**Damage on the swipe frame.** Zombies wind up, then swing, and the hit only
lands during a narrow window mid-animation. Contact damage is cheaper but
unreadable, and makes the dodge roll pointless.

## Next up

0. **Run it.** Everything below is speculation until `npm run test` passes on
   real hardware.

1. **Performance pass** — five archetypes at 26 alive is a lot of draw calls
   with procedural clowns, and the navmesh adds a WASM module to the bundle.
   Instancing, or just get the GLBs in.
2. **Checkpoints and settings** — sensitivity, volume, and act checkpoints.
   Nobody wants to replay act one to see act three.
3. **Real audio samples** — the synth layer is a floor, not a ceiling.
   `audio.sfx()` is the only function that needs to change.
4. **Off-mesh links** — Recast supports them, and the house has two windows
   and a stairwell hole that zombies could plausibly drop through.

## Known rough edges

- Weapon, enemy, and mission pacing are all first passes and almost certainly
  wrong. That's what the tuning panel is for.
- Act two's 45 seconds is a guess. It's the number most likely to be wrong.
- No checkpoints. Dying in act three sends you back to the start.
- With GLB assets present, all five archetypes share the same three meshes and
  differ only by scale, palette, and capsule. The procedural fallback actually
  differentiates them more, via the `build` proportions. Distinct rigged
  models per archetype is a Blender job, not a code one.
- `CapsuleGeometry` is feature-detected for the club mesh, since it only
  exists in three r142+.
- `filterClipToSubtree` guesses `Spine1` as the upper-body root. Check your
  rig's actual bone name and pass it to `playUpper`.
- Dependency versions are pinned to what was current when this was
  scaffolded. Bump and re-test — Rapier and Recast have both renamed result
  fields between minor releases, which is why `NavMesh.normalisePath` and the
  Rapier raycast wrapper both accept more than one result shape.
- The navmesh is generated from every solid box in the level, gravestones and
  fence posts included. Tagging decorative solids to exclude them would
  produce a cleaner mesh and a faster build.

## Deployment

Pushing to `main` builds and publishes to GitHub Pages
(`.github/workflows/deploy.yml`). Enable it once under
**Settings → Pages → Source → GitHub Actions**.

`vite.config.js` sets `base: './'`, so relative asset paths resolve on a
project site without hardcoding the repo name into the config.

The deployed build has no character GLBs — they're gitignored, since the CC0
packs are large and freely re-downloadable. The published game therefore runs
on procedural clowns, which is a reasonable public demo. If you'd rather ship
the real cast, delete those two lines from `.gitignore` and use Git LFS:

```bash
git lfs install
git lfs track "*.glb"
git add .gitattributes
```

## Licence

Project code is MIT (see [LICENSE](./LICENSE)). Swap it if you'd rather not
allow commercial reuse — MIT is a default here, not a considered decision.

All third-party assets referenced in [ASSETS.md](./ASSETS.md) are CC0, so
nothing in the asset pipeline constrains how you license your own work.
