import { simplex2D } from './simplex';

export const vertexShader = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;

  uniform sampler2D uLogo;
  uniform sampler2D uDisplacement;
  uniform vec4 uLogoRect;
  uniform vec2 uResolution;
  uniform float uTime;
  uniform vec3 uForeground;
  uniform vec3 uAccent;
  varying vec2 vUv;

  ${simplex2D}

  float fbm(vec2 p) {
    return 0.5 + 0.5 * (0.5 * snoise(p) + 0.25 * snoise(p * 2.0) + 0.125 * snoise(p * 4.0));
  }

  vec3 pixelField() {
    vec2 pixel = vUv * uResolution;
    vec2 cell = floor(pixel / 4.75);
    vec2 local = pixel - cell * 4.75;
    if (local.x >= 3.0 || local.y >= 3.0) return vec3(0.0);

    vec2 uv = (cell * 4.75 + 1.5) / uResolution;
    float t = uTime * 0.26;
    vec2 q = vec2(
      fbm(uv * 1.25 + vec2(0.0, 0.2 * t)),
      fbm(uv * 1.25 + vec2(1.2, -0.3 * t))
    );
    float intensity = fbm(uv * 1.25 + q * 2.2);
    float hash = fract(sin(dot(cell, vec2(12.9898, 78.233))) * 43758.5453);
    if (intensity <= 0.66 - 0.25 * hash) return vec3(0.0);
    return hash < 0.08 ? uAccent : uForeground;
  }

  vec4 wordmark(vec2 uv) {
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
    vec2 offset = texture2D(uDisplacement, uv).rg;
    uv -= 0.02 * offset;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec4(0.0);
    return texture2D(uLogo, uv);
  }

  void main() {
    vec4 logo = wordmark((vUv - uLogoRect.xy) / uLogoRect.zw);
    gl_FragColor = vec4(mix(pixelField(), logo.rgb, logo.a * 0.8), 1.0);
  }
`;
