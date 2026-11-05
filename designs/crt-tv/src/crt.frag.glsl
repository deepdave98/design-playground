uniform sampler2D tDiffuse;
uniform vec2 uResolution;
uniform float uTime;
uniform float uProgress;
uniform float uChromaticOffset;
varying vec2 vUv;

const vec2 VHS_RESOLUTION = vec2(320.0, 240.0);
const float PIXEL_SIZE = 2.0;
const float PI = 3.141592653589793;

float random(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Value noise by Morgan McGuire: https://www.shadertoy.com/view/4dS3Wd
float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(random(i), random(i + vec2(1.0, 0.0)), u.x),
             mix(random(i + vec2(0.0, 1.0)), random(i + vec2(1.0)), u.x), u.y);
}

vec3 phosphorMask(vec2 uv) {
  vec2 cell = uv * uResolution / PIXEL_SIZE;
  cell.x += mod(floor(cell.y), 2.0) * 1.5;
  vec2 local = fract(cell) * 2.0 - 1.0;
  float dotMask = 1.0 - smoothstep(0.45, 1.0, length(local));
  float channel = mod(floor(cell.x), 3.0);
  return vec3(channel == 0.0 ? 1.0 : 0.0,
              channel == 1.0 ? 1.0 : 0.0,
              channel == 2.0 ? 1.0 : 0.0) * dotMask * 6.0;
}

void main() {
  vec4 original = texture2D(tDiffuse, vUv);
  vec2 pixel = PIXEL_SIZE / uResolution;
  vec2 uv = vUv;
  uv.x += mod(floor(vUv.y / pixel.y), 2.0) * pixel.x * 0.5;
  uv.x += (random(vec2(uv.y / 10.0, uTime / 10.0)) - 0.5) / VHS_RESOLUTION.x * 0.8;
  uv.x += (random(vec2(uv.y, uTime * 10.0)) - 0.5) / VHS_RESOLUTION.x * 0.8;

  float bottomNoise = 1.0 - smoothstep(0.0, 40.0 / VHS_RESOLUTION.y, uv.y);
  uv.y += bottomNoise * 0.3;
  uv.x += bottomNoise * (random(vec2(uv.y * 100.0, uTime * 10.0)) - 0.5) / VHS_RESOLUTION.x * 50.0;
  uv = pixel * floor(uv / pixel);

  vec2 split = vec2(uChromaticOffset, 0.0);
  vec3 color = vec3(texture2D(tDiffuse, uv + split).r,
                    texture2D(tDiffuse, uv).g,
                    texture2D(tDiffuse, uv - split).b);
  color = max(color, 0.001) * phosphorMask(vUv);

  float phase = smoothstep(0.9, 0.96, sin(vUv.y * 8.0 -
    (uTime + 0.14 * random(uTime * vec2(0.67, 0.59))) * PI * 0.7));
  float tracking = smoothstep(0.3, 1.0, random(vec2(vUv.y * 4.77, uTime)));
  if (tracking * (0.3 + 0.7 * phase) > 0.5) {
    color = mix(color, vec3(1.0), pow(random(vUv), 150.0));
  }

  vec2 grainUv = vUv + noise(vUv * 400.0);
  color += noise(grainUv + uTime * random(grainUv) * 250.0) * 0.01;
  gl_FragColor = vec4(mix(original.rgb, color, uProgress), original.a);
}
