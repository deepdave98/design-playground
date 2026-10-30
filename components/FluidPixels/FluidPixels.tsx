'use client';

import { useEffect, useRef } from 'react';
import type { CSSProperties } from 'react';
import {
  LinearSRGBColorSpace,
  Mesh,
  NoBlending,
  NoToneMapping,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  ShaderMaterial,
  Vector2,
  WebGLRenderer,
} from 'three';
import { fragmentShader, vertexShader } from './shaders';

export const FLUID_PIXEL_COLORS = {
  background: '#141208',
  foreground: '#1B1913',
  accent: '#1B1913',
  hoverPalette: ['#1B1913', '#1B1913', '#1B1913', '#1B1913'],
} as const;

export const FLUID_PIXEL_DEFAULTS = {
  density: 0.8,
  speed: 0.26,
  warpStrength: 2.2,
  threshold: 0.66,
  jitter: 0.18,
} as const;

export type FluidPixelSettings = { [K in keyof typeof FLUID_PIXEL_DEFAULTS]: number };

export type FluidPixelsProps = Partial<FluidPixelSettings> & {
  paused?: boolean;
  className?: string;
  style?: CSSProperties;
};

type Controls = { update: () => void };

/** Fills a positioned parent. Put hero content above it with position: relative. */
export function FluidPixels({
  density = FLUID_PIXEL_DEFAULTS.density,
  speed = FLUID_PIXEL_DEFAULTS.speed,
  warpStrength = FLUID_PIXEL_DEFAULTS.warpStrength,
  threshold = FLUID_PIXEL_DEFAULTS.threshold,
  jitter = FLUID_PIXEL_DEFAULTS.jitter,
  paused,
  className,
  style,
}: FluidPixelsProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<Controls | null>(null);
  const settingsRef = useRef({ density, speed, warpStrength, threshold, jitter, paused });

  useEffect(() => {
    settingsRef.current = { density, speed, warpStrength, threshold, jitter, paused };
    controlsRef.current?.update();
  }, [density, speed, warpStrength, threshold, jitter, paused]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const canvas = document.createElement('canvas');
    const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
    let renderer: WebGLRenderer;
    let frame = 0;
    let previousTime: number | null = null;
    let elapsedTime = 0;
    let width = 0;
    let height = 0;
    let onScreen = true;
    let contextLost = false;
    let failed = false;

    try {
      const context = canvas.getContext('webgl2', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'low-power',
      });
      if (!context) {
        host.dataset.state = 'fallback';
        return;
      }
      renderer = new WebGLRenderer({ canvas, context, antialias: false, alpha: false });
      renderer.outputColorSpace = LinearSRGBColorSpace;
      renderer.toneMapping = NoToneMapping;
      context.disable(context.DITHER);
    } catch {
      host.dataset.state = 'fallback';
      return;
    }

    Object.assign(canvas.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', display: 'block' });
    host.appendChild(canvas);

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new PlaneGeometry(2, 2);
    const uniforms = {
      uResolution: { value: new Vector2() },
      uBufferScale: { value: new Vector2(1, 1) },
      uTime: { value: 0 },
      uDensity: { value: density },
      uSpeed: { value: speed },
      uWarpStrength: { value: warpStrength },
      uThreshold: { value: threshold },
      uJitter: { value: jitter },
    };
    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      toneMapped: false,
    });
    const plane = new Mesh(geometry, material);
    plane.frustumCulled = false;
    scene.add(plane);

    function stop() {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = null;
    }

    function fallback() {
      failed = true;
      stop();
      canvas.style.visibility = 'hidden';
      host!.dataset.state = 'fallback';
    }

    renderer.debug.onShaderError = fallback;

    function render() {
      if (contextLost || failed || width <= 0 || height <= 0) return;
      uniforms.uTime.value = elapsedTime;
      renderer.render(scene, camera);
      if (host!.dataset.drawCalls !== String(renderer.info.render.calls)) {
        host!.dataset.drawCalls = String(renderer.info.render.calls);
      }
    }

    function tick(now: number) {
      frame = 0;
      if (previousTime !== null) elapsedTime += Math.min((now - previousTime) / 1000, 0.1);
      previousTime = now;
      render();
      if (!failed && !contextLost) frame = requestAnimationFrame(tick);
    }

    function sync() {
      stop();
      if (failed || contextLost) return;
      if (document.hidden || !onScreen || width <= 0 || height <= 0) {
        host!.dataset.state = document.hidden ? 'hidden' : 'offscreen';
        return;
      }
      if (settingsRef.current.paused ?? reducedMotion.matches) {
        host!.dataset.state = 'paused';
        render();
      } else {
        host!.dataset.state = 'running';
        frame = requestAnimationFrame(tick);
      }
    }

    function update() {
      const settings = settingsRef.current;
      uniforms.uDensity.value = settings.density;
      uniforms.uSpeed.value = settings.speed;
      uniforms.uWarpStrength.value = settings.warpStrength;
      uniforms.uThreshold.value = settings.threshold;
      uniforms.uJitter.value = settings.jitter;
      sync();
    }

    function resize() {
      const bounds = host!.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      if (width > 0 && height > 0) {
        renderer.setPixelRatio(window.devicePixelRatio || 1);
        renderer.setSize(width, height, false);
        uniforms.uResolution.value.set(width, height);
        const buffer = renderer.getDrawingBufferSize(new Vector2());
        uniforms.uBufferScale.value.set(buffer.x / width, buffer.y / height);
      }
      sync();
    }

    let dprQuery: MediaQueryList;
    function watchDpr() {
      dprQuery?.removeEventListener('change', dprChanged);
      dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      dprQuery.addEventListener('change', dprChanged);
    }
    function dprChanged() {
      watchDpr();
      resize();
    }

    function lost(event: Event) {
      event.preventDefault();
      contextLost = true;
      stop();
      canvas.style.visibility = 'hidden';
      host!.dataset.state = 'fallback';
    }
    function restored() {
      contextLost = false;
      canvas.style.visibility = 'visible';
      renderer.getContext().disable(renderer.getContext().DITHER);
      resize();
    }

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    const intersectionObserver = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      sync();
    });
    intersectionObserver.observe(host);
    document.addEventListener('visibilitychange', sync);
    reducedMotion.addEventListener('change', sync);
    window.addEventListener('resize', resize);
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    controlsRef.current = { update };
    watchDpr();
    resize();
    update();

    return () => {
      controlsRef.current = null;
      stop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      dprQuery.removeEventListener('change', dprChanged);
      reducedMotion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={className}
      aria-hidden="true"
      data-fluid-pixels=""
      style={{ ...style, position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', background: FLUID_PIXEL_COLORS.background }}
    />
  );
}
