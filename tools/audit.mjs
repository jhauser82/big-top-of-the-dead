#!/usr/bin/env node
/**
 * Static audit. No dependencies, no browser, runs in well under a second.
 *
 * These are the checks I was running by hand every time a system landed —
 * broken relative imports, audio cues that don't exist, HUD methods called
 * from elsewhere that were never defined. None of them need a running game,
 * and all of them are the kind of mistake that costs ten minutes to find in
 * a browser and one second to find here.
 *
 * It catches wiring, not behaviour. `npm run test` is what catches behaviour.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const problems = [];
const notes = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith('.js')) out.push(p);
  }
  return out;
}

const files = walk(SRC);
const read = f => readFileSync(f, 'utf8');
const rel = f => relative(ROOT, f);
const sources = new Map(files.map(f => [f, read(f)]));

/**
 * Comments describing a bug will match a rule looking for that bug — the
 * first version of the `new X ?` rule flagged the comment explaining why the
 * `new X ?` pattern is wrong. Pattern rules run against code only.
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}
const code = new Map(files.map(f => [f, stripComments(read(f))]));

// ── 1. relative imports resolve ──────────────────────────────────────────
for (const [file, src] of sources) {
  for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    const target = resolve(dirname(file), m[1]);
    if (!existsSync(target)) problems.push(`${rel(file)} imports missing ${m[1]}`);
  }
}

// ── 2. every audio.sfx() cue exists in the Audio switch ──────────────────
const audioSrc = read(join(SRC, 'core/Audio.js'));
const cues = new Set([...audioSrc.matchAll(/case '(\w+)':/g)].map(m => m[1]));
for (const [file, src] of code) {
  if (file.endsWith('Audio.js')) continue;
  for (const m of src.matchAll(/\.sfx\('(\w+)'/g)) {
    if (!cues.has(m[1])) problems.push(`${rel(file)} plays unknown cue "${m[1]}"`);
  }
}

// ── 3. HUD methods called elsewhere are defined ──────────────────────────
const hudSrc = read(join(SRC, 'ui/HUD.js'));
const hudMethods = new Set([...hudSrc.matchAll(/^  (\w+)\(/gm)].map(m => m[1]));
for (const [file, src] of code) {
  if (file.endsWith('HUD.js')) continue;
  for (const m of src.matchAll(/hud\??\.(\w+)\(/g)) {
    if (!hudMethods.has(m[1])) problems.push(`${rel(file)} calls hud.${m[1]}() which is undefined`);
  }
}

// ── 4. HUD DOM ids referenced by el() exist in the markup ────────────────
const markupIds = new Set([...hudSrc.matchAll(/id="([\w-]+)"/g)].map(m => m[1]));
for (const m of hudSrc.matchAll(/this\.el\('([\w-]+)'\)/g)) {
  if (!markupIds.has(m[1])) problems.push(`HUD.js references missing DOM id #${m[1]}`);
}

// ── 5. every archetype declares the fields Zombie reads ──────────────────
const typesSrc = read(join(SRC, 'gameplay/ZombieTypes.js'));
const REQUIRED = ['hp', 'speedRange', 'scaleRange', 'capsule', 'headHeight', 'aggroRange',
                  'chaseTurnRate', 'alertTime', 'separation', 'knockbackResist',
                  'staggerThreshold', 'soakResist', 'corpseLinger', 'attack', 'navProfile'];
const blocks = typesSrc.split(/\n  (\w+): \{/).slice(1);
for (let i = 0; i < blocks.length; i += 2) {
  const [id, body] = [blocks[i], blocks[i + 1]];
  for (const field of REQUIRED) {
    if (!new RegExp(`\\b${field}:`).test(body)) {
      problems.push(`archetype "${id}" is missing ${field}`);
    }
  }
}

// ── 6. nav profiles named by archetypes actually exist ───────────────────
const navSrc = read(join(SRC, 'physics/NavMesh.js'));
const navProfiles = new Set(
  [...navSrc.matchAll(/^  (\w+): \{ radius/gm)].map(m => m[1]),
);
for (const m of typesSrc.matchAll(/navProfile: '(\w+)'/g)) {
  if (!navProfiles.has(m[1])) problems.push(`unknown nav profile "${m[1]}"`);
}

// ── 7. weapon table completeness ─────────────────────────────────────────
const weaponSrc = read(join(SRC, 'gameplay/Weapons.js'));
const orderMatch = weaponSrc.match(/WEAPON_ORDER = \[([^\]]+)\]/);
const order = orderMatch ? [...orderMatch[1].matchAll(/'(\w+)'/g)].map(m => m[1]) : [];
for (const id of order) {
  if (!new RegExp(`^  ${id}: \\{`, 'm').test(weaponSrc)) {
    problems.push(`WEAPON_ORDER lists "${id}" with no definition`);
  }
  if (!cues.has(id) && id !== 'confetti') {
    notes.push(`weapon "${id}" has no matching audio cue (falls through silently)`);
  }
}

// ── 8. gameplay logic must not sit on the variable-delta frame hook ──────
const mainSrc = read(join(SRC, 'main.js'));
const frameBlock = mainSrc.slice(mainSrc.indexOf('engine.addFrame'));
for (const forbidden of ['player.update(', 'z.update(', 'physics.step(', 'missions.update(']) {
  if (frameBlock.includes(forbidden)) {
    problems.push(`${forbidden} is inside addFrame — gameplay must be fixed-step`);
  }
}

// ── 9. optional subsystems stay optional ─────────────────────────────────
for (const [name, file] of [
  ['recast-navigation', 'physics/NavMesh.js'],
  ['lil-gui', 'core/Debug.js'],
]) {
  const src = read(join(SRC, file));
  if (!/catch\s*(\{|\()/.test(src) || !src.includes('await import(')) {
    problems.push(`${file} must import ${name} dynamically inside try/catch (graceful degradation)`);
  }
}

// ── 10. `new X ? a : b` is a construction, not a feature detect ──────────
for (const [file, src] of code) {
  for (const m of src.matchAll(/new\s+([\w.]+)\s*\n?\s*\?/g)) {
    problems.push(
      `${rel(file)} writes \`new ${m[1]} ?\` — that constructs instead of `
      + 'testing the reference, and throws when the symbol is missing',
    );
  }
}

// ── 11. player state must not be compared to string literals ─────────────
const playerSrc = read(join(SRC, 'entities/Player.js'));
const states = [...playerSrc.matchAll(/^  (\w+): '(\w+)',/gm)].map(m => m[2]);
for (const [file, src] of code) {
  if (file.endsWith('Player.js') || file.endsWith('ProceduralClown.js')
      || file.endsWith('AnimationController.js') || file.endsWith('Debug.js')) continue;
  for (const m of src.matchAll(/player\.state\s*[!=]==\s*'(\w+)'/g)) {
    if (states.includes(m[1])) {
      problems.push(`${rel(file)} compares player.state to '${m[1]}' — import ST instead`);
    }
  }
}

// ── 12. config fields nothing reads ──────────────────────────────────────
for (const table of ['gameplay/Weapons.js', 'gameplay/ZombieTypes.js']) {
  const src = read(join(SRC, table));
  const fields = new Set([...src.matchAll(/^    (\w+): /gm)].map(m => m[1]));
  const consumers = [...sources].filter(([f]) => !f.endsWith(table.split('/').pop()));
  for (const field of fields) {
    if (['id', 'name', 'blurb'].includes(field)) continue;
    const seen = consumers.some(([, body]) =>
      new RegExp(`\\.${field}\\b`).test(body)) || new RegExp(`\\b${field}\\b`).test(read(join(SRC, 'core/Debug.js')));
    if (!seen) notes.push(`${table}: "${field}" is never read — stale config lies about behaviour`);
  }
}

// ── report ────────────────────────────────────────────────────────────────
for (const n of notes) console.log(`note    ${n}`);
for (const p of problems) console.error(`PROBLEM ${p}`);

console.log(
  `\n${files.length} files audited — `
  + `${problems.length} problem(s), ${notes.length} note(s)`,
);
process.exit(problems.length ? 1 : 0);
