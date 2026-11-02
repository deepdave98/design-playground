import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WordmarkDistortion } from './WordmarkDistortion';
import cursor from '../assets/cursor.svg';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <main className="page">
      <WordmarkDistortion
        src={cursor}
        alt="Cursor"
        aspect={1655.29 / 278.83}
        animateBackground={!new URLSearchParams(location.search).has('still')}
        className="wordmark-band"
      />
    </main>
  </StrictMode>,
);
