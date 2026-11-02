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
  varying vec2 vUv;

  void main() {
    vec2 uv = (vUv - uLogoRect.xy) / uLogoRect.zw;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec2 offset = texture2D(uDisplacement, uv).rg;
    uv -= 0.02 * offset;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) {
      gl_FragColor = vec4(0.0);
      return;
    }
    vec4 logo = texture2D(uLogo, uv);
    gl_FragColor = vec4(logo.rgb, logo.a * 0.8);
  }
`;
