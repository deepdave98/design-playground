import { useEffect, useState } from 'react';
import { FluidPixels, FLUID_PIXEL_DEFAULTS } from '../../components/FluidPixels';
import type { FluidPixelSettings } from '../../components/FluidPixels';

const fields: { key: keyof FluidPixelSettings; label: string; min: number; max: number; step: number }[] = [
  { key: 'density', label: 'Noise density', min: 0.2, max: 2, step: 0.01 },
  { key: 'speed', label: 'Animation speed', min: 0, max: 0.6, step: 0.01 },
  { key: 'warpStrength', label: 'Domain warp', min: 0, max: 4, step: 0.1 },
  { key: 'threshold', label: 'Visibility threshold', min: 0.3, max: 0.9, step: 0.01 },
  { key: 'jitter', label: 'Cell threshold jitter', min: 0, max: 0.3, step: 0.01 },
];

export function Playground() {
  const [settings, setSettings] = useState<FluidPixelSettings>({ ...FLUID_PIXEL_DEFAULTS });
  const [paused, setPaused] = useState(() => matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [showContent, setShowContent] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setPaused(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  function reset() {
    setSettings({ ...FLUID_PIXEL_DEFAULTS });
    setPaused(matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  if (new URLSearchParams(location.search).has('embed')) {
    return <main className="embed-hero"><FluidPixels {...settings} paused={paused} /></main>;
  }

  return (
    <>
      <header className="playground-header">
        <a href="../../">← Designs</a>
        <span>02 / Fluid pixels</span>
        <a href="https://github.com/deepdave98/design-playground/tree/main/components/FluidPixels">Source ↗</a>
      </header>

      <main className="playground">
        <section className="preview-panel" aria-label="Shader preview">
          <div className="preview-toolbar">
            <div className="view-switch" aria-label="Preview size">
              <button aria-pressed={!mobile} onClick={() => setMobile(false)}>Desktop</button>
              <button aria-pressed={mobile} onClick={() => setMobile(true)}>Mobile</button>
            </div>
            <button className="text-button" onClick={() => setPaused(!paused)}>{paused ? 'Play' : 'Pause'}</button>
          </div>

          <div className={`preview-space${mobile ? ' mobile-view' : ''}`}>
            <div className="hero" data-preview-hero="">
              <FluidPixels {...settings} paused={paused} />
              {showContent && (
                <div className="hero-content">
                  <span className="eyebrow">Fixed grid. Fluid motion.</span>
                  <h1>Fluid pixels.</h1>
                  <p>4px squares. 1.5px gaps.<br />Nothing moves but the pattern.</p>
                  <a className="hero-link" href="#clicked">Click through ↗</a>
                </div>
              )}
            </div>
          </div>

          <div className="preview-footer">
            <span>React · Three.js · GLSL</span>
            <label className="content-toggle"><input type="checkbox" checked={showContent} onChange={(event) => setShowContent(event.target.checked)} />Hero content</label>
          </div>
        </section>

        <aside className="settings" aria-label="Shader settings">
          <div className="settings-title"><h2>Parameters</h2><button className="text-button" onClick={reset}>Reset</button></div>
          {fields.map(({ key, label, min, max, step }) => (
            <label className="parameter" key={key} htmlFor={`setting-${key}`}>
              <span><span>{label}</span><output aria-hidden="true">{settings[key].toFixed(key === 'warpStrength' ? 1 : 2)}</output></span>
              <input id={`setting-${key}`} type="range" min={min} max={max} step={step} value={settings[key]} onChange={(event) => setSettings((current) => ({ ...current, [key]: Number(event.target.value) }))} />
            </label>
          ))}

          <dl className="constants">
            <div><dt>Square</dt><dd>4px</dd></div>
            <div><dt>Gap</dt><dd>1.5px</dd></div>
            <div><dt>Background</dt><dd>#100E06</dd></div>
            <div><dt>Squares / accent</dt><dd>#1B1913</dd></div>
          </dl>
          <p className="implementation">One plane. One shader pass.<br />Noise sampled at each cell’s center.</p>
        </aside>
      </main>
    </>
  );
}
