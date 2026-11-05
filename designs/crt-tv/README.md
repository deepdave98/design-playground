# CRT TV

RGB phosphor dots, VHS jitter, tracking noise, and grain. The D model and bloom are demo content; the CRT pass works with any Three.js scene.

```ts
import { CrtPass } from './src/CrtPass';

const crt = new CrtPass();
composer.addPass(crt); // After the scene, before OutputPass.
crt.time = elapsedSeconds;
crt.progress = 1; // 0 bypasses the effect.
```

EffectComposer sets the resolution. The phosphor mask uses 2 drawing-buffer pixels per cell. `chromaticOffset` defaults to `0.0025` in UV units. The demo pauses when hidden or offscreen, respects reduced motion, and disposes its GPU resources on teardown.

Adapted from the CRT/neon effect in [Maxime Heckel's portfolio](https://maximeheckel.com/), through the Deep Dave landing-page study. Value noise is credited to [Morgan McGuire](https://www.shadertoy.com/view/4dS3Wd). The D monogram is Deep Dave's demo asset.
