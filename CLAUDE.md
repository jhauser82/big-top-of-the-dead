# Big Top of the Dead

Browser third-person survival game. Three-story haunted house plus backyard,
clown player, five zombie-clown archetypes, four weapons, three-act campaign.

three.js + Rapier (physics) + Recast (navigation), built with Vite.
No framework, no ECS, plain ES modules.

## Commands

```bash
npm install
npm run dev          # http://localhost:5173
npm run build
npm run clips -- public/assets/animations/*.glb   # list glTF clip names

npm run audit        # static wiring checks, no browser, <1s
npm run test         # audit + Playwright smoke suite in headless Chromium
npm run test:ui      # same, with the Playwright inspector
```

**Run `npm run audit` after any change.** It is instantaneous and catches
broken imports, unknown audio cues, missing HUD methods, incomplete archetype
entries, and gameplay logic that has drifted onto the variable-delta frame
hook. It also enforces that the optional subsystems stay optional.

Load with `?debug` (or press backtick in dev) for the lil-gui tuning panel.

## Status — read this first

**As of the last session, this project had never been run.** It was written
in a chat interface. Expect real bugs on the first `npm run dev`.

`npm run test` exists precisely to answer that. It boots the real game in
headless Chromium and asserts that Rapier's WASM loads, all three floors are
solid, Recast builds both agent profiles and connects the staircases, every
weapon fires, and the campaign completes. Run it first. A failure there is a
far better starting point than reading code.

The one thing it cannot check is whether any of it is fun.

Dependency versions are pinned to what was current at scaffold time. Rapier
and Recast have both renamed result fields between minor releases — if
something returns undefined, check the shape before assuming the logic is
wrong. `PhysicsWorld.raycast` and `NavMesh.normalisePath` already accept more
than one shape for exactly this reason.

## Repository

- `main` is the only long-lived branch. CI runs audit + build, then the
  Playwright suite, on every push and PR, plus nightly for dependency drift.
- Pushing to `main` also deploys to GitHub Pages.
- `npm run check` (audit + build) is the fast pre-commit gate.
- Character GLBs are gitignored. The deployed build runs on procedural clowns.

## Architecture

```
src/
  core/        Engine (fixed 60Hz loop), Renderer, PostFX, Input, CameraRig,
               Audio, Debug
  physics/     PhysicsWorld (Rapier wrapper), NavMesh (Recast wrapper)
  world/       TextureForge, Level, Atmosphere, Interactables
  characters/  CharacterFactory, AnimationController, ProceduralClown
  gameplay/    Weapons, WeaponSystem, ZombieTypes, Director, Missions
  entities/    Player, Zombie, Projectiles, BlobShadow
  ui/          HUD
blender/       build_clowns.py — generates the character GLBs
tools/         list-clips.mjs
```

`main.js` wires everything. It is the only file that knows about all systems.

## Invariants — don't break these

**Fixed timestep.** Simulation and animation run at exactly 60Hz via
`Engine.addFixed`. Rendering, camera smoothing, and atmosphere use the real
frame delta via `addFrame`. Never put gameplay logic in `addFrame`.

**Graceful degradation.** Three subsystems are optional and the game must run
without them:
- Character GLBs missing → `CharacterFactory` falls back to procedural clowns
- `recast-navigation` missing → `NavMesh.build()` returns null, zombies steer directly
- `lil-gui` missing → debug panel silently does not mount

Never make any of these a hard requirement. A fresh clone with an empty
`public/assets/` must boot.

**Table-driven content.** Weapons, enemy archetypes, and heat tiers live in
plain objects in `src/gameplay/`. Adding a weapon or enemy should be a table
entry plus, at most, one case in a switch. Do not subclass `Zombie`.

**One seam per concern.** All audio goes through `audio.sfx('name')` — never
raw frequencies at call sites, so real samples can be swapped in later. All
physics queries go through `PhysicsWorld`. All pathing goes through `NavMesh`.

**Pooling.** Projectiles and spray droplets are pooled in `Projectiles.js`.
The confetti cannon fires 14 at once; per-shot allocation caused GC stutter.

## Deliberate design decisions

Don't "fix" these without a reason:

- Zombie damage lands on a mid-animation swipe frame, not on contact. Contact
  damage is cheaper but unreadable and makes the dodge roll pointless.
- The seltzer stream passes `stagger: false`. A continuous damage source that
  staggers locks targets in a permanent flinch.
- `staggerThreshold` on the strongman means chip damage doesn't interrupt him.
  That's his identity, not an oversight.
- Path following is discarded under 2.5m — close in, the corridor reads as
  robotic. Direct steering takes over.
- Tumbler dashes lock direction at wind-up so they can be sidestepped, and
  clear any active path. A homing dash would be unfair.
- `walkableClimb` is 0.4m in `NavMesh.js`. Lower and Recast reads the box
  stairs as cliffs and won't connect the floors.
- Repathing is budgeted to 4 per fixed step. Removing the budget makes the
  navmesh slower than the steering it replaced.

## Testing

`tools/audit.mjs` — dependency-free static checks. Extend it whenever you add
a table or a cross-module contract; a rule there costs nothing to run and
turns a ten-minute browser hunt into a one-second failure.

`tests/smoke.spec.js` — Playwright against the real dev server. Tests drive
the game through `window.__test` (exposed in dev and under `?debug`) rather
than synthesising input, so they exercise the same code paths a player does.
Add a hook there rather than reaching into internals from a test.

Headless Chromium needs SwiftShader for WebGL; the launch args are in
`playwright.config.js`. Without them every test dies at boot for reasons that
look nothing like the real cause. The fps assertion is a floor for "not
broken", not a performance target — it's software rendering.

## Conventions

- Plain ES modules, no TypeScript, no build-time codegen.
- Comments explain *why*, not *what*. Existing comments that give rationale
  are load-bearing documentation — keep them when refactoring.
- Reusable `THREE.Vector3` scratch objects prefixed `_` on class instances;
  don't allocate vectors inside update loops.
- New tunable numbers go in the relevant `gameplay/` table and get exposed in
  `core/Debug.js`.

## Known gaps

- Tests cover boot, physics, navigation, weapons, and campaign flow. Nothing
  covers the AI behaving sensibly, animation blending, or the look of it.
- No checkpoints — dying in act three restarts the campaign.
- Act two's 45-second defence is an untested guess.
- With GLBs present, all five archetypes share three meshes and differ only by
  scale, palette, and capsule. Distinct rigged models is a Blender job.
- The navmesh is built from every solid box including gravestones and fence
  posts. Tagging decorative solids would give a cleaner, faster build.
