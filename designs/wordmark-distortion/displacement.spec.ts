import { test, expect } from '@playwright/test';
import { DisplacementField } from './src/displacement';

test('pointer movement pushes nearby cells and leaves distant cells at rest', () => {
  const field = new DisplacementField();
  field.push(0.5, 0.5, 0.02, 0.01);
  const center = 4 * (7 + 7 * field.size);
  expect(field.data[center]).toBeGreaterThan(0);
  expect(field.data[center + 1]).toBeLessThan(0);
  expect(Array.from(field.data.slice(0, 4))).toEqual([0, 0, 0, 0]);
  const peak = Math.max(...field.data);
  field.step(1 / 60);
  expect(Math.max(...field.data)).toBeLessThan(peak);
});

test('relaxation takes the same time at 30, 60, and 120 frames per second', () => {
  const peaks = [30, 60, 120].map(fps => {
    const field = new DisplacementField();
    field.push(0.5, 0.5, 0.1, -0.1);
    for (let frame = 0; frame < fps / 2; frame++) field.step(1 / fps);
    return Math.max(...field.data);
  });
  expect(peaks[0]).toBeCloseTo(peaks[1], 5);
  expect(peaks[1]).toBeCloseTo(peaks[2], 5);
});

test('the field reaches an exact clean frame after the pointer stops', () => {
  const field = new DisplacementField();
  field.push(0.5, 0.5, 0.1, -0.1);
  for (let frame = 0; frame < 120; frame++) field.step(1 / 60);
  expect(field.step(1 / 60)).toBe(false);
  expect(field.data.every(value => value === 0)).toBe(true);
});
