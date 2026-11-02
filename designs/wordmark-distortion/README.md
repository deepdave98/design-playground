# Wordmark distortion

Pointer movement displaces a 15×15 float texture. A fragment shader uses it to offset the logo's UVs. The cells relax at the same rate across refresh rates and stop moving when the pointer stops.

```tsx
import { WordmarkDistortion } from './designs/wordmark-distortion/src';

<WordmarkDistortion src="/your-logo.svg" alt="Your brand" aspect={4} />
```

Requires React and Three.js. `aspect` is the logo's width divided by height. The logo occupies 80% of the container width and keeps its proportions. `className` and `style` size the container.

Mouse and touch use the same displacement field. Reduced motion keeps the logo still. Hidden or offscreen instances stop rendering; WebGL failures show the original image.
