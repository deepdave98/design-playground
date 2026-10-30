import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

async function instrument(page: Page) {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, options?: object) {
      // Read completed frames in tests; the production renderer does not retain them.
      return original.call(this, type as never, type === 'webgl2' ? { ...options, preserveDrawingBuffer: true } : options);
    } as typeof original;
    (window as any).__draws = 0;
    const draw = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function (...args: Parameters<typeof draw>) {
      if ((this.canvas as HTMLCanvasElement).closest('[data-fluid-pixels]')) (window as any).__draws++;
      return draw.apply(this, args);
    };
  });
}

async function frame(page: Page) {
  return page.locator('[data-fluid-pixels] canvas').evaluate((canvas: HTMLCanvasElement) => {
    const gl = canvas.getContext('webgl2')!;
    const width = canvas.width, height = canvas.height;
    const bounds = canvas.getBoundingClientRect();
    const sx = width / bounds.width, sy = height / bounds.height;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const palette = new Set<string>();
    let invalidGridPixels = 0, foregroundPixels = 0, partialCells = 0;
    const cells = new Map<string, number>();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const color = `${pixels[i]},${pixels[i + 1]},${pixels[i + 2]},${pixels[i + 3]}`;
        palette.add(color);
        const px = (x + 0.5) / sx, py = bounds.height - (y + 0.5) / sy;
        const cx = Math.floor(px / 5.5), cy = Math.floor(py / 5.5);
        const lx = px - cx * 5.5, ly = py - cy * 5.5;
        const visible = color === '27,25,19,255';
        if (visible) {
          foregroundPixels++;
          if (lx > 4.001 || ly > 4.001) invalidGridPixels++;
        }
        if (lx > 0.01 && lx < 3.99 && ly > 0.01 && ly < 3.99) {
          const key = `${cx},${cy}`;
          const previous = cells.get(key);
          if (previous !== undefined && previous !== Number(visible)) partialCells++;
          cells.set(key, Number(visible));
        }
      }
    }
    const samples: number[] = [];
    for (let cy = 0; cy < Math.floor(bounds.height / 5.5); cy++) {
      for (let cx = 0; cx < Math.floor(bounds.width / 5.5); cx++) samples.push(cells.get(`${cx},${cy}`) ?? -1);
    }
    return { palette: [...palette].sort(), invalidGridPixels, partialCells, samples, fraction: foregroundPixels / (width * height), width, height };
  });
}

test('exact two-color palette, whole fixed cells, one draw call, and matching CSS geometry across DPRs', async ({ browser }) => {
  let reference: number[] | undefined;
  for (const deviceScaleFactor of [1, 1.5, 2, 3]) {
    const context = await browser.newContext({ viewport: { width: 512, height: 384 }, deviceScaleFactor, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await instrument(page);
    await page.goto('/designs/fluid-pixels/?embed');
    const host = page.locator('[data-fluid-pixels]');
    await expect(host).toHaveAttribute('data-state', 'paused');
    await expect(host).toHaveAttribute('data-draw-calls', '1');
    const result = await frame(page);
    expect(result.palette).toEqual(['20,18,8,255', '27,25,19,255']);
    expect(result.invalidGridPixels).toBe(0);
    expect(result.partialCells).toBe(0);
    expect(result.fraction).toBeGreaterThan(0.02);
    expect(result.fraction).toBeLessThan(0.5);
    if (reference) expect(result.samples).toEqual(reference);
    reference = result.samples;
    await context.close();
  }
});

test('the formations evolve while every square stays on the grid', async ({ page }) => {
  await instrument(page);
  await page.goto('/designs/fluid-pixels/?embed');
  await expect(page.locator('[data-fluid-pixels]')).toHaveAttribute('data-state', 'running');
  await expect(page.locator('[data-fluid-pixels]')).toHaveAttribute('data-draw-calls', '1');
  const first = await frame(page);
  await page.waitForTimeout(1200);
  const second = await frame(page);
  expect(second.samples.filter((cell, i) => cell !== first.samples[i]).length).toBeGreaterThan(5);
  expect(second.invalidGridPixels).toBe(0);
  expect(second.partialCells).toBe(0);
});

test('pause and tab visibility stop GPU draws; hero links remain clickable', async ({ page }) => {
  await instrument(page);
  await page.goto('/designs/fluid-pixels/');
  const host = page.locator('[data-fluid-pixels]');
  await expect(host).toHaveAttribute('data-state', 'running');
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(host).toHaveAttribute('data-state', 'paused');
  const paused = await page.evaluate(() => (window as any).__draws);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).__draws)).toBe(paused);
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect(host).toHaveAttribute('data-state', 'running');
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(host).toHaveAttribute('data-state', 'hidden');
  const hidden = await page.evaluate(() => (window as any).__draws);
  await page.waitForTimeout(150);
  expect(await page.evaluate(() => (window as any).__draws)).toBe(hidden);
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect(host).toHaveAttribute('data-state', 'running');
  await page.getByRole('checkbox', { name: 'Hero content' }).check();
  await page.getByRole('link', { name: 'Click through' }).click();
  await expect(page).toHaveURL(/#clicked$/);
});

test('solid background without WebGL', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, options?: object) {
      return type === 'webgl2' ? null : original.call(this, type as never, options);
    } as typeof original;
  });
  await page.goto('/designs/fluid-pixels/?embed');
  const host = page.locator('[data-fluid-pixels]');
  await expect(host).toHaveAttribute('data-state', 'fallback');
  await expect(host).toHaveCSS('background-color', 'rgb(20, 18, 8)');
  await expect(host.locator('canvas')).toHaveCount(0);
});

test('mobile preview, default parameters, and captures', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/designs/fluid-pixels/');
  await expect(page.getByRole('slider', { name: /Noise density/ })).toHaveValue('0.8');
  await expect(page.getByRole('slider', { name: /Animation speed/ })).toHaveValue('0.26');
  await expect(page.getByRole('slider', { name: /Domain warp/ })).toHaveValue('2.2');
  await expect(page.getByRole('slider', { name: /Visibility threshold/ })).toHaveValue('0.66');
  await expect(page.getByRole('slider', { name: /Cell threshold jitter/ })).toHaveValue('0.18');
  await page.screenshot({ path: '.context/fluid-pixels-playground.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.locator('[data-fluid-pixels]')).toHaveAttribute('data-state', 'paused');
  await page.screenshot({ path: '.context/fluid-pixels-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/designs/fluid-pixels/?embed');
  await expect(page.locator('[data-fluid-pixels]')).toHaveAttribute('data-state', 'paused');
  await page.screenshot({ path: '.context/fluid-pixels-preview.png' });
});
