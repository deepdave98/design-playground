import { simplex2D } from './simplex';

export const vertexShader = /* glsl */ `
  void main() {
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;

  uniform vec2 uResolution;
  uniform vec2 uBufferScale;
  uniform float uTime;
  uniform float uDensity;
  uniform float uSpeed;
  uniform float uWarpStrength;
  uniform float uThreshold;
  uniform float uJitter;

  const vec3 BACKGROUND = vec3(16.0, 14.0, 6.0) / 255.0;
  const vec3 SQUARE = vec3(27.0, 25.0, 19.0) / 255.0;
  const float SQUARE_SIZE = 4.0;
  const float CELL_SIZE = 5.5;
  const float FIELD_UNIT = 256.0;

  ${simplex2D}

  float fbm(vec2 p) {
    return 0.5 + 0.5 * (
      0.5 * snoise(p) +
      0.25 * snoise(p * 2.0) +
      0.125 * snoise(p * 4.0)
    );
  }

  float cellHash(vec2 cell) {
    return fract(sin(dot(cell, vec2(127.1, 311.7))) * 43758.5453123);
  }

  void main() {
    vec2 pixel = gl_FragCoord.xy / uBufferScale;
    pixel.y = uResolution.y - pixel.y;
    vec2 cell = floor(pixel / CELL_SIZE);
    vec2 local = pixel - cell * CELL_SIZE;

    if (local.x >= SQUARE_SIZE || local.y >= SQUARE_SIZE) {
      gl_FragColor = vec4(BACKGROUND, 1.0);
      return;
    }

    // One noise sample per cell center; fragment position only cuts the square.
    vec2 uv = (cell * CELL_SIZE + SQUARE_SIZE * 0.5) / FIELD_UNIT;
    float t = uTime * uSpeed;
    vec2 q = vec2(
      fbm(uv * uDensity + vec2(0.0, 0.2 * t)),
      fbm(uv * uDensity + vec2(1.2, -0.3 * t))
    );
    float intensity = fbm(uv * uDensity + q * uWarpStrength);
    float threshold = uThreshold - uJitter * cellHash(cell);
    gl_FragColor = vec4(intensity > threshold ? SQUARE : BACKGROUND, 1.0);
  }
`;
