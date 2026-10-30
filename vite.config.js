import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const root = fileURLToPath(new URL('.', import.meta.url));
const designs = readdirSync(resolve(root, 'designs'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => resolve(root, 'designs', entry.name, 'index.html'))
  .filter(existsSync);

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: [resolve(root, 'index.html'), ...designs],
    },
  },
});
