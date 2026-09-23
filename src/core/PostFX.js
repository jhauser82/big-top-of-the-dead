import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

/**
 * Bright pass -> two-iteration separable Gaussian -> composite grade.
 *
 * Hand-rolled rather than EffectComposer: it is three passes, the blur
 * kernel is tuned for this look, and skipping the addon keeps the bundle
 * small. If you later want SSAO or TAA, swap this whole file for
 * EffectComposer — nothing else depends on its internals.
 */
export class PostFX {
  constructor(renderer) {
    this.r = renderer;

    this.bright = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, threshold: { value: 0.70 }, knee: { value: 0.42 } },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform float threshold, knee; varying vec2 vUv;
        void main(){
          vec3 c = texture2D(tDiffuse, vUv).rgb;
          float l = dot(c, vec3(0.2126,0.7152,0.0722));
          float s = max(l - threshold, 0.0);
          gl_FragColor = vec4(c * (s / (s + knee)), 1.0);
        }`,
    });

    this.blur = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, dir: { value: new THREE.Vector2() } },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
        void main(){
          vec3 s = vec3(0.0);
          s += texture2D(tDiffuse, vUv + dir * -4.0).rgb * 0.0162;
          s += texture2D(tDiffuse, vUv + dir * -3.0).rgb * 0.0540;
          s += texture2D(tDiffuse, vUv + dir * -2.0).rgb * 0.1216;
          s += texture2D(tDiffuse, vUv + dir * -1.0).rgb * 0.1946;
          s += texture2D(tDiffuse, vUv              ).rgb * 0.2270;
          s += texture2D(tDiffuse, vUv + dir *  1.0).rgb * 0.1946;
          s += texture2D(tDiffuse, vUv + dir *  2.0).rgb * 0.1216;
          s += texture2D(tDiffuse, vUv + dir *  3.0).rgb * 0.0540;
          s += texture2D(tDiffuse, vUv + dir *  4.0).rgb * 0.0162;
          gl_FragColor = vec4(s, 1.0);
        }`,
    });

    this.grade = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: null }, tBloom: { value: null },
        uBloom: { value: 0.58 }, uVig: { value: 0.60 }, uGrain: { value: 0.05 },
        uAber: { value: 0.55 }, uSat: { value: 1.06 }, uHurt: { value: 0.0 },
        uTime: { value: 0.0 },
      },
      vertexShader: VERT,
      fragmentShader: /* glsl */`
        uniform sampler2D tScene, tBloom;
        uniform float uBloom, uVig, uGrain, uAber, uSat, uHurt, uTime;
        varying vec2 vUv;
        void main(){
          vec2 c = vUv - 0.5;
          float r2 = dot(c, c);
          float ab = uAber * r2 * 0.06;

          vec3 col;
          col.r = texture2D(tScene, vUv + c * ab).r;
          col.g = texture2D(tScene, vUv).g;
          col.b = texture2D(tScene, vUv - c * ab).b;

          col += texture2D(tBloom, vUv).rgb * uBloom;

          float l = dot(col, vec3(0.2126,0.7152,0.0722));
          col = mix(vec3(l), col, uSat);
          col = mix(col * vec3(0.85,0.91,1.13), col * vec3(1.09,1.01,0.89),
                    smoothstep(0.18, 0.85, l));

          col = mix(col, vec3(0.72,0.05,0.11), uHurt * (0.22 + r2 * 1.4));
          col *= 1.0 - uVig * smoothstep(0.12, 0.86, r2);

          float n = fract(sin(dot(vUv + fract(uTime), vec2(12.9898,78.233))) * 43758.5453);
          col += (n - 0.5) * uGrain;

          gl_FragColor = vec4(col, 1.0);
        }`,
    });

    this.quadScene = new THREE.Scene();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bright);
    this.quadScene.add(this.quad);
  }

  pass(material, target) {
    this.quad.material = material;
    this.r.gl.setRenderTarget(target || null);
    this.r.gl.clear();
    this.r.gl.render(this.quadScene, this.quadCam);
  }

  render(time, hurt) {
    const { gl, scene, camera, targets } = this.r;

    gl.setRenderTarget(targets.scene);
    gl.clear();
    gl.render(scene, camera);

    this.bright.uniforms.tDiffuse.value = targets.scene.texture;
    this.pass(this.bright, targets.bright);

    const px = 1 / targets.bright.width, py = 1 / targets.bright.height;
    const step = (src, dst, x, y) => {
      this.blur.uniforms.tDiffuse.value = src.texture;
      this.blur.uniforms.dir.value.set(x, y);
      this.pass(this.blur, dst);
    };
    step(targets.bright, targets.blurA, px * 1.4, 0);
    step(targets.blurA, targets.blurB, 0, py * 1.4);
    step(targets.blurB, targets.blurA, px * 3.2, 0);
    step(targets.blurA, targets.blurB, 0, py * 3.2);

    this.grade.uniforms.tScene.value = targets.scene.texture;
    this.grade.uniforms.tBloom.value = targets.blurB.texture;
    this.grade.uniforms.uTime.value = time * 0.001;
    this.grade.uniforms.uHurt.value = hurt || 0;
    this.pass(this.grade, null);
  }
}
