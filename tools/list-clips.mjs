#!/usr/bin/env node
/**
 * Print the animation clip names inside one or more GLB files.
 *
 *   node tools/list-clips.mjs public/assets/animations/*.glb
 *
 * Use the output to reconcile the ALIASES table in
 * src/characters/AnimationController.js — Quaternius renames clips between
 * pack releases, so the defaults there are a starting point, not gospel.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

function readGlbJson(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB (bad magic)');
  let offset = 12;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (type === 0x4e4f534a) {
      return JSON.parse(buf.subarray(start, start + length).toString('utf8'));
    }
    offset = start + length;
  }
  throw new Error('no JSON chunk');
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: node tools/list-clips.mjs <file.glb> [...]');
  process.exit(1);
}

for (const file of files) {
  try {
    const json = readGlbJson(file);
    const clips = (json.animations || []).map((a, i) => a.name || `(unnamed ${i})`);
    const bones = (json.nodes || []).filter(n => n.name).map(n => n.name);
    console.log(`\n${basename(file)} — ${clips.length} clip(s)`);
    for (const c of clips) console.log('  ' + c);
    if (!clips.length && bones.length) {
      console.log('  no clips; first nodes: ' + bones.slice(0, 12).join(', '));
    }
  } catch (err) {
    console.error(`${file}: ${err.message}`);
  }
}
console.log('');
