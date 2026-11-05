import {
  BackSide, EdgesGeometry, Group, LineBasicMaterial, LineSegments, Mesh,
  MeshBasicMaterial, NoToneMapping, OrthographicCamera, Scene,
  ShaderMaterial, SRGBColorSpace, Vector2, WebGLRenderer,
} from 'three';
import type { BufferGeometry } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { CrtPass } from './CrtPass';
import modelUrl from '../assets/d-monogram.glb?url';

export function mountDemo(host: HTMLElement) {
  const canvas = host.querySelector<HTMLCanvasElement>('canvas')!;
  const status = host.querySelector<HTMLElement>('[role="status"]')!;
  const motion = host.querySelector<HTMLButtonElement>('#motion')!;
  const signal = host.querySelector<HTMLInputElement>('#signal')!;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power' });
  } catch {
    host.dataset.state = 'fallback';
    status.textContent = 'WebGL is unavailable.';
    motion.disabled = signal.disabled = true;
    return () => {};
  }
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = NoToneMapping;
  renderer.setClearColor(0x000000);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.01, 200);
  camera.position.set(12, 6, 12);
  camera.zoom = 30;
  camera.lookAt(0, 0, 0);
  const model = new Group();
  model.rotation.y = -Math.PI * 0.2;
  scene.add(model);

  const face = new MeshBasicMaterial({ color: 0x000000 });
  const line = new LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65 });
  const outline = new ShaderMaterial({
    side: BackSide,
    transparent: true,
    vertexShader: /* glsl */ `
      void main() {
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * 0.01, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      void main() { gl_FragColor = vec4(1.0, 1.0, 1.0, 0.5); }
    `,
  });
  const geometries = new Set<BufferGeometry>();
  const composer = new EffectComposer(renderer);
  const renderPass = new RenderPass(scene, camera);
  const bloom = new UnrealBloomPass(new Vector2(1, 1), 0.08, 0.05, 0.05);
  const crt = new CrtPass();
  const output = new OutputPass();
  for (const pass of [renderPass, bloom, crt, output]) composer.addPass(pass);

  let frame = 0;
  let previousTime: number | null = null;
  let elapsed = 0;
  let ready = false;
  let disposed = false;
  let failed = false;
  let contextLost = false;
  let onScreen = true;
  let paused = reducedMotion.matches;
  let pointer = 0;
  let cameraPointer = 0;
  const abort = new AbortController();

  function setState(state: string) {
    if (host.dataset.state !== state) host.dataset.state = state;
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = null;
  }
  function fail(message: string) {
    failed = true;
    stop();
    status.textContent = message;
    status.hidden = false;
    canvas.style.visibility = 'hidden';
    motion.disabled = signal.disabled = true;
    setState('fallback');
  }
  renderer.debug.onShaderError = () => fail('The graphics driver could not compile the shader.');

  function render() {
    if (!ready || failed || contextLost || disposed) return;
    crt.time = elapsed;
    camera.position.set(12 + cameraPointer * 1.75, 6, 12 - cameraPointer * 1.75);
    camera.lookAt(0, 0, 0);
    model.position.y = Math.sin(elapsed * 2) * 0.25;
    composer.render();
  }
  function tick(now: number) {
    frame = 0;
    const seconds = previousTime === null ? 0 : Math.min((now - previousTime) / 1000, 0.05);
    elapsed += seconds;
    cameraPointer += (pointer - cameraPointer) * (1 - Math.exp(-seconds * 8));
    previousTime = now;
    render();
    if (!failed && !contextLost && !disposed) frame = requestAnimationFrame(tick);
  }
  function sync() {
    stop();
    motion.textContent = paused ? 'Play' : 'Pause';
    motion.setAttribute('aria-label', paused ? 'Play animation' : 'Pause animation');
    if (!ready || failed || contextLost || disposed) return;
    if (document.hidden || !onScreen) {
      setState(document.hidden ? 'hidden' : 'offscreen');
      return;
    }
    render();
    if (failed) return;
    setState(paused ? 'paused' : 'running');
    if (!paused) frame = requestAnimationFrame(tick);
  }
  function resize() {
    const { width, height } = host.getBoundingClientRect();
    if (width <= 0 || height <= 0) return;
    const ratio = Math.min(devicePixelRatio || 1, 2);
    renderer.setPixelRatio(ratio);
    renderer.setSize(width, height, false);
    composer.setPixelRatio(ratio);
    composer.setSize(width, height);
    camera.left = -width / 2;
    camera.right = width / 2;
    camera.top = height / 2;
    camera.bottom = -height / 2;
    camera.updateProjectionMatrix();
    model.scale.setScalar(Math.max(0.75, Math.min(1.25 * width / height, 1.15)));
    crt.chromaticOffset = width < height ? 0.0085 : 0.0025;
    sync();
  }
  function toggleMotion() { paused = !paused; sync(); }
  function motionChanged() { paused = reducedMotion.matches; sync(); }
  function signalChanged() { crt.progress = signal.valueAsNumber; render(); }
  function pointerMoved(event: PointerEvent) {
    if (!paused && event.pointerType === 'mouse') {
      const bounds = host.getBoundingClientRect();
      pointer = (event.clientX - bounds.left) / bounds.width * 2 - 1;
    }
  }
  function pointerLeft() { pointer = 0; }
  function lost(event: Event) {
    event.preventDefault();
    contextLost = true;
    stop();
    status.textContent = 'Restoring graphics…';
    status.hidden = false;
    setState('fallback');
  }
  function restored() {
    contextLost = false;
    status.hidden = true;
    resize();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  const intersectionObserver = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); });
  intersectionObserver.observe(host);
  let dprQuery: MediaQueryList;
  function watchDpr() {
    dprQuery?.removeEventListener('change', dprChanged);
    dprQuery = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
    dprQuery.addEventListener('change', dprChanged);
  }
  function dprChanged() { watchDpr(); resize(); }
  watchDpr();
  motion.addEventListener('click', toggleMotion);
  signal.addEventListener('input', signalChanged);
  host.addEventListener('pointermove', pointerMoved, { passive: true });
  host.addEventListener('pointerleave', pointerLeft);
  document.addEventListener('visibilitychange', sync);
  reducedMotion.addEventListener('change', motionChanged);
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);

  async function load() {
    try {
      const response = await fetch(modelUrl, { signal: abort.signal });
      if (!response.ok) throw new Error('Model request failed');
      const gltf = await new GLTFLoader().parseAsync(await response.arrayBuffer(), '');
      gltf.scene.traverse(object => {
        if (!(object instanceof Mesh)) return;
        geometries.add(object.geometry);
        if (disposed) { object.geometry.dispose(); return; }
        const mesh = new Mesh(object.geometry, face);
        mesh.scale.setScalar(4.8);
        const bowl = object.name === 'DBowl';
        mesh.position.x = bowl ? 0.3 : -0.3;
        mesh.rotation.x = (bowl ? -1 : 1) * Math.PI * 0.2;
        const edges = new EdgesGeometry(object.geometry, 18);
        geometries.add(edges);
        mesh.add(new LineSegments(edges, line));
        // Sharp edges alone omit the silhouette along the smooth bowl.
        mesh.add(new Mesh(object.geometry, outline));
        model.add(mesh);
      });
      if (disposed) return;
      ready = true;
      status.hidden = true;
      resize();
    } catch (error) {
      if (!disposed && !(error instanceof DOMException && error.name === 'AbortError')) fail('The demo model could not be loaded.');
    }
  }
  void load();
  resize();

  function pageHidden(event: PageTransitionEvent) {
    if (event.persisted) stop();
    else dispose();
  }
  function pageShown(event: PageTransitionEvent) { if (event.persisted) sync(); }
  window.addEventListener('pagehide', pageHidden);
  window.addEventListener('pageshow', pageShown);

  function dispose() {
    if (disposed) return;
    disposed = true;
    abort.abort();
    stop();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    dprQuery.removeEventListener('change', dprChanged);
    motion.removeEventListener('click', toggleMotion);
    signal.removeEventListener('input', signalChanged);
    host.removeEventListener('pointermove', pointerMoved);
    host.removeEventListener('pointerleave', pointerLeft);
    document.removeEventListener('visibilitychange', sync);
    reducedMotion.removeEventListener('change', motionChanged);
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
    window.removeEventListener('pagehide', pageHidden);
    window.removeEventListener('pageshow', pageShown);
    for (const geometry of geometries) geometry.dispose();
    face.dispose();
    line.dispose();
    outline.dispose();
    for (const pass of composer.passes) pass.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }
  return dispose;
}
