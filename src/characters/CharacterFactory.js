import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { AnimationController } from './AnimationController.js';
import { makeClown, ProceduralAnimator, SKIN_PLAYER, SKIN_ZOMBIE } from './ProceduralClown.js';

/**
 * Loads the clown GLBs once and hands out skinned clones.
 *
 * Missing assets are not an error: preload() records what failed and spawn()
 * falls back to the procedural clown. That means a fresh clone of this repo
 * runs with an empty public/assets folder, and dropping the GLBs in later
 * upgrades the visuals with no code change.
 */
export class CharacterFactory {
  constructor({ basePath = '/assets/' } = {}) {
    this.basePath = basePath;
    this.loader = new GLTFLoader();
    this.prototypes = new Map();
    this.clips = new Map();
    this.failures = [];
  }

  get hasAssets() { return this.prototypes.size > 0; }

  _load(url) {
    return new Promise((resolve, reject) => this.loader.load(url, resolve, undefined, reject));
  }

  async preload(characters, animations, onProgress) {
    let done = 0;
    const total = characters.length + animations.length;
    const tick = () => onProgress?.(++done / total);

    const jobs = [];

    for (const name of characters) {
      jobs.push(this._load(`${this.basePath}characters/${name}.glb`)
        .then(gltf => {
          gltf.scene.traverse(o => {
            if (o.isMesh || o.isSkinnedMesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              o.frustumCulled = false; // skinned bounds go stale mid-animation
            }
          });
          this.prototypes.set(name, gltf.scene);
          gltf.animations.forEach(c => this._register(c));
        })
        .catch(() => this.failures.push(name))
        .finally(tick));
    }

    for (const name of animations) {
      jobs.push(this._load(`${this.basePath}animations/${name}.glb`)
        .then(gltf => gltf.animations.forEach(c => this._register(c)))
        .catch(() => this.failures.push(name))
        .finally(tick));
    }

    await Promise.all(jobs);

    if (this.failures.length) {
      console.info(
        `[assets] ${this.failures.length} pack(s) missing (${this.failures.join(', ')}) — ` +
        'using procedural clowns. See ASSETS.md for the CC0 downloads.',
      );
    }
    return this;
  }

  /** Strip armature path prefixes so clips bind across separate exports. */
  _register(clip) {
    for (const track of clip.tracks) {
      const dot = track.name.indexOf('.');
      const node = track.name.slice(0, dot);
      const prop = track.name.slice(dot);
      const slash = node.lastIndexOf('/');
      if (slash >= 0) track.name = node.slice(slash + 1) + prop;
    }
    if (!this.clips.has(clip.name)) this.clips.set(clip.name, clip);
  }

  clipNames() { return [...this.clips.keys()].sort(); }

  /**
   * @returns {{root, anim, bones, mixer, procedural}}
   */
  spawn(name, { scale = 1, profile = 'player', variant = 0, skin = null, build = null } = {}) {
    const proto = this.prototypes.get(name);

    if (!proto) {
      const palette = skin
        || (profile === 'zombie' ? SKIN_ZOMBIE[variant % SKIN_ZOMBIE.length] : SKIN_PLAYER);
      const root = makeClown(build ? { ...palette, build } : palette);
      root.scale.setScalar(scale);
      return { root, anim: new ProceduralAnimator(root, profile), bones: {}, mixer: null, procedural: true };
    }

    const root = cloneSkinned(proto);
    root.scale.setScalar(scale);
    root.traverse(o => {
      if (o.isMesh || o.isSkinnedMesh) {
        o.material = Array.isArray(o.material) ? o.material.map(m => m.clone()) : o.material.clone();
      }
    });

    const mixer = new THREE.AnimationMixer(root);
    const bones = {};
    root.traverse(o => { if (o.isBone) bones[o.name] = o; });

    return {
      root,
      anim: new AnimationController(mixer, this.clips, profile, root),
      bones,
      mixer,
      procedural: false,
    };
  }

  static attachToBone(bones, boneName, object, offset) {
    const bone = bones[boneName];
    if (!bone) return false;
    bone.add(object);
    if (offset) object.position.copy(offset);
    return true;
  }
}
