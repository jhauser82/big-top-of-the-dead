import * as THREE from 'three';
import { FLOOR_H } from './Level.js';

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Lighting and volumetric-ish effects. The only shadow caster is the moon —
 * the interior practicals are unshadowed point lights, with blob shadows
 * under characters doing the grounding work instead. Eight shadow-casting
 * point lights would cost more than the whole rest of the frame.
 */
export class Atmosphere {
  constructor(scene, mats, windows) {
    this.scene = scene;
    this.lamps = [];
    this.mist = [];

    scene.add(new THREE.HemisphereLight(0x38294f, 0x0d0a0e, 0.55));

    const moon = new THREE.DirectionalLight(0x9db6f0, 1.7);
    moon.position.set(-30, 46, -22);
    moon.castShadow = true;
    moon.shadow.mapSize.set(2048, 2048);
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.03;
    const c = moon.shadow.camera;
    c.left = -46; c.right = 46; c.top = 46; c.bottom = -46; c.near = 1; c.far = 130;
    c.updateProjectionMatrix();
    scene.add(moon);
    this.moon = moon;

    const positions = [
      [-6, 1.6, -3], [5, 1.6, 4],
      [-4, FLOOR_H + 1.6, 3], [6.5, FLOOR_H + 1.6, -4],
      [0, FLOOR_H * 2 + 1.6, 0], [-7, FLOOR_H * 2 + 1.6, -5],
      [0, 2.6, 17], [-12, 2.4, 9],
    ];
    for (const [x, y, z] of positions) {
      const light = new THREE.PointLight(0xff9538, 9, 14, 2);
      light.position.set(x, y + 1.1, z);
      scene.add(light);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.08, 8, 6),
        new THREE.MeshStandardMaterial({ color: 0x120c08, emissive: 0xffb055, emissiveIntensity: 3 }),
      );
      bulb.position.copy(light.position);
      scene.add(bulb);
      this.lamps.push({ light, bulb, base: 9, seed: rand(0, 20) });
    }

    const shaftMat = new THREE.MeshBasicMaterial({
      map: mats.tex.soft, color: 0x8fa8e0, transparent: true, opacity: 0.05,
      blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    });
    for (const w of windows) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 5.2), shaftMat);
      m.position.set(
        w.x + (w.facing === 'x' ? (w.x < 0 ? 1.6 : -1.6) : 0),
        w.y - 0.9,
        w.z + (w.facing === 'z' ? (w.z < 0 ? 1.6 : -1.6) : 0),
      );
      if (w.facing === 'x') m.rotation.y = Math.PI / 2;
      m.rotation.x = -0.5;
      m.renderOrder = 2;
      scene.add(m);
    }

    for (let i = 0; i < 3; i++) {
      const tex = mats.tex.mist.clone();
      tex.needsUpdate = true;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(48, 32), new THREE.MeshBasicMaterial({
        map: tex, color: 0x8ea0b8, transparent: true, opacity: 0.15 - i * 0.035, depthWrite: false,
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.set(0, 0.35 + i * 0.3, 19);
      m.renderOrder = 2;
      scene.add(m);
      this.mist.push(m);
    }

    const N = 400;
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = rand(-15, 15);
      pos[i * 3 + 1] = rand(0.2, 10.5);
      pos[i * 3 + 2] = rand(-8, 27);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.05, map: mats.tex.soft, transparent: true, opacity: 0.4, depthWrite: false,
      blending: THREE.AdditiveBlending, color: 0xd8c9a8, sizeAttenuation: true,
    }));
    scene.add(this.dust);
  }

  update(dt, t) {
    for (const l of this.lamps) {
      const f = 0.76
        + Math.sin(t * 9 + l.seed) * 0.13
        + Math.sin(t * 23 + l.seed * 3) * 0.06
        + Math.random() * 0.08;
      l.light.intensity = l.base * f;
      l.bulb.material.emissiveIntensity = 2.4 * f;
    }
    this.mist.forEach((m, i) => {
      m.material.map.offset.x = t * 0.006 * (i + 1);
      m.material.map.offset.y = Math.sin(t * 0.1 + i) * 0.02;
    });
    this.dust.rotation.y = t * 0.008;
    this.dust.position.y = Math.sin(t * 0.25) * 0.15;
  }
}
