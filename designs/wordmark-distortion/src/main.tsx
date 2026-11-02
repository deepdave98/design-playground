import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WordmarkDistortion } from './WordmarkDistortion';
import orbit from '../assets/orbit.svg';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="page">
      <WordmarkDistortion
        src={orbit}
        alt="Orbit"
        aspect={4}
        animateBackground={!new URLSearchParams(location.search).has('still')}
        className="wordmark-band"
      />
    </main>
  </StrictMode>,
);
