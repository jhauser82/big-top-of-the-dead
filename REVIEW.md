# Code review — findings

Full read of all 27 source files. Ten findings, grouped by whether they
break, mislead, or just cost. Everything in the first two groups is fixed;
the last item is flagged but not changed.

## Would have broken at runtime

**1. `CapsuleGeometry` "feature detect" wasn't one.**
`src/entities/Projectiles.js`

```js
club: new THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(...) : new THREE.CylinderGeometry(...)
```

`new THREE.CapsuleGeometry` *calls* the constructor. On a three version where
`CapsuleGeometry` exists it silently allocates a throwaway geometry at module
load; on one where it doesn't, it throws `TypeError` before the game starts —
the precise opposite of the fallback it was written to provide. Testing the
reference (`THREE.CapsuleGeometry ? …`) is the fix.

I wrote this one defending against exactly the version-drift problem it would
have caused.

## Wrong behaviour

**2. The seltzer bottle didn't shove.**
`src/gameplay/WeaponSystem.js`

```js
knockback: w.knockback * dt * falloff * 6
```

`Zombie.knock` is a velocity in units/sec, not an impulse, and `damage()`
overwrites it each call rather than accumulating. So `knockback: 9` in the
table became a sustained ~0.9 u/s push against a 2.9 u/s chase. The weapon
described in the README as "shoves and slows a crowd" only slowed. Damage is
per-second and correctly scales with `dt`; the push is a velocity and must
not. Now `w.knockback * falloff`.

**3. The victory clock counted menu time.**
`src/core/Engine.js`

`elapsed` accumulated every frame from page load, including however long you
sat on the start screen, and `hud.victory()` reports it as your run time. Now
resets in `start()` and only advances while running.

**4. Queued fire went stale on death.**
`src/entities/Player.js`

`input.fireQueued` is consumed after the `DEAD` early-return, so a click
during the death frame survives until the next read. Harmless today because
death reloads the page — a real bug the moment checkpoints land, which is the
next feature on the list. Drained in the dead branch now.

**5. Zombie separation compared a squared distance to a linear value.**
`src/entities/Zombie.js`

`if (d2 < sep)` with `separation: 1.5` meant 1.22m, not 1.5m. For the
strongman (`2.2` → 1.48m against a 0.48m capsule radius) that's almost no
personal space, which is part of why heavies were expected to jam in
doorways. Now squared properly. **This changes crowding behaviour** — retune
if they feel too spread out.

## Misleading or wasteful

**6. Dead config.** Every weapon still carried a `sound: { freq, dur, type,
gain }` block. Nothing has read it since the audio refactor moved to named
cues. Stale config is worse than no config: it reads as the source of truth
for a behaviour it no longer controls. Removed.

**7. A `Set` per projectile.** `Projectiles.spawn` allocated a `hits` Set for
every shot — 14 per confetti burst, which undercuts the pooling that exists
specifically to stop per-shot allocation. Only returning throws can hit the
same target twice, so only clubs get one now.

**8. `querySelector` per readout, per frame.** `HUD.el()` hit the DOM on every
call and `update()` makes about ten. Cached.

**9. String coupling across modules.** `WeaponSystem` compared
`player.state !== 'roll'` against a literal rather than importing `ST`. A typo
there fails silently and no tool catches it. Now imports the enum.

## Flagged, not changed

**10. The navmesh is generated over a 96×96 ground plate.** The ground
collider extends far past the fence, so Recast bakes walkable surface across
the whole plane — slower generation, and wandering zombies can path well
outside the play area. The fix is either a smaller ground collider or a
`navExclude` flag on decorative and out-of-bounds solids, which would also
drop the gravestones and fence posts from the input. It's a real improvement
but it changes level geometry, and I'd rather you saw it running first.

## Audit rules added

Three of these were mechanically detectable, so `tools/audit.mjs` now catches
the class rather than the instance:

- `new X ?` used as a feature detect
- `player.state` compared against a string literal
- config fields in the gameplay tables that nothing reads

One wrinkle worth knowing: the first version of the `new X ?` rule flagged the
comment I'd written explaining why `new X ?` is wrong. Pattern rules now run
against comment-stripped source.

## What this review could not find

Every one of these is a reasoning error visible in the text. None of them
answer whether Recast connects the staircases, whether the Rapier autostep
values suit these capsule sizes, or whether any of it is fun. Three of the
ten (2, 5, and 10) are balance-adjacent and their real severity only shows up
in play.
