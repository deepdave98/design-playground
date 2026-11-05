import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, options?: object) {
      return original.call(this, type as never, type === 'webgl2' ? { ...options, preserveDrawingBuffer: true } : options);
    } as typeof original;
    (window as any).__crtDraws = 0;
    const draw = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function (...args: Parameters<typeof draw>) {
      if ((this.canvas as HTMLCanvasElement).closest('#crt-demo')) (window as any).__crtDraws++;
      return draw.apply(this, args);
    };
  });
}

async function pixels(page: Page) {
  return page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2')!;
    const bytes = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    let hash = 2166136261;
    const channels = [0, 0, 0];
    for (let index = 0; index < bytes.length; index += 4) {
      for (let channel = 0; channel < 3; channel++) {
        hash = Math.imul(hash ^ bytes[index + channel], 16777619);
        if (bytes[index + channel] > 60 && bytes[index + channel] > bytes[index + (channel + 1) % 3] + 20 && bytes[index + channel] > bytes[index + (channel + 2) % 3] + 20) channels[channel]++;
      }
    }
    return { hash: hash >>> 0, channels };
  });
}

test('CRT produces RGB phosphors and the control bypasses the effect', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await instrument(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/designs/crt-tv/');
  await expect(page.locator('#crt-demo')).toHaveAttribute('data-state', 'paused');
  const crt = await pixels(page);
  expect(crt.channels.every(count => count > 20)).toBe(true);
  const signal = page.getByRole('slider', { name: 'CRT', exact: true });
  await signal.focus();
  await signal.press('Home');
  await expect(signal).toHaveValue('0');
  const clean = await pixels(page);
  expect(clean.channels).toEqual([0, 0, 0]);
  expect(clean.hash).not.toBe(crt.hash);
  await signal.press('End');
  expect((await pixels(page)).hash).toBe(crt.hash);
  expect(errors).toEqual([]);
  await page.screenshot({ path: '.context/crt-tv-desktop.png' });
});

test('motion controls, reduced motion and hidden tabs stop drawing', async ({ page }) => {
  await instrument(page);
  await page.goto('/designs/crt-tv/');
  const host = page.locator('#crt-demo');
  await expect(host).toHaveAttribute('data-state', 'running');
  const before = await pixels(page);
  await page.waitForTimeout(200);
  expect((await pixels(page)).hash).not.toBe(before.hash);
  await page.getByRole('button', { name: 'Pause animation' }).click();
  await expect(host).toHaveAttribute('data-state', 'paused');
  const paused = await page.evaluate(() => (window as any).__crtDraws);
  const frozen = await pixels(page);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).__crtDraws)).toBe(paused);
  expect((await pixels(page)).hash).toBe(frozen.hash);
  await page.getByRole('button', { name: 'Play animation' }).click();
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(host).toHaveAttribute('data-state', 'hidden');
  const hidden = await page.evaluate(() => (window as any).__crtDraws);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).__crtDraws)).toBe(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(host).toHaveAttribute('data-state', 'paused');
});

test('phone layouts fit and touch controls work', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 320, height: 568 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/designs/crt-tv/');
  const host = page.locator('#crt-demo');
  await expect(host).toHaveAttribute('data-state', 'paused');
  for (const size of [{ width: 320, height: 568 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(size);
    expect(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
    expect(await page.locator('canvas').boundingBox()).toEqual({ x: 0, y: 0, ...size });
    await expect(page.getByRole('slider', { name: 'CRT', exact: true })).toBeInViewport();
  }
  await page.screenshot({ path: '.context/crt-tv-phone.png' });
  await page.getByRole('slider', { name: 'CRT', exact: true }).tap({ position: { x: 10, y: 8 } });
  expect(Number(await page.locator('#signal').inputValue())).toBeLessThan(0.5);
  await page.getByRole('button', { name: 'Play animation' }).tap();
  await expect(host).toHaveAttribute('data-state', 'running');
  await context.close();
});

test('WebGL failure shows a useful fallback and disables graphics controls', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, options?: object) {
      return type === 'webgl2' ? null : original.call(this, type as never, options);
    } as typeof original;
  });
  await page.goto('/designs/crt-tv/');
  await expect(page.locator('#crt-demo')).toHaveAttribute('data-state', 'fallback');
  await expect(page.getByRole('status')).toHaveText('WebGL is unavailable.');
  await expect(page.locator('#motion')).toBeDisabled();
  await expect(page.locator('#signal')).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Designs' })).toBeEnabled();
});

test('the scene recovers after losing its graphics context', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await instrument(page);
  await page.goto('/designs/crt-tv/');
  const host = page.locator('#crt-demo');
  await expect(host).toHaveAttribute('data-state', 'paused');
  const before = await pixels(page);
  await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    (window as any).__restoreCrt = () => extension.restoreContext();
    extension.loseContext();
  });
  await expect(host).toHaveAttribute('data-state', 'fallback');
  await page.waitForTimeout(150);
  await page.evaluate(() => (window as any).__restoreCrt());
  await expect(host).toHaveAttribute('data-state', 'paused');
  expect((await pixels(page)).hash).toBe(before.hash);
});

test('the gallery opens the CRT demo with its preview loaded', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const link = page.getByRole('link', { name: /CRT TV/ });
  expect(await link.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth === 1280)).toBe(true);
  await link.click();
  await expect(page).toHaveURL(/\/designs\/crt-tv\/$/);
  await expect(page.locator('#crt-demo')).toHaveAttribute('data-state', 'paused');
});
