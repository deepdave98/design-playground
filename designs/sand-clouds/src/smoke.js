// WebGL fluid smoke and drifting fog. Coordinates use a 1920 × 1080 canvas.
// Sand gradient artwork: https://www.arrakis.tech/chemicals.

// Where the canvas is, in "design px": the coordinates every option below is written in (the 1920x1080 slide the fog
// was designed on). Default: its position inside its <section>.
// With data-fog-origin="x,y" and data-fog-scale="s" the fog is a scaled copy of that design placed inside the
// canvas's offset parent: design (0,0) sits at (x,y) px there and one design px is s px. That placement is read from
// layout (offsetLeft/offsetTop), so it holds still while the parent is being moved by a transform (a sheet sliding in).
function fogRect(canvas, section) {
  const o = (canvas.getAttribute('data-fog-origin') || '').split(',').map(Number);
  if (o.length === 2 && isFinite(o[0]) && isFinite(o[1]) && canvas.offsetWidth) {
    const s = Number(canvas.getAttribute('data-fog-scale')) || 1;
    return [(canvas.offsetLeft - o[0]) / s, (canvas.offsetTop - o[1]) / s, canvas.offsetWidth / s, canvas.offsetHeight / s];
  }
  const c = canvas.getBoundingClientRect();
  const b = section ? section.getBoundingClientRect() : { left: 0, top: 0, width: 1920 };
  const k = (b.width || 1920) / 1920;
  if (!c.width) return [0, 346, 1920, 760];                  // not laid out: its designed spot
  return [(c.left - b.left) / k, (c.top - b.top) / k, c.width / k, c.height / k];
}

const DEFAULTS = Object.freeze({
  // Where the fog lives (slide px). It rises from below: clear above fogTop, thickening to full strength at the
  // letters' baseline (fogFull), holding to fogHoldEnd, then thinning out into the dune gradient by fogEnd.
  fogTop: 539,              // fog starts here (mid-height of the lowercase letters)
  fogFull: 633,             // full strength at the baseline, so the bottoms of the letters sit in it
  fogHoldEnd: 730,          // stays full down to here (the "Early 2027." pill floats above it, not in it)
  fogEnd: 960,              // fades into the dune gradient by here
  textX0: 128, textX1: 1792,
  featherX: 260,            // at headline height the fog fades out this far beyond the text ends ...
  fullWidthFrom: 640,       // ... and from here down it widens ...
  fullWidthAt: 800,         // ... to span the whole slide, like the dune it melts into

  // Fog body
  scale: 300,               // size of the big fog billows (px)
  drift: 16,                // main sheet drift (px/s, left to right)
  drift2: -9,               // second sheet drift (px/s), opposite way for parallax
  rise: 0,                  // both sheets roll upward like rising smoke (px/s; 0 = level drift)
  evolve: 0.045,            // how fast the billows change shape (noise-space units/s)
  warp: 0.75,               // domain-warp strength (how curly/smoky the edges are)
  haze: 0.26,               // alpha everywhere inside the fog (the persistent veil)
  density: 0.42,            // extra alpha in the thick parts of the fog
  contrast: 1.2,            // how sharply the fog separates into thick and thin patches
  breathe: 0.12,            // slow global swell of the fog (fraction of alpha)
  breathePeriod: 9,         // seconds per swell

  // Arrakis sand ramp (thin -> thick fog)
  colorThin: '#FBEFD6',     // sand
  colorMid: '#FFDBAD',      // desert
  colorThick: '#F7A85E',    // sun-baked dune body
  warmth: 0.32,             // how far toward colorThick the thickest fog goes
  edgeWobble: 22,           // px the fog's top edge billows (keeps it cloud-shaped, never a ruler line)
  aspect: 1.25,             // billow squash (1 = round, higher = wider than tall)

  // Grain overlay (static, like the speckle baked into the Arrakis sand)
  grainCellPx: 2,           // grain cell size in slide px
  grainAmount: 0.10,        // +/- alpha modulation from the ordered dither (0 = off)
  flecks: 0.035,            // fraction of cells that become light flecks where the fog is thick (0 = off)
  fleckColor: '#FBC18B',

  dprCap: 2,
  maxBackingWidth: 2880,
});

const VERT = `attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2  uRes;        // backing-store size (px)
uniform vec4  uRect;       // canvas rect in slide px: x, y, w, h
uniform float uTime;
uniform vec4  uBand;       // textX0, textX1, fullWidthFrom, fullWidthAt
uniform vec3  uFeather;    // featherX, -, -
uniform vec4  uV;          // fogTop, fogFull, fogHoldEnd, fogEnd
uniform vec4  uFog;        // scale, drift, drift2, evolve
uniform vec4  uFog2;       // warp, haze, density, contrast
uniform vec3  uBreathe;    // amount, period, warmth
uniform vec3  uCThin, uCMid, uCThick, uCFleck;
uniform vec3  uGrain;      // cellPx, amount, flecks
uniform vec3  uShape;      // edgeWobble, aspect, rise

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){
vec2 i = floor(p), f = fract(p);
vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
float v = 0.0, a = 0.5;
mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = r * p * 2.02 + 17.1; a *= 0.5; }
return v;
}
float bayer4(vec2 c){
vec2 m = mod(floor(c), 4.0);
float i = m.x + m.y * 4.0;
// 4x4 Bayer matrix, row-major
if (i < 0.5) return 0.0/16.0;  if (i < 1.5) return 8.0/16.0;  if (i < 2.5) return 2.0/16.0;  if (i < 3.5) return 10.0/16.0;
if (i < 4.5) return 12.0/16.0; if (i < 5.5) return 4.0/16.0;  if (i < 6.5) return 14.0/16.0; if (i < 7.5) return 6.0/16.0;
if (i < 8.5) return 3.0/16.0;  if (i < 9.5) return 11.0/16.0; if (i < 10.5) return 1.0/16.0; if (i < 11.5) return 9.0/16.0;
if (i < 12.5) return 15.0/16.0; if (i < 13.5) return 7.0/16.0; if (i < 14.5) return 13.0/16.0; return 5.0/16.0;
}
float sfade(float e0, float e1, float x){ return smoothstep(e0, e1, x); }

void main(){
vec2 uv = gl_FragCoord.xy / uRes;
vec2 p = vec2(uRect.x + uv.x * uRect.z, uRect.y + (1.0 - uv.y) * uRect.w);   // slide px, y down

// Feathered band around the headline
float t = uTime;
float e1 = vnoise(vec2(p.x / 170.0 - t * 0.06, 2.3)), e2 = vnoise(vec2(p.x / 150.0 + t * 0.05, 7.9));
float top = uV.x + uShape.x * e1;                          // billowing top edge (only ever moves down)
float my = sfade(top, uV.y, p.y) * (1.0 - sfade(uV.z, uV.w + uShape.x * (e2 - 0.5), p.y));
float mxText = sfade(uBand.x - uFeather.x, uBand.x, p.x) * (1.0 - sfade(uBand.y, uBand.y + uFeather.x, p.x));
float mx = mix(mxText, 1.0, sfade(uBand.z, uBand.w, p.y));
float mask = mx * my;
mask = mask * mask * (3.0 - 2.0 * mask);                   // extra-soft shoulder
if (mask <= 0.0) { gl_FragColor = vec4(0.0); return; }

// Two drifting, domain-warped fog sheets
vec2 q = p / uFog.x * vec2(1.0, uShape.y);
vec2 w = vec2(fbm(q + vec2(t * uFog.w, 3.7)), fbm(q + vec2(-1.9, t * uFog.w * 0.8)));
float up = t * uShape.z / uFog.x * uShape.y;                 // rising roll (q.y grows downward, so add to sample from below)
float a = fbm(q - vec2(t * uFog.y / uFog.x, -up) + uFog2.x * w + vec2(0.0, t * uFog.w * 0.3));
float b = fbm(q * 1.8 - vec2(t * uFog.z / uFog.x * 1.8, -up * 1.8 * 1.4) + uFog2.x * 0.6 * w.yx + 11.3);
float d = 0.62 * a + 0.38 * b;
d = clamp((d - 0.5) * uFog2.w + 0.5, 0.0, 1.0);
d = smoothstep(0.18, 0.92, d);

float swell = 1.0 + uBreathe.x * sin(t * 6.2831853 / uBreathe.y);
float alpha = (uFog2.y + uFog2.z * d) * swell * mask;

// Sand ramp: thin fog is pale sand, thick fog warms toward the dune body
vec3 col = mix(uCThin, uCMid, smoothstep(0.0, 0.6, d));
col = mix(col, uCThick, uBreathe.z * smoothstep(0.45, 1.0, d));

// Grain overlay (static in screen space): ordered-dither alpha ripple + sparse light flecks in thick fog
vec2 cell = floor(p / uGrain.x);
alpha *= 1.0 + uGrain.y * (bayer4(cell) - 0.5) * 2.0;
float fleck = step(1.0 - uGrain.z, hash(cell + 0.5)) * smoothstep(0.4, 0.9, d) * mask;
col = mix(col, uCFleck, fleck * 0.85);
alpha = max(alpha, fleck * 0.55);

alpha = clamp(alpha, 0.0, 1.0);
gl_FragColor = vec4(col * alpha, alpha);
}`;

function hex3(h) {
  const s = h.replace('#', '');
  const n = parseInt(s.length === 3 ? s.split('').map(c => c + c).join('') : s, 16);
  // sRGB values used as-is: the canvas composites in the same space as the page
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function createNoiseFog(canvas, options) {
  let opts = Object.assign({}, DEFAULTS, options || {});
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl) return { setOptions() {}, resize() {}, start() {}, stop() {}, renderOnce() {}, destroy() {}, options: opts };

  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {}; ['uRes', 'uRect', 'uTime', 'uBand', 'uFeather', 'uFog', 'uFog2', 'uBreathe', 'uCThin', 'uCMid', 'uCThick', 'uCFleck', 'uGrain', 'uShape', 'uV'].forEach(n => { U[n] = gl.getUniformLocation(prog, n); });

  // Canvas rect in slide px comes from its inline layout (left/top/width/height in the 1920x1080 slide)
  // Canvas rect in slide px, measured against its <section> (works wherever the canvas sits in the slide's DOM)
  const section = canvas.closest('section');
  const rect = () => fogRect(canvas, section);

  function applyUniforms() {
    const o = opts;
    gl.uniform4f(U.uBand, o.textX0, o.textX1, o.fullWidthFrom, o.fullWidthAt);
    gl.uniform3f(U.uFeather, o.featherX, 0, 0);
    gl.uniform4f(U.uV, o.fogTop, o.fogFull, o.fogHoldEnd, o.fogEnd);
    gl.uniform4f(U.uFog, o.scale, o.drift, o.drift2, o.evolve);
    gl.uniform4f(U.uFog2, o.warp, o.haze, o.density, o.contrast);
    gl.uniform3f(U.uBreathe, o.breathe, o.breathePeriod, o.warmth);
    gl.uniform3fv(U.uCThin, hex3(o.colorThin)); gl.uniform3fv(U.uCMid, hex3(o.colorMid));
    gl.uniform3fv(U.uCThick, hex3(o.colorThick)); gl.uniform3fv(U.uCFleck, hex3(o.fleckColor));
    gl.uniform3f(U.uGrain, o.grainCellPx, o.grainAmount, o.flecks);
    gl.uniform3f(U.uShape, o.edgeWobble, o.aspect, o.rise);
  }

  function resize() {
    const b = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, opts.dprCap);
    let w = Math.max(1, Math.round(b.width * dpr)), h = Math.max(1, Math.round(b.height * dpr));
    if (w > opts.maxBackingWidth) { h = Math.round(h * opts.maxBackingWidth / w); w = opts.maxBackingWidth; }
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }

  let raf = 0, t0 = 0, tAcc = 0, running = false;
  function draw(t) {
    resize();
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform4f(U.uRect, ...rect());
    gl.uniform1f(U.uTime, t);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(now) {
    if (!running) return;
    raf = requestAnimationFrame(frame);
    draw(tAcc + (now - t0) / 1000);
  }
  applyUniforms();

  const api = {
    options: opts,
    setOptions(o) { opts = Object.assign({}, opts, o); api.options = opts; applyUniforms(); if (!running) draw(tAcc); },
    resize,
    start() { if (running) return; running = true; t0 = performance.now(); raf = requestAnimationFrame(frame); },
    stop() { if (!running) return; running = false; cancelAnimationFrame(raf); tAcc += (performance.now() - t0) / 1000; },
    renderOnce(t) { draw(t == null ? tAcc : t); },
    destroy() { api.stop(); gl.deleteProgram(prog); gl.deleteBuffer(buf); const ext = gl.getExtension('WEBGL_lose_context'); ext && ext.loseContext(); },
  };
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); api.stop(); });
  return api;
}

/* ==============================================================================================================
 * Smoke fog: a real 2D fluid (our own implementation of the textbook method: Stam 1999 "Stable Fluids" with
 * semi-Lagrangian advection and a Jacobi pressure projection, plus Fedkiw et al. 2001 vorticity confinement).
 * Smoke is fed continuously into a band under the letters, buoyancy lifts it, a slowly evolving curl-noise wind
 * (divergence-free, so it only swirls) stirs it, and vorticity confinement keeps the curls tight. The whole sim
 * runs in slow motion (timeScale), so it reads as heavy, persistent fog that twirls.
 * Rendered smooth (premultiplied colour from the density), then the same envelope / sand ramp / grain as above.
 * ============================================================================================================ */
const SMOKE_DEFAULTS = Object.freeze({
  simCell: 10,              // slide px per velocity cell (1920x640 canvas -> 192x64 grid)
  dyeScale: 3,              // smoke-density grid is this many times finer than the velocity grid
  timeScale: 0.84,          // slow motion: sim seconds per real second
  vorticity: 22,            // curl confinement: how tightly the smoke twirls
  buoyancy: 12,             // upward pull on dense smoke (cells/s^2 per unit density)
  swirl: 22,                // curl-noise wind strength (cells/s^2)
  swirlScale: 9,            // size of the wind eddies (cells)
  swirlSpeed: 0.05,         // how fast the eddies themselves change
  wind: 2.2,                // gentle left-to-right drift (cells/s)
  velDissipation: 0.5,      // velocity /= 1 + k*dt
  dyeDissipation: 0.36,     // smoke /= 1 + k*dt (balanced against the source so the fog persists)
  sourceRate: 1.3,          // smoke fed per sim second by the plumes rising out of the dune ...
  sourceTop: 740,           // ... whose source band (slide px) starts under the pill ...
  sourceBottom: 1060,       // ... and runs down into the dune
  lift: 46,                 // upward push inside the plumes (cells/s^2), so smoke rolls up toward the letters
  hazeRate: 0.32,           // a light, even haze fed right under the letters so their bottoms always sit in fog ...
  hazeTop: 612, hazeBottom: 740,
  pressureIterations: 22,
  warmup: 9,                // sim seconds pre-run before the first frame, so the fog is already there
  baseHaze: 0.18,           // the drifting fog under the clouds: alpha everywhere in the envelope ...
  baseVariation: 0.4,       // ... plus this much in its thick billows (the fog engine's peach clouds; drift/evolve/warp/
                            //     contrast/aspect/breathe/warmth above set their motion and colour)
  baseScale: 300,           // size of the fog billows (px)
  baseRise: 0,              // fog rolls upward (px per sim second; 0 = level drift)
  drift: 30, drift2: -19, evolve: 0.085,   // the fog's drift in this engine (the plain fog keeps 16 / -9 / 0.045)
  opacity: 0.85,            // max cloud alpha
  thickness: 2.4,           // alpha = opacity * (1 - e^(-thickness * density))
  cloudLight: '#FBEFD6',    // cloud colour at the thickest cores (same pale sand as the haze: no light/dark patches)
  smokeGrain: 0,            // grain overlay on the smoke (0 = off: the dune image already carries its own grain)
  smokeFlecks: 0,           // sparse flecks (0 = off: they read as dark specks on the cream)
  floorVeil: 0.4,           // below fogHoldEnd the haze thins to this (not to 0), a pale veil that softens the dune's dark crest
  cloudFadeStart: 740,      // the clouds stay full down to here (just under the pill) ...
  cloudFadeEnd: 900,        // ... and thin out over the dune by here,
  cloudFloor: 0.15,         // ... to this fraction, so the dune shows as one smooth gradient instead of cloud-and-gap patches
  blurTexels: 2.2,          // display blur radius (dye texels): softer, more blended cloud edges
  // Natural movement: wind gusts that speed up and ease off the drift of the haze and streaks
  gust: 250,                // gust reach (px of extra travel either way)
  gustRate: 0.05,           // how often the wind changes (noise steps per second)
  // Darker streaks of fog: long, wind-stretched bands in a nearer layer, tinted like the dune
  streakAmount: 0.6,       // their max alpha (0 = off)
  streakColor: '#EC9E66',   // a sand-orange between the dune's body and its crest, so they read as part of the gradient
  streakScale: 118,          // band thickness scale (px)
  streakStretch: 4.4,       // how much longer than tall (wind-stretched)
  streakDrift: 50,          // px/s, faster than the haze so they pass in front of it
  streakRise: 3,            // px/s upward
  streakEvolve: 0.09,       // how fast they curl and fray
  streakWarp: 0.9,          // curl strength
  streakCoverage: 0.37,     // noise threshold: higher = fewer, thinner streaks
  // Cover smoke: real simulated smoke that rises over parts of the headline. "Banks" travel slowly along the line;
  // while one passes, puffs are released just under the letters, and the fluid lifts, curls and carries them away.
  bankCoverage: 0.47,       // noise threshold: higher = banks come less often
  bankScale: 520,           // bank length (px)
  bankDrift: 34,            // px/s along the headline
  bankEvolve: 0.03,         // how fast banks form and die away
  coverRate: 4.0,           // smoke released per sim second inside a bank
  coverSourceTop: 562, coverSourceBottom: 680,   // released in this band (slide px): from just above the baseline down
  coverLift: 16,            // upward pull on the cover smoke (cells/s^2 per unit density): it rises over the letters
  coverDissipation: 0.5,    // how fast it thins out (1/s)
  coverSinkTop: 538, coverSinkBottom: 575, coverSinkRate: 7,   // it thins out quickly as it nears the height limit
  coverAmount: 0.92,        // max opacity over the letters
  coverThickness: 3.2,      // opacity = coverAmount * (1 - e^(-coverThickness * density))
  coverCeiling: 540,        // HEIGHT LIMIT (slide px): half-way up the lowercase letters (x-height 503, baseline 578).
                            // The cover smoke is never drawn above this line, so no letter is ever fully covered.
  coverCeilingDip: 14,      // the limit dips up to this many px lower along the line (never higher)
  coverCeilingFade: 18,     // soft edge below the limit (px)
  bankDark: 0.7,            // how dark the darker clouds go (toward bankDarkColor)
  bankDarkColor: '#E39A62',
  // Flow: how much the fluid's motion bends the drifting patterns (0 = they only slide)
  flowRelax: 0.8,           // how quickly a bent pattern springs back (1/s): lower = longer, curlier trails
  streakFlow: 0.55,         // streaks
  hazeFlow: 0.3,            // haze billows
  streakTop: 600, streakBottom: 930, streakFadeIn: 70, streakFadeOut: 140,
  streakSoftness: 0.26,     // edge softness of the bands (noise units)
  streakFray: 0.18,         // how much the filament detail eats into them (0 = solid bands)
  cloudWarm: 0.3,           // twirling clouds warm toward peach (colorMid) as they thicken (0..1) ...
  cloudDeep: 0.08,           // ... and their densest cores toward the dune body (colorThick)
});

const SMOKE_VERT = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const NOISE = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = r * p * 2.02 + 17.1; a *= 0.5; } return v; }`;
const F = body => `#version 300 es
precision highp float; precision highp sampler2D;
in vec2 vUv; out vec4 o;
${NOISE}
${body}`;
const SMOKE_FRAGS = {
  force: F(`uniform sampler2D uVel, uDye; uniform vec2 uGrid; uniform float uDt, uTime, uBuoy, uSwirl, uSwirlScale, uSwirlSpeed, uWind, uLift, uCoverLift; uniform vec4 uRect; uniform vec2 uBand;
float plume(vec2 p, float t){ return smoothstep(0.45, 0.8, fbm(p / 210.0 + vec2(t * 0.06, -t * 0.02))); }
float psi(vec2 c){ return fbm(c / uSwirlScale + vec2(uTime * uSwirlSpeed, -uTime * uSwirlSpeed * 0.7)); }
void main(){
vec2 v = texture(uVel, vUv).xy; vec4 dy = texture(uDye, vUv); float d = dy.r; vec2 c = vUv * uGrid; float e = 0.6;
vec2 curlN = vec2(psi(c + vec2(0.0, e)) - psi(c - vec2(0.0, e)), -(psi(c + vec2(e, 0.0)) - psi(c - vec2(e, 0.0)))) / (2.0 * e) * uSwirlScale;
vec2 p = uRect.xy + vec2(vUv.x, 1.0 - vUv.y) * uRect.zw;
float band = smoothstep(uBand.x, uBand.x + 80.0, p.y) * (1.0 - smoothstep(uBand.y - 60.0, uBand.y, p.y));
v += uDt * (uSwirl * curlN + vec2(0.0, uBuoy * d + uCoverLift * dy.g + uLift * band * plume(p, uTime)));
v.x += uDt * (uWind - v.x) * 0.15;
o = vec4(v, 0.0, 1.0);
}`),
  source: F(`uniform sampler2D uDye; uniform vec4 uRect; uniform float uDt, uTime, uRate, uHaze; uniform vec2 uBand, uHazeBand;
uniform vec4 uBank;      // coverage, scale (px), drift (px / sim s), evolve (1 / sim s)
uniform vec3 uCoverSrc;  // rate (1 / sim s), top, bottom (slide px)
void main(){
vec2 p = uRect.xy + vec2(vUv.x, 1.0 - vUv.y) * uRect.zw;                  // slide px
float band = smoothstep(uBand.x, uBand.x + 80.0, p.y) * (1.0 - smoothstep(uBand.y - 60.0, uBand.y, p.y));
float plume = smoothstep(0.45, 0.8, fbm(p / 210.0 + vec2(uTime * 0.06, -uTime * 0.02)));   // same field as the lift
float haze = smoothstep(uHazeBand.x, uHazeBand.x + 30.0, p.y) * (1.0 - smoothstep(uHazeBand.y - 50.0, uHazeBand.y, p.y));
vec4 s = texture(uDye, vUv);
s.r = min(s.r + uDt * (uRate * band * plume * 2.0 + uHaze * haze), 1.0);
// cover smoke (G): puffs released just under the letters, wherever a slow-travelling "bank" is passing. From here
// the fluid does the rest: it lifts them over the letters, curls them and carries them off.
float bx = (p.x - uTime * uBank.z) / uBank.y;
float bank = smoothstep(uBank.x, uBank.x + 0.2, fbm(vec2(bx, uTime * uBank.w) + 0.4 * fbm(vec2(bx * 1.9 + 3.1, uTime * uBank.w * 1.7))));
float puff = smoothstep(0.38, 0.72, fbm(p / 130.0 + vec2(uTime * 0.22, -uTime * 0.3)));
float cBand = smoothstep(uCoverSrc.y, uCoverSrc.y + 40.0, p.y) * (1.0 - smoothstep(uCoverSrc.z - 50.0, uCoverSrc.z, p.y));
s.g = min(s.g + uDt * uCoverSrc.x * bank * puff * cBand, 1.6);
o = s;
}`),
  advect: F(`uniform sampler2D uVel, uSrc; uniform vec2 uVelTexel; uniform float uDt, uDiss;
void main(){ vec2 c = vUv - uDt * texture(uVel, vUv).xy * uVelTexel; o = texture(uSrc, c) / (1.0 + uDiss * uDt); }`),
  advectDye: F(`uniform sampler2D uVel, uSrc; uniform vec2 uVelTexel, uCellPx; uniform float uDt, uDiss, uDissG, uRelax; uniform vec4 uRect; uniform vec3 uSink;
void main(){
vec2 v = texture(uVel, vUv).xy;
vec4 s = texture(uSrc, vUv - uDt * v * uVelTexel);
vec2 p = uRect.xy + vec2(vUv.x, 1.0 - vUv.y) * uRect.zw;
float sink = uSink.z * (1.0 - smoothstep(uSink.x, uSink.y, p.y));          // cover smoke thins out as it climbs past the letters
// BA = how far (slide px) the fluid has carried this spot recently: each step adds the local velocity, and it relaxes
// back to 0. The display looks its noise patterns up at p - BA, so the fog and streaks bend, curl and tear with the flow.
vec2 disp = (s.ba + vec2(v.x, -v.y) * uCellPx * uDt) / (1.0 + uRelax * uDt);
o = vec4(s.r / (1.0 + uDiss * uDt), s.g / (1.0 + (uDissG + sink) * uDt), clamp(disp, -500.0, 500.0));
}`),
  curl: F(`uniform sampler2D uVel; uniform vec2 uTexel;
void main(){ float L = texture(uVel, vUv - vec2(uTexel.x, 0.0)).y, R = texture(uVel, vUv + vec2(uTexel.x, 0.0)).y;
float T = texture(uVel, vUv + vec2(0.0, uTexel.y)).x, B = texture(uVel, vUv - vec2(0.0, uTexel.y)).x;
o = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0); }`),
  vorticity: F(`uniform sampler2D uVel, uCurl; uniform vec2 uTexel; uniform float uDt, uStrength;
void main(){ float L = texture(uCurl, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uCurl, vUv + vec2(uTexel.x, 0.0)).x;
float T = texture(uCurl, vUv + vec2(0.0, uTexel.y)).x, B = texture(uCurl, vUv - vec2(0.0, uTexel.y)).x, C = texture(uCurl, vUv).x;
vec2 f = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L)); f /= length(f) + 1e-4; f *= uStrength * C; f.y *= -1.0;
vec2 v = texture(uVel, vUv).xy + f * uDt; o = vec4(clamp(v, -1000.0, 1000.0), 0.0, 1.0); }`),
  divergence: F(`uniform sampler2D uVel; uniform vec2 uTexel;
void main(){ vec2 C = texture(uVel, vUv).xy;
float L = texture(uVel, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uVel, vUv + vec2(uTexel.x, 0.0)).x;
float T = texture(uVel, vUv + vec2(0.0, uTexel.y)).y, B = texture(uVel, vUv - vec2(0.0, uTexel.y)).y;
if (vUv.x - uTexel.x < 0.0) L = -C.x; if (vUv.x + uTexel.x > 1.0) R = -C.x;
if (vUv.y + uTexel.y > 1.0) T = -C.y; if (vUv.y - uTexel.y < 0.0) B = -C.y;
o = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0); }`),
  scale: F(`uniform sampler2D uSrc; uniform float uK; void main(){ o = texture(uSrc, vUv) * uK; }`),
  pressure: F(`uniform sampler2D uP, uDiv; uniform vec2 uTexel;
void main(){ float L = texture(uP, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uP, vUv + vec2(uTexel.x, 0.0)).x;
float T = texture(uP, vUv + vec2(0.0, uTexel.y)).x, B = texture(uP, vUv - vec2(0.0, uTexel.y)).x;
o = vec4((L + R + B + T - texture(uDiv, vUv).x) * 0.25, 0.0, 0.0, 1.0); }`),
  gradient: F(`uniform sampler2D uP, uVel; uniform vec2 uTexel;
void main(){ float L = texture(uP, vUv - vec2(uTexel.x, 0.0)).x, R = texture(uP, vUv + vec2(uTexel.x, 0.0)).x;
float T = texture(uP, vUv + vec2(0.0, uTexel.y)).x, B = texture(uP, vUv - vec2(0.0, uTexel.y)).x;
o = vec4(texture(uVel, vUv).xy - 0.5 * vec2(R - L, T - B), 0.0, 1.0); }`),
  display: F(`uniform sampler2D uDye; uniform vec2 uDyeTexel; uniform vec4 uRect; uniform float uTime;
uniform vec4 uBand; uniform float uFeatherX; uniform vec4 uV; uniform float uWobble, uFloor; uniform vec3 uCloudV;
uniform vec3 uCThin, uCMid, uCThick, uCFleck, uCLight; uniform float uWarmth, uOpacity, uThick, uBlur; uniform vec3 uGrain; uniform vec4 uBase; uniform float uBaseRise;
uniform vec4 uFogN, uFogC;   // drift, drift2, evolve, warp (per sim second) / contrast, aspect, breathe, breathe period (sim s)
uniform vec4 uStreak, uStreakV, uStreakM; uniform vec3 uCStreak; uniform vec2 uGust, uStreakX, uCloudWarm;
uniform vec4 uCover; uniform vec3 uCPatch; uniform vec2 uDarkM, uFlow, uCeil;   // cover: max alpha, thickness, ceiling (px), dark amount   // coverage, scale, drift, evolve (sim s) / amount, dark, top, full
float fbm5(vec2 p){ float v = 0.0, a = 0.5; mat2 r = mat2(0.8, 0.6, -0.6, 0.8);
for (int i = 0; i < 5; i++){ v += a * vnoise(p); p = r * p * 2.02 + 17.1; a *= 0.5; } return v; }
float bayer4(vec2 c){ vec2 m = mod(floor(c), 4.0); int i = int(m.x + m.y * 4.0);
float b[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.); return b[i] / 16.0; }
void main(){
vec2 p = uRect.xy + vec2(vUv.x, 1.0 - vUv.y) * uRect.zw;
float e1 = vnoise(vec2(p.x / 170.0 - uTime * 0.05, 2.3)), e2 = vnoise(vec2(p.x / 150.0 + uTime * 0.04, 7.9));
float darkQ = smoothstep(0.46, 0.66, fbm(vec2(p.x / 640.0 + uTime * uDarkM.x / 640.0, p.y / 520.0 - uTime * uDarkM.y) + 8.4));
float rise = smoothstep(uV.x + uWobble * e1, uV.y, p.y);                                   // fog rises over the letter bottoms
float mxText = smoothstep(uBand.x - uFeatherX, uBand.x, p.x) * (1.0 - smoothstep(uBand.y, uBand.y + uFeatherX, p.x));
float hx = mxText + (1.0 - mxText) * smoothstep(uBand.z, uBand.w, p.y);
float mask = hx * rise;
mask = mask * mask * (3.0 - 2.0 * mask);
float hazeV = mix(1.0, uFloor, smoothstep(uV.z, uV.w + uWobble * (e2 - 0.5), p.y));        // haze thins to a veil over the dune
float cloudV = mix(1.0, uCloudV.z, smoothstep(uCloudV.x, uCloudV.y, p.y));                  // clouds thin out faster over the dune
// soft 5-tap read of the density so the smoke edges stay velvety
vec2 bt = uDyeTexel * uBlur;
vec4 dyb = 0.2 * texture(uDye, vUv);
for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; dyb += 0.1 * texture(uDye, vUv + vec2(cos(a), sin(a)) * bt); }
float d = dyb.r, dG = dyb.g;
vec2 flow = dyb.ba;                                               // px the fluid has carried this spot (see advectDye)
// continuous drifting fog under the simulated clouds: the drifting-fog engine's two parallax sheets of
// domain-warped noise (same maths and look options), so its soft peach billows sit in the haze
vec2 q = (p - uFlow.y * flow) / uBase.z * vec2(1.0, uFogC.y);
float ev = uTime * uFogN.z;
vec2 w = vec2(fbm5(q + vec2(ev, 3.7)), fbm5(q + vec2(-1.9, ev * 0.8)));
float up = uTime * uBaseRise / uBase.z * uFogC.y;
// gusts: a slow noise-driven surge on top of the steady drift, so the wind speeds up and eases off naturally
float gust = uGust.x * (fbm(vec2(uTime * uGust.y, 9.2)) - 0.5) * 2.0;
float bob = 0.35 * uGust.x * (fbm(vec2(uTime * uGust.y * 0.7, 4.4)) - 0.5) * 2.0 / uBase.z;
float s1 = fbm5(q - vec2((uTime * uFogN.x + gust) / uBase.z, -up + bob) + uFogN.w * w + vec2(0.0, ev * 0.3));
float s2 = fbm5(q * 1.8 - vec2((uTime * uFogN.y - 0.6 * gust) / uBase.z * 1.8, -up * 2.5 - bob) + uFogN.w * 0.6 * w.yx + 11.3);
float n = clamp((0.62 * s1 + 0.38 * s2 - 0.5) * uFogC.x + 0.5, 0.0, 1.0);
n = smoothstep(0.18, 0.92, n);
float swell = 1.0 + uFogC.z * sin(uTime * 6.2831853 / uFogC.w);
float hazeA = (uBase.x + uBase.y * n) * swell * hazeV;
vec3 hazeCol = mix(uCThin, uCMid, smoothstep(0.0, 0.6, n));
hazeCol = mix(hazeCol, uCThick, uWarmth * smoothstep(0.45, 1.0, n));
// darker sand streaks: long wind-stretched bands of fog, a nearer layer that drifts faster than the haze
// (parallax) and rides the same gusts; their own slow domain warp curls and frays them as they travel
vec2 sp = p - uFlow.x * flow;                                     // streaks are carried and bent by the fluid
vec2 sq = vec2(sp.x / (uStreak.y * uStreak.z), sp.y / uStreak.y);
float sx = (uTime * uStreak.w + 1.6 * gust) / (uStreak.y * uStreak.z);
vec2 sw = vec2(fbm5(sq * vec2(0.6, 0.9) + vec2(uTime * uStreakM.z, 2.0)), fbm5(sq * vec2(0.6, 0.9) + vec2(5.2, -uTime * uStreakM.z * 0.8)));
float sn = fbm5(sq - vec2(sx, -uTime * uStreakM.w / uStreak.y) + uStreakM.y * (sw - 0.5));
float streak = smoothstep(uStreakM.x, uStreakM.x + uStreakX.x, sn);
float fil = 1.0 - abs(fbm5(sq * vec2(2.2, 3.4) - vec2(sx * 2.2, 0.0) + 1.3 * (sw - 0.5) + 7.7) * 2.0 - 1.0);
streak *= mix(1.0 - uStreakX.y, 1.0, fil * fil);                                             // frayed, filament-y edges
float sBand = smoothstep(uStreakV.x, uStreakV.x + uStreakV.z, p.y) * (1.0 - smoothstep(uStreakV.y - uStreakV.w, uStreakV.y, p.y));
float sA = uStreak.x * streak * sBand * swell;
float ah = 1.0 - (1.0 - hazeA) * (1.0 - sA);                     // streaks over haze ...
vec3 colH = (hazeCol * hazeA * (1.0 - sA) + uCStreak * sA) / max(ah, 1e-4);
float cloudA = uOpacity * (1.0 - exp(-uThick * d)) * cloudV;
vec3 cloudCol = mix(uCThin, uCLight, smoothstep(0.25, 1.0, d));   // pale sand wisps, lighter cores ...
cloudCol = mix(cloudCol, uCMid, uCloudWarm.x * smoothstep(0.3, 0.9, d));      // ... a touch of peach as they thicken
cloudCol = mix(cloudCol, uCThick, uCloudWarm.y * smoothstep(0.55, 1.0, d));   // ... and a hint of dune in the densest cores
float a0 = 1.0 - (1.0 - ah) * (1.0 - cloudA);                    // ... and the twirling clouds over both
vec3 col = (colH * ah * (1.0 - cloudA) + cloudCol * cloudA) / max(a0, 1e-4);
col = mix(col, uCPatch, 0.45 * uCover.w * darkQ * smoothstep(0.2, 0.8, a0));    // some clouds are simply darker
float a = a0 * mask;
// cover smoke, over the fog: real simulated smoke that rises over parts of the headline. Thin edges are pale and
// translucent, the body is nearly opaque, and the darker clouds lean toward the dune colour.
// height limit: the cover smoke is never drawn above coverCeiling (half-way up the lowercase letters). The limit
// dips a little along the line so it is not a ruler-straight edge, and the smoke itself thins out below it (the sink).
float cY = uCover.z + uCeil.x * vnoise(vec2(p.x / 150.0 - uTime * 0.06, 5.1));
float cA = uCover.x * (1.0 - exp(-uCover.y * dG)) * hx * smoothstep(cY, cY + uCeil.y, p.y);
vec3 cCol = mix(vec3(0.992, 0.945, 0.875), mix(uCThin, uCMid, 0.75), smoothstep(0.04, 0.45, dG));
cCol = mix(cCol, uCPatch, uCover.w * darkQ * smoothstep(0.25, 1.0, dG));
float aB = 1.0 - (1.0 - a) * (1.0 - cA);
col = (col * a * (1.0 - cA) + cCol * cA) / max(aB, 1e-4);
a = aB;
vec2 cell = floor(p / uGrain.x);
a *= 1.0 + uGrain.y * (bayer4(cell) - 0.5) * 2.0;
float fleck = step(1.0 - uGrain.z, hash(cell + 0.5)) * smoothstep(0.35, 0.9, d) * mask;
col = mix(col, uCFleck, fleck * 0.85); a = max(a, fleck * 0.5);
a = clamp(a, 0.0, 1.0);
o = vec4(col * a, a);
}`),
};

function createSmokeFog(canvas, options) {
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false });
  if (!gl || !gl.getExtension('EXT_color_buffer_float')) return null;   // caller falls back to the noise fog
  let opts = Object.assign({}, DEFAULTS, SMOKE_DEFAULTS, options || {});

  const compile = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const vs = compile(gl.VERTEX_SHADER, SMOKE_VERT);
  const P = {};
  for (const k in SMOKE_FRAGS) {
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, SMOKE_FRAGS[k]));
    gl.bindAttribLocation(pr, 0, 'aPos'); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    const u = {}; const n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(pr, i).name.replace(/\[0\]$/, ''); u[name] = gl.getUniformLocation(pr, name); }
    P[k] = { pr, u };
  }
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const vbo = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const targets = [];
  function target(w, h) {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, w, h); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    const t = { tex, fb, w, h }; targets.push(t); return t;
  }
  const pair = (w, h) => { const a = target(w, h), b = target(w, h); return { get read() { return a._r ? b : a; }, get write() { return a._r ? a : b; }, swap() { a._r = !a._r; } }; };

  // Canvas rect in slide px (same measurement as the noise fog)
  const section = canvas.closest('section');
  const rect = () => fogRect(canvas, section);
  let R = rect();
  const VW = Math.max(16, Math.round(R[2] / opts.simCell)), VH = Math.max(8, Math.round(R[3] / opts.simCell));
  const DW = VW * opts.dyeScale, DH = VH * opts.dyeScale;
  const vel = pair(VW, VH), dye = pair(DW, DH), prs = pair(VW, VH), div = target(VW, VH), curl = target(VW, VH);
  const vT = [1 / VW, 1 / VH], dT = [1 / DW, 1 / DH];

  function pass(name, out, set) {
    const p = P[name]; gl.useProgram(p.pr);
    let unit = 0; const tex = (n, t) => { if (!p.u[n]) return; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t.tex); gl.uniform1i(p.u[n], unit++); };
    set(p.u, tex);
    if (out) { gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb); gl.viewport(0, 0, out.w, out.h); }
    else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  let simTime = 0;
  function step(dt) {
    const o = opts; simTime += dt;
    pass('force', vel.write, (u, tex) => { tex('uVel', vel.read); tex('uDye', dye.read); gl.uniform2f(u.uGrid, VW, VH); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uTime, simTime);
      gl.uniform1f(u.uBuoy, o.buoyancy); gl.uniform1f(u.uSwirl, o.swirl); gl.uniform1f(u.uSwirlScale, o.swirlScale); gl.uniform1f(u.uSwirlSpeed, o.swirlSpeed); gl.uniform1f(u.uWind, o.wind);
      gl.uniform1f(u.uLift, o.lift); gl.uniform1f(u.uCoverLift, o.coverLift); gl.uniform4f(u.uRect, ...R); gl.uniform2f(u.uBand, o.sourceTop, o.sourceBottom); });
    vel.swap();
    pass('source', dye.write, (u, tex) => { tex('uDye', dye.read); gl.uniform4f(u.uRect, ...R); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uTime, simTime); gl.uniform1f(u.uRate, o.sourceRate); gl.uniform2f(u.uBand, o.sourceTop, o.sourceBottom);
      gl.uniform1f(u.uHaze, o.hazeRate); gl.uniform2f(u.uHazeBand, o.hazeTop, o.hazeBottom);
      gl.uniform4f(u.uBank, o.bankCoverage, o.bankScale, o.bankDrift / o.timeScale, o.bankEvolve / o.timeScale);
      gl.uniform3f(u.uCoverSrc, o.coverRate, o.coverSourceTop, o.coverSourceBottom); });
    dye.swap();
    pass('curl', curl, (u, tex) => { tex('uVel', vel.read); gl.uniform2f(u.uTexel, ...vT); });
    pass('vorticity', vel.write, (u, tex) => { tex('uVel', vel.read); tex('uCurl', curl); gl.uniform2f(u.uTexel, ...vT); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uStrength, o.vorticity); });
    vel.swap();
    pass('divergence', div, (u, tex) => { tex('uVel', vel.read); gl.uniform2f(u.uTexel, ...vT); });
    pass('scale', prs.write, (u, tex) => { tex('uSrc', prs.read); gl.uniform1f(u.uK, 0.8); }); prs.swap();
    for (let i = 0; i < o.pressureIterations; i++) { pass('pressure', prs.write, (u, tex) => { tex('uP', prs.read); tex('uDiv', div); gl.uniform2f(u.uTexel, ...vT); }); prs.swap(); }
    pass('gradient', vel.write, (u, tex) => { tex('uP', prs.read); tex('uVel', vel.read); gl.uniform2f(u.uTexel, ...vT); }); vel.swap();
    pass('advect', vel.write, (u, tex) => { tex('uVel', vel.read); tex('uSrc', vel.read); gl.uniform2f(u.uVelTexel, ...vT); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uDiss, o.velDissipation); }); vel.swap();
    pass('advectDye', dye.write, (u, tex) => { tex('uVel', vel.read); tex('uSrc', dye.read); gl.uniform2f(u.uVelTexel, ...vT); gl.uniform1f(u.uDt, dt); gl.uniform1f(u.uDiss, o.dyeDissipation);
      gl.uniform1f(u.uDissG, o.coverDissipation); gl.uniform1f(u.uRelax, o.flowRelax); gl.uniform2f(u.uCellPx, R[2] / VW, R[3] / VH); gl.uniform4f(u.uRect, ...R);
      gl.uniform3f(u.uSink, o.coverSinkTop, o.coverSinkBottom, o.coverSinkRate); }); dye.swap();
  }

  function resize() {
    const b = canvas.getBoundingClientRect(); const dpr = Math.min(window.devicePixelRatio || 1, opts.dprCap);
    let w = Math.max(1, Math.round(b.width * dpr)), h = Math.max(1, Math.round(b.height * dpr));
    if (w > opts.maxBackingWidth) { h = Math.round(h * opts.maxBackingWidth / w); w = opts.maxBackingWidth; }
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  function draw() {
    resize(); R = rect(); const o = opts;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    pass('display', null, (u, tex) => { tex('uDye', dye.read); gl.uniform2f(u.uDyeTexel, ...dT); gl.uniform4f(u.uRect, ...R); gl.uniform1f(u.uTime, simTime);
      gl.uniform4f(u.uBand, o.textX0, o.textX1, o.fullWidthFrom, o.fullWidthAt); gl.uniform1f(u.uFeatherX, o.featherX);
      gl.uniform4f(u.uV, o.fogTop, o.fogFull, o.fogHoldEnd, o.fogEnd); gl.uniform1f(u.uWobble, o.edgeWobble); gl.uniform1f(u.uFloor, o.floorVeil); gl.uniform3f(u.uCloudV, o.cloudFadeStart, o.cloudFadeEnd, o.cloudFloor);
      gl.uniform3fv(u.uCThin, hex3(o.colorThin)); gl.uniform3fv(u.uCMid, hex3(o.colorMid)); gl.uniform3fv(u.uCThick, hex3(o.colorThick)); gl.uniform3fv(u.uCFleck, hex3(o.fleckColor));
      gl.uniform4f(u.uBase, o.baseHaze, o.baseVariation, o.baseScale, 0); gl.uniform1f(u.uBaseRise, o.baseRise);
      // the fog's look options are in real seconds; the display runs on sim time, so convert by the slow-motion factor
      gl.uniform4f(u.uFogN, o.drift / o.timeScale, o.drift2 / o.timeScale, o.evolve / o.timeScale, o.warp);
      gl.uniform4f(u.uFogC, o.contrast, o.aspect, o.breathe, o.breathePeriod * o.timeScale);
      gl.uniform2f(u.uGust, o.gust, o.gustRate / o.timeScale);
      gl.uniform4f(u.uStreak, o.streakAmount, o.streakScale, o.streakStretch, o.streakDrift / o.timeScale);
      gl.uniform4f(u.uStreakV, o.streakTop, o.streakBottom, o.streakFadeIn, o.streakFadeOut);
      gl.uniform4f(u.uStreakM, o.streakCoverage, o.streakWarp, o.streakEvolve / o.timeScale, o.streakRise / o.timeScale);
      gl.uniform3fv(u.uCStreak, hex3(o.streakColor));
      gl.uniform4f(u.uCover, o.coverAmount, o.coverThickness, o.coverCeiling, o.bankDark); gl.uniform3fv(u.uCPatch, hex3(o.bankDarkColor));
      gl.uniform2f(u.uDarkM, 0.5 * o.bankDrift / o.timeScale, 0.7 * o.bankEvolve / o.timeScale); gl.uniform2f(u.uFlow, o.streakFlow, o.hazeFlow); gl.uniform2f(u.uCeil, o.coverCeilingDip, o.coverCeilingFade);
      gl.uniform2f(u.uStreakX, o.streakSoftness, o.streakFray); gl.uniform2f(u.uCloudWarm, o.cloudWarm, o.cloudDeep);
      gl.uniform1f(u.uWarmth, o.warmth); gl.uniform1f(u.uOpacity, o.opacity); gl.uniform1f(u.uThick, o.thickness); gl.uniform3f(u.uGrain, o.grainCellPx, o.smokeGrain, o.smokeFlecks);
      gl.uniform3fv(u.uCLight, hex3(o.cloudLight)); gl.uniform1f(u.uBlur, o.blurTexels); });
  }

  const H = 1 / 60;                              // fixed sim step (before slow motion)
  let warmed = false;
  // pre-run in coarser 0.05 s steps (semi-Lagrangian advection stays stable), so the fog is already formed
  function warm() { if (warmed) return; warmed = true; const n = Math.round(opts.warmup / 0.05); for (let i = 0; i < n; i++) step(0.05); }

  let raf = 0, last = 0, acc = 0, running = false;
  function frame(now) {
    if (!running) return; raf = requestAnimationFrame(frame);
    acc += Math.min((now - last) / 1000, 0.1); last = now;
    let n = 0; while (acc >= H && n < 3) { step(H * opts.timeScale); acc -= H; n++; }
    if (n === 3) acc = 0;
    draw();
  }
  const api = {
    options: opts, engine: 'smoke',
    setOptions(o) { opts = Object.assign({}, opts, o); api.options = opts; if (!running) draw(); },
    resize,
    start() { if (running) return; warm(); running = true; last = performance.now(); acc = 0; raf = requestAnimationFrame(frame); },
    stop() { if (!running) return; running = false; cancelAnimationFrame(raf); },
    renderOnce() { warm(); draw(); },
    destroy() { api.stop(); targets.forEach(t => { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }); for (const k in P) gl.deleteProgram(P[k].pr); gl.deleteBuffer(vbo); gl.deleteVertexArray(vao); },
  };
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); api.stop(); });
  return api;
}

// <canvas data-headline-fog> (or ="fog") draws the drifting fog; data-headline-fog="smoke" runs the fluid smoke,
// falling back to the fog where float render targets aren't available.
function createHeadlineFog(canvas, options) {
  const engine = (options && options.engine) || canvas.getAttribute('data-headline-fog') || 'fog';
  let fog = null;
  if (engine === 'smoke') {
    try { fog = createSmokeFog(canvas, options); } catch (e) { console.warn('[headline-fog] smoke unavailable, using fog', e); }
  }
  return fog || createNoiseFog(canvas, options);
}


export { createHeadlineFog as createSandClouds };
