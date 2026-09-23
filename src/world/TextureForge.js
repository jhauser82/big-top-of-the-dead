import * as THREE from 'three';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function hash2(x, y, s) {
  const n = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453;
  return n - Math.floor(n);
}

/** Value noise on a wrapping integer lattice, so the tile has no seam. */
function vnoise(x, y, s, period) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const w = (a, b) => hash2(((a % period) + period) % period, ((b % period) + period) % period, s);
  return w(xi, yi) * (1 - u) * (1 - v)
       + w(xi + 1, yi) * u * (1 - v)
       + w(xi, yi + 1) * (1 - u) * v
       + w(xi + 1, yi + 1) * u * v;
}

function fbm(x, y, s, octaves, period) {
  let sum = 0, amp = 0.5, f = 1, p = period, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += vnoise(x * f, y * f, s + i * 13, p) * amp;
    norm += amp; amp *= 0.5; f *= 2; p *= 2;
  }
  return sum / norm;
}

const SIZE = 128;

function forge(fn, repeat, srgb) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = SIZE;
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(SIZE, SIZE);
  const d = img.data;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const o = (y * SIZE + x) * 4;
      const c = fn(x / SIZE, y / SIZE);
      d[o] = c[0]; d[o + 1] = c[1]; d[o + 2] = c[2]; d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function radial(inner, mid, stop) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, inner);
  grd.addColorStop(stop, mid);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(cv);
}

/**
 * Procedural stand-in materials. Every surface gets an albedo and a matching
 * roughness map so it breaks up under raking light instead of reading flat.
 * Swap individual entries for ambientCG scans as you get them — the material
 * keys are what Level.js references, so nothing else changes.
 */
export function buildMaterials() {
  const TEX = {
    woodC: forge((u, v) => {
      const grain = fbm(u * 4, v * 34, 11, 4, 8);
      const seam = Math.abs(((v * 6) % 1) - 0.5) < 0.035 ? 0.55 : 1;
      const k = (0.6 + grain * 0.5) * seam;
      return [96 * k, 68 * k, 47 * k];
    }, 6, true),
    woodR: forge((u, v) => { const g = fbm(u * 4, v * 34, 11, 4, 8); const r = 185 + g * 55; return [r, r, r]; }, 6),

    paperC: forge((u, v) => {
      const damask = Math.sin(u * TAU * 4) * Math.sin(v * TAU * 4);
      const dirt = fbm(u * 3, v * 3, 27, 5, 4);
      const stain = Math.pow(fbm(u * 1.6, v * 1.6, 41, 4, 3), 2.2);
      const k = 0.55 + damask * 0.09 + dirt * 0.35 - stain * 0.45;
      return [126 * k, 98 * k, 106 * k];
    }, 4, true),
    paperR: forge((u, v) => { const n = fbm(u * 3, v * 3, 27, 4, 4); const r = 210 + n * 40; return [r, r, r]; }, 4),

    clapC: forge((u, v) => {
      const board = Math.abs(((v * 10) % 1) - 0.5) < 0.04 ? 0.5 : 1;
      const weather = fbm(u * 6, v * 22, 61, 5, 8);
      const k = (0.5 + weather * 0.55) * board;
      return [78 * k, 66 * k, 88 * k];
    }, 5, true),
    clapR: forge((u, v) => { const n = fbm(u * 6, v * 22, 61, 4, 8); const r = 195 + n * 50; return [r, r, r]; }, 5),

    groundC: forge((u, v) => {
      const n = fbm(u * 8, v * 8, 91, 6, 8);
      const patch = fbm(u * 2.2, v * 2.2, 7, 4, 3);
      const k = 0.4 + n * 0.6;
      return [(36 + patch * 24) * k * 1.5, (52 + patch * 16) * k * 1.5, (32 + patch * 12) * k * 1.5];
    }, 24, true),
    groundR: forge((u, v) => { const n = fbm(u * 8, v * 8, 91, 4, 8); const r = 220 + n * 30; return [r, r, r]; }, 24),

    stoneC: forge((u, v) => {
      const n = fbm(u * 7, v * 7, 5, 5, 7);
      const crack = Math.pow(fbm(u * 12, v * 12, 33, 3, 12), 3) * 1.8;
      const k = 0.5 + n * 0.55 - crack;
      return [108 * k, 108 * k, 116 * k];
    }, 2, true),

    mist: forge((u, v) => {
      const n = fbm(u * 4, v * 4, 77, 5, 4);
      const c = clamp((n - 0.34) * 2.6, 0, 1) * 255;
      return [c, c, c];
    }, 1),

    soft: radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.25)', 0.4),
    blob: radial('rgba(0,0,0,0.62)', 'rgba(0,0,0,0.22)', 0.5),
  };

  const M = (opts) => new THREE.MeshStandardMaterial(opts);

  return {
    tex: TEX,
    wood:   M({ map: TEX.woodC, roughnessMap: TEX.woodR, roughness: 1, metalness: 0 }),
    paper:  M({ map: TEX.paperC, roughnessMap: TEX.paperR, roughness: 1, metalness: 0 }),
    clap:   M({ map: TEX.clapC, roughnessMap: TEX.clapR, roughness: 1, metalness: 0 }),
    ground: M({ map: TEX.groundC, roughnessMap: TEX.groundR, roughness: 1, metalness: 0 }),
    stone:  M({ map: TEX.stoneC, roughness: 0.92, metalness: 0 }),
    trim:   M({ color: 0x1d1622, roughness: 0.85, metalness: 0.05 }),
    bark:   M({ color: 0x241c16, roughness: 1 }),
    glass:  M({ color: 0x2a2a18, emissive: 0xffab45, emissiveIntensity: 1.5, roughness: 0.3 }),
    sheet:  M({ color: 0x6a6156, roughness: 0.95 }),
  };
}
