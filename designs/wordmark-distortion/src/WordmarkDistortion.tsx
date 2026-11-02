'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  CanvasTexture, Color, DataTexture, FloatType, LinearFilter, Mesh, NearestFilter,
  NoBlending, NoToneMapping, OrthographicCamera, PlaneGeometry, RGBAFormat, Scene,
  ShaderMaterial, SRGBColorSpace, Vector2, Vector4, WebGLRenderer,
} from 'three';
import { DisplacementField } from './displacement';
import { fragmentShader, vertexShader } from './shaders';

export type WordmarkDistortionProps = {
  src: string;
  alt: string;
  aspect: number;
  animateBackground?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function WordmarkDistortion({ src, alt, aspect, animateBackground = true, className, style }: WordmarkDistortionProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const host = hostRef.current!;
    const fallbackImage = imageRef.current!;
    const canvas = document.createElement('canvas');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'low-power' });
    } catch {
      host.dataset.state = 'fallback';
      return;
    }
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = NoToneMapping;
    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', visibility: 'hidden' });
    host.append(canvas);
    fallbackImage.style.visibility = 'visible';
    host.dataset.state = 'loading';

    const field = new DisplacementField();
    const displacement = new DataTexture(field.data, field.size, field.size, RGBAFormat, FloatType);
    displacement.minFilter = displacement.magFilter = NearestFilter;
    displacement.needsUpdate = true;
    const uniforms = {
      uLogo: { value: null as CanvasTexture | null },
      uDisplacement: { value: displacement },
      uLogoRect: { value: new Vector4() },
      uResolution: { value: new Vector2() },
      uTime: { value: 0 },
      uForeground: { value: new Color('#4f4f4f') },
      uAccent: { value: new Color('#7e7572') },
    };
    const material = new ShaderMaterial({ uniforms, vertexShader, fragmentShader, blending: NoBlending, depthTest: false, depthWrite: false, toneMapped: false });
    const geometry = new PlaneGeometry(2, 2);
    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const plane = new Mesh(geometry, material);
    plane.frustumCulled = false;
    scene.add(plane);

    let frame = 0;
    let previousTime: number | null = null;
    let previousPointer: { x: number; y: number; id: number } | undefined;
    let onScreen = true;
    let moving = false;
    let disposed = false;
    let failed = false;
    let contextLost = false;

    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = null;
    }

    function fallback() {
      failed = true;
      stop();
      canvas.style.visibility = 'hidden';
      fallbackImage.style.visibility = 'visible';
      host.dataset.state = 'fallback';
    }
    renderer.debug.onShaderError = fallback;

    function render() {
      if (!uniforms.uLogo.value || failed || contextLost) return;
      renderer.render(scene, camera);
      host.dataset.drawCalls = String(renderer.info.render.calls);
      if (!failed) {
        canvas.style.visibility = 'visible';
        fallbackImage.style.visibility = 'hidden';
      }
    }

    function tick(now: number) {
      frame = 0;
      const seconds = previousTime === null ? 1 / 60 : Math.min((now - previousTime) / 1000, 0.05);
      previousTime = now;
      if (animateBackground) uniforms.uTime.value += seconds;
      if (moving) {
        moving = field.step(seconds);
        displacement.needsUpdate = true;
      }
      render();
      if (failed || contextLost) return;
      host.dataset.state = moving ? 'active' : animateBackground ? 'running' : 'idle';
      if (moving || animateBackground) frame = requestAnimationFrame(tick);
      else previousTime = null;
    }

    function requestRender() {
      if (!frame && !document.hidden && onScreen && !reducedMotion.matches && !failed && !contextLost && uniforms.uLogo.value) frame = requestAnimationFrame(tick);
    }

    function sync() {
      stop();
      previousPointer = undefined;
      if (failed || contextLost || !uniforms.uLogo.value) return;
      if (document.hidden || !onScreen) {
        host.dataset.state = document.hidden ? 'hidden' : 'offscreen';
        return;
      }
      if (reducedMotion.matches) {
        field.clear();
        moving = false;
        displacement.needsUpdate = true;
      }
      render();
      if (failed) return;
      host.dataset.state = reducedMotion.matches ? 'paused' : moving ? 'active' : animateBackground ? 'running' : 'idle';
      if (moving || animateBackground) requestRender();
    }

    function resize() {
      const { width, height } = host.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      uniforms.uResolution.value.set(width, height);
      const logoWidth = Math.min(width * 0.8, height * 0.95 * aspect);
      const logoHeight = logoWidth / aspect;
      uniforms.uLogoRect.value.set((1 - logoWidth / width) / 2, (1 - logoHeight / height) / 2, logoWidth / width, logoHeight / height);
      sync();
    }

    function pointerMove(event: PointerEvent) {
      if (reducedMotion.matches || document.hidden || !onScreen) return;
      const bounds = host.getBoundingClientRect();
      const rect = uniforms.uLogoRect.value;
      const x = ((event.clientX - bounds.left) / bounds.width - rect.x) / rect.z;
      const y = ((bounds.bottom - event.clientY) / bounds.height - rect.y) / rect.w;
      if (x < 0 || x > 1 || y < 0 || y > 1) {
        previousPointer = undefined;
        return;
      }
      if (previousPointer?.id === event.pointerId) {
        field.push(x, y, x - previousPointer.x, y - previousPointer.y);
        moving = true;
        requestRender();
      }
      previousPointer = { x, y, id: event.pointerId };
    }
    function pointerLeave() { previousPointer = undefined; }
    function pointerUp(event: PointerEvent) {
      if (event.pointerType !== 'mouse') pointerLeave();
    }

    function lost(event: Event) {
      event.preventDefault();
      contextLost = true;
      stop();
      canvas.style.visibility = 'hidden';
      fallbackImage.style.visibility = 'visible';
      host.dataset.state = 'fallback';
    }
    function restored() {
      contextLost = false;
      displacement.needsUpdate = true;
      if (uniforms.uLogo.value) uniforms.uLogo.value.needsUpdate = true;
      resize();
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (disposed) return;
      try {
        const raster = document.createElement('canvas');
        raster.width = Math.min(2048, renderer.capabilities.maxTextureSize);
        raster.height = Math.max(1, Math.round(raster.width / aspect));
        const context = raster.getContext('2d');
        if (!context) { fallback(); return; }
        context.drawImage(image, 0, 0, raster.width, raster.height);
        const texture = new CanvasTexture(raster);
        texture.minFilter = texture.magFilter = LinearFilter;
        texture.colorSpace = SRGBColorSpace;
        uniforms.uLogo.value = texture;
        resize();
      } catch { fallback(); }
    };
    image.onerror = fallback;
    image.src = src;

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    const intersectionObserver = new IntersectionObserver(([entry]) => { onScreen = entry.isIntersecting; sync(); });
    intersectionObserver.observe(host);
    let dprQuery: MediaQueryList;
    function watchDpr() {
      dprQuery?.removeEventListener('change', dprChanged);
      dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      dprQuery.addEventListener('change', dprChanged);
    }
    function dprChanged() { watchDpr(); resize(); }
    watchDpr();
    host.addEventListener('pointermove', pointerMove, { passive: true });
    host.addEventListener('pointerdown', pointerMove, { passive: true });
    host.addEventListener('pointerleave', pointerLeave);
    host.addEventListener('pointercancel', pointerLeave);
    host.addEventListener('pointerup', pointerUp);
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', sync);
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    resize();

    return () => {
      disposed = true;
      stop();
      image.onload = image.onerror = null;
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      dprQuery.removeEventListener('change', dprChanged);
      host.removeEventListener('pointermove', pointerMove);
      host.removeEventListener('pointerdown', pointerMove);
      host.removeEventListener('pointerleave', pointerLeave);
      host.removeEventListener('pointercancel', pointerLeave);
      host.removeEventListener('pointerup', pointerUp);
      document.removeEventListener('visibilitychange', sync);
      reducedMotion.removeEventListener('change', sync);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      uniforms.uLogo.value?.dispose();
      displacement.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, [src, aspect, animateBackground]);

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={alt}
      className={className}
      data-wordmark-distortion=""
      style={{ position: 'relative', aspectRatio: String(aspect / 0.8), background: '#000', overflow: 'hidden', ...style }}
    >
      <img ref={imageRef} src={src} alt="" aria-hidden="true" draggable={false} style={{ position: 'absolute', inset: 0, margin: 'auto', width: '80%', height: '95%', objectFit: 'contain', opacity: 0.8, pointerEvents: 'none', userSelect: 'none' }} />
    </div>
  );
}
