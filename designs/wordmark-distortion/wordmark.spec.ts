import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, options?: object) {
      return getContext.call(this, type as never, type === 'webgl2' ? { ...options, preserveDrawingBuffer: true } : options);
    } as typeof getContext;
  });
}

async function frameHash(page: Page) {
  return page.locator('[data-wordmark-distortion] canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2')!;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let hash = 2166136261;
    for (const byte of pixels) hash = Math.imul(hash ^ byte, 16777619);
    return hash >>> 0;
  });
}

test('the wordmark deforms under the pointer and returns to the exact original frame', async ({ page }) => {
  await instrument(page);
  await page.goto('/designs/wordmark-distortion/?still');
  const host = page.getByRole('img', { name: 'Orbit', exact: true });
  await expect(host).toHaveAttribute('data-state', 'idle');
  await expect(host.locator('canvas')).toHaveCount(1);
  await expect(host).toHaveAttribute('data-draw-calls', '1');
  const original = await frameHash(page);
  const box = (await host.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.55);
  await page.mouse.move(box.x + box.width * 0.65, box.y + box.height * 0.55, { steps: 12 });
  await expect(host).toHaveAttribute('data-state', 'active');
  expect(await frameHash(page)).not.toBe(original);
  await expect(host).toHaveAttribute('data-state', 'idle', { timeout: 5000 });
  expect(await frameHash(page)).toBe(original);
  await page.screenshot({ path: '.context/wordmark-distortion-rest.png' });
});

test('reduced motion leaves the logo still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await instrument(page);
  await page.goto('/designs/wordmark-distortion/');
  const host = page.locator('[data-wordmark-distortion]');
  await expect(host).toHaveAttribute('data-state', 'paused');
  const original = await frameHash(page);
  await host.hover();
  await page.mouse.move(800, 450, { steps: 8 });
  expect(await frameHash(page)).toBe(original);
});

test('the original SVG stays visible when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, options?: object) {
      return type === 'webgl2' ? null : getContext.call(this, type as never, options);
    } as typeof getContext;
  });
  await page.goto('/designs/wordmark-distortion/');
  const host = page.getByRole('img', { name: 'Orbit', exact: true });
  await expect(host).toHaveAttribute('data-state', 'fallback');
  await expect(host.locator('canvas')).toHaveCount(0);
  await expect(host.locator('img')).toBeVisible();
  expect(await host.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
});
