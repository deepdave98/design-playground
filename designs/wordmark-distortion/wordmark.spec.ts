import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, options?: object) {
      return getContext.call(this, type as never, type === 'webgl2' ? { ...options, preserveDrawingBuffer: true } : options);
    } as typeof getContext;
    (window as any).__wordmarkDraws = 0;
    const draw = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function (...args: Parameters<typeof draw>) {
      if ((this.canvas as HTMLCanvasElement).closest('[data-wordmark-distortion]')) (window as any).__wordmarkDraws++;
      return draw.apply(this, args);
    };
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

test('the pixel field evolves without pointer input', async ({ page }) => {
  await instrument(page);
  await page.goto('/designs/wordmark-distortion/');
  const host = page.locator('[data-wordmark-distortion]');
  await expect(host).toHaveAttribute('data-state', 'running');
  await expect(host).toHaveAttribute('data-draw-calls', '1');
  const original = await frameHash(page);
  await page.waitForTimeout(500);
  expect(await frameHash(page)).not.toBe(original);
});

test('pixel squares and gaps keep their CSS dimensions across pixel ratios', async ({ browser }) => {
  for (const deviceScaleFactor of [1, 2, 3]) {
    const context = await browser.newContext({ viewport: { width: 1000, height: 600 }, deviceScaleFactor, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await instrument(page);
    await page.goto('/designs/wordmark-distortion/');
    await expect(page.locator('[data-wordmark-distortion]')).toHaveAttribute('data-state', 'paused');
    const result = await page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
      const gl = canvas.getContext('webgl2')!;
      const bounds = canvas.getBoundingClientRect();
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      let visible = 0, invalid = 0;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width * 0.075; x++) {
          const index = 4 * (x + y * canvas.width);
          if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) <= 2) continue;
          visible++;
          const px = (x + 0.5) * bounds.width / canvas.width;
          const py = (y + 0.5) * bounds.height / canvas.height;
          if (px % 4.75 > 3.001 || py % 4.75 > 3.001) invalid++;
        }
      }
      return { visible, invalid };
    });
    expect(result.visible).toBeGreaterThan(20);
    expect(result.invalid).toBe(0);
    await context.close();
  }
});

test('hidden and offscreen instances stop GPU draws', async ({ page }) => {
  await instrument(page);
  await page.goto('/designs/wordmark-distortion/');
  const host = page.locator('[data-wordmark-distortion]');
  await expect(host).toHaveAttribute('data-state', 'running');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(host).toHaveAttribute('data-state', 'hidden');
  const hidden = await page.evaluate(() => (window as any).__wordmarkDraws);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).__wordmarkDraws)).toBe(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
    const spacer = document.createElement('div');
    spacer.id = 'spacer';
    spacer.style.height = '200vh';
    document.body.prepend(spacer);
  });
  await expect(host).toHaveAttribute('data-state', 'offscreen');
  const offscreen = await page.evaluate(() => (window as any).__wordmarkDraws);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).__wordmarkDraws)).toBe(offscreen);
  await page.locator('#spacer').evaluate(element => element.remove());
  await expect(host).toHaveAttribute('data-state', 'running');
});

test('context loss shows the SVG and restoration recovers the shader', async ({ page }) => {
  await instrument(page);
  await page.goto('/designs/wordmark-distortion/?still');
  const host = page.locator('[data-wordmark-distortion]');
  await expect(host).toHaveAttribute('data-state', 'idle');
  const original = await frameHash(page);
  await host.locator('canvas').evaluate((canvas: HTMLCanvasElement) => {
    const extension = canvas.getContext('webgl2')!.getExtension('WEBGL_lose_context')!;
    (window as any).__restoreWordmark = () => extension.restoreContext();
    extension.loseContext();
  });
  await expect(host).toHaveAttribute('data-state', 'fallback');
  await expect(host.locator('img')).toBeVisible();
  await page.waitForTimeout(150);
  await page.evaluate(() => (window as any).__restoreWordmark());
  await expect(host).toHaveAttribute('data-state', 'idle');
  await expect(host.locator('canvas')).toHaveCount(1);
  expect(await frameHash(page)).toBe(original);
});

test('phone touch distorts the logo without blocking vertical scrolling', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await instrument(page);
  await page.goto('/designs/wordmark-distortion/?still');
  const host = page.locator('[data-wordmark-distortion]');
  await expect(host).toHaveAttribute('data-state', 'idle');
  const original = await frameHash(page);
  const box = (await host.boundingBox())!;
  const y = Math.round(box.y + box.height * 0.55);
  const session = await context.newCDPSession(page);
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 80, y }] });
  for (const x of [100, 130, 160, 190, 220]) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y }] });
  }
  await expect(host).toHaveAttribute('data-state', 'active');
  expect(await frameHash(page)).not.toBe(original);
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(host).toHaveAttribute('data-state', 'idle', { timeout: 5000 });
  expect(await frameHash(page)).toBe(original);
  expect(await page.evaluate(() => document.documentElement.scrollWidth === innerWidth)).toBe(true);
  await page.screenshot({ path: '.context/wordmark-distortion-phone.png' });
  await page.evaluate(() => {
    const spacer = document.createElement('div');
    spacer.style.height = '150vh';
    document.body.append(spacer);
  });
  await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 195, y }] });
  for (const offset of [30, 60, 100, 150, 200]) {
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 195, y: y - offset }] });
  }
  await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  await context.close();
});
