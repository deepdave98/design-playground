# Fluid pixels

```tsx
import { FluidPixels } from './designs/fluid-pixels/src';

<section style={{ position: 'relative', isolation: 'isolate', overflow: 'hidden' }}>
  <FluidPixels />
  <div style={{ position: 'relative', zIndex: 1 }}>Your hero content</div>
</section>
```

The parent needs a height. Requires `react` and `three`.

To reuse it elsewhere, copy `src/FluidPixels.tsx`, `src/shaders.ts`, `src/simplex.ts`, `src/index.ts`, and `src/LICENSE.noise` together. `src/main.tsx`, `src/Playground.tsx`, and `src/styles.css` run the demo.

Defaults: density `0.8`, speed `0.26`, warpStrength `2.2`, threshold `0.66`, jitter `0.18`. Pass `paused` to freeze the current frame. The 4px squares and 1.5px gaps stay fixed in CSS pixels; the noise field uses 256 CSS pixels per unit. Colors are fixed to `#100E06` and `#1B1913`.

Stops when hidden or offscreen. Omit `paused` to follow reduced motion; an explicit value controls playback. Falls back to the background color without WebGL.
