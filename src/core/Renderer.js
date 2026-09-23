import * as THREE from 'three';

/**
 * Owns the WebGL device, the scene camera, and the offscreen targets PostFX
 * draws into. Nothing else in the project touches renderer state directly.
 */
export class Renderer {
  constructor(mount) {
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x0b0713, 0.017);

    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.08, 320);

    this.gl = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.gl.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.gl.setSize(innerWidth, innerHeight);
    this.gl.shadowMap.enabled = true;
    this.gl.shadowMap.type = THREE.PCFSoftShadowMap;
    this.gl.toneMapping = THREE.ACESFilmicToneMapping;
    this.gl.toneMappingExposure = 1.12;
    mount.appendChild(this.gl.domElement);

    this.targets = {};
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  makeTarget(w, h, withDepth, srgb) {
    const rt = new THREE.WebGLRenderTarget(Math.max(2, w | 0), Math.max(2, h | 0), {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      stencilBuffer: false,
      depthBuffer: !!withDepth,
      colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
    });
    return rt;
  }

  resize() {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.gl.setSize(innerWidth, innerHeight);

    const pr = this.gl.getPixelRatio();
    const w = innerWidth * pr, h = innerHeight * pr;
    const half = [Math.max(2, (w / 2) | 0), Math.max(2, (h / 2) | 0)];

    if (!this.targets.scene) {
      this.targets.scene = this.makeTarget(w, h, true, true);
      this.targets.bright = this.makeTarget(half[0], half[1], false, false);
      this.targets.blurA = this.makeTarget(half[0], half[1], false, false);
      this.targets.blurB = this.makeTarget(half[0], half[1], false, false);
    } else {
      this.targets.scene.setSize(Math.max(2, w | 0), Math.max(2, h | 0));
      this.targets.bright.setSize(half[0], half[1]);
      this.targets.blurA.setSize(half[0], half[1]);
      this.targets.blurB.setSize(half[0], half[1]);
    }
  }
}
