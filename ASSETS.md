# Character assets — sourcing and licences

## The short version

There is no rigged, animated, CC0 clown. I looked. What exists is either
AI-generated (Meshy — CC0 for gallery models, CC BY if you generate your own),
static and unrigged, or paid.

So the plan is: take a CC0 base humanoid, generate the clown parts, and drive
both with a CC0 animation library. The clown reads almost entirely through
silhouette accessories — nose, wig, ruff, conical hat, oversized shoes,
pompom buttons — which are simple enough to generate rather than model.

## What to download

| Asset | Source | Licence | Use |
|---|---|---|---|
| Universal Base Characters | quaternius.com/packs/universalbasecharacters.html | CC0 | Body mesh + humanoid rig, glTF and FBX |
| Universal Animation Library | quaternius.itch.io/universal-animation-library | CC0 | 120+ clips: locomotion, jumps, hits, deaths |
| Universal Animation Library 2 | quaternius.com/packs/universalanimationlibrary2.html | CC0 | 130+ more, **including zombie locomotion** |
| Modular Character Outfits — Fantasy | quaternius.com/packs/modularcharacteroutfitsfantasy.html | CC0 | 62 modular parts; the baggy pieces make good clown suits |
| Zombie Apocalypse Kit | quaternius.com | CC0 | Props and set dressing for the yard |
| KayKit Character Pack — Adventurers | github.com/KayKit-Game-Assets | CC0 | Alternative base if you prefer the chunkier proportions |
| Poly Haven | polyhaven.com | CC0 | HDRIs, PBR materials |
| ambientCG | ambientcg.com | CC0 | 1500+ PBR materials |
| Kenney | kenney.nl | CC0 | Props, furniture, UI |

Everything above is CC0 — public domain, commercial use, no attribution
required. Keep a CREDITS.md anyway; it costs nothing and saves you an
afternoon in two years when you can't remember where a mesh came from.

Two things to be careful about:

- **Mixamo** is free but requires an Adobe account and is *not* CC0. Its
  licence is fine for shipping a game, but it isn't public domain, and you
  can't redistribute the raw clips. Prefer the Quaternius library so the whole
  project stays CC0.
- **Poly Pizza** is mostly CC-BY, not CC0. Check per-model before using.

The big win of staying inside the Quaternius ecosystem: the base characters,
the outfits, and both animation libraries all share one humanoid rig. No
retargeting step. Clips drop straight onto the skeleton.

## Folder layout

```
public/assets/
  characters/
    clown-player.glb        # built by blender/build_clowns.py
    clown-zombie-a.glb
    clown-zombie-b.glb
    clown-zombie-c.glb
  animations/
    locomotion.glb          # idle, walk, run, sprint, strafes
    actions.glb             # jump, land, throw, hit, death
    zombie.glb              # shamble, lunge, stagger, collapse (UAL2)
  materials/
```

## Clip names the engine expects

`AnimationController.js` looks for these, and falls back down the list if a
name is missing, so partial libraries still work:

**Player** — `Idle`, `Walk`, `Run`, `Sprint`, `Jump_Start`, `Jump_Idle`,
`Jump_Land`, `Roll_Forward`, `Throw`, `Hit_A`, `Death_A`

**Zombie** — `Zombie_Idle`, `Zombie_Walk`, `Zombie_Run`, `Zombie_Attack`,
`Zombie_Hit`, `Zombie_Death`

Run `node tools/list-clips.mjs public/assets/animations/*.glb` after
downloading to print the actual names, then edit the alias table at the top of
`AnimationController.js` to match. Quaternius renames clips between pack
versions, so do this rather than trusting the list above.

## Scale

The Quaternius humanoid is roughly 1.8 units tall, which matches the capsule
in the engine (half-height 0.9). If you swap to KayKit, its adventurers are
closer to 1.6 — scale the model, not the collider, so the physics stays tuned.
