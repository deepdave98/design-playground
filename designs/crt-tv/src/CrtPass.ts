import { Vector2 } from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import fragmentShader from './crt.frag.glsl?raw';

export class CrtPass extends ShaderPass {
  constructor() {
    super({
      uniforms: {
        tDiffuse: { value: null },
        uResolution: { value: new Vector2(1, 1) },
        uTime: { value: 0 },
        uProgress: { value: 1 },
        uChromaticOffset: { value: 0.0025 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position.xy, 0.0, 1.0);
        }
      `,
      fragmentShader,
    });
  }

  override setSize(width: number, height: number) {
    this.uniforms.uResolution.value.set(width, height);
  }

  set time(seconds: number) { this.uniforms.uTime.value = seconds; }
  get time(): number { return this.uniforms.uTime.value; }
  set progress(value: number) { this.uniforms.uProgress.value = value; }
  get progress(): number { return this.uniforms.uProgress.value; }
  set chromaticOffset(value: number) { this.uniforms.uChromaticOffset.value = value; }
}
