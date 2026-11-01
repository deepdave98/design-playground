import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './designs',
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: process.env.PREVIEW_URL || 'http://127.0.0.1:8961',
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 900 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--force-color-profile=srgb'] },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:8961',
    reuseExistingServer: true,
  },
});
