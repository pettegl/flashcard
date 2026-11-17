import { expect, test, type Page } from '@playwright/test';
import { FLIP_MS } from '../../src/ui/gestures';
import { appUrl, assertMergedBuild, currentFace, recordTapTimes, secondTapGap, tapVisiblePart } from './helpers';

// E2E-09 (FR-21, FR-22; AC-26, AC-27, AC-30): the flip rotates about Y over FLIP_MS; reduced motion
// changes state at once and honours every tap.
test.beforeAll(assertMergedBuild);

const current = (page: Page) => page.getByTestId('card-current');

interface FlipSample {
  t: number;
  deg: number;
  back: boolean;
}

/** Samples the current card's Y rotation every animation frame until `stop()` (TESTSPEC E2E-09). */
async function startSampling(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __flip: FlipSample[]; __stop: boolean };
    w.__flip = [];
    w.__stop = false;
    const frame = () => {
      const card = document.querySelector('[data-testid="card-current"]');
      const inner = card?.querySelector('.card-inner');
      if (inner) {
        const m = new DOMMatrixReadOnly(getComputedStyle(inner).transform);
        w.__flip.push({
          t: performance.now(),
          deg: (Math.acos(Math.max(-1, Math.min(1, m.m11))) * 180) / Math.PI,
          back: card?.querySelector('[data-testid="face-back"]') !== null,
        });
      }
      if (!w.__stop) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
}

function stopSampling(page: Page): Promise<FlipSample[]> {
  return page.evaluate(() => {
    const w = window as unknown as { __flip: FlipSample[]; __stop: boolean };
    w.__stop = true;
    return w.__flip;
  });
}

test('E2E-09 AC-26 AC-27 the flip rotates through intermediate angles over FLIP_MS, once', async ({ page }) => {
  await recordTapTimes(page);
  // Under load the second tap can land after the flip lock ends; such an attempt proves nothing, so retry.
  let samples: FlipSample[] = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.goto(appUrl());
    await expect(current(page)).toHaveAttribute('data-card-id', 'alligator');
    await startSampling(page);
    await tapVisiblePart(page, current(page));
    // AC-27: a second tap 100 ms into the flip is ignored.
    await page.waitForTimeout(100);
    await tapVisiblePart(page, current(page));
    await page.waitForTimeout(FLIP_MS + 300);
    samples = await stopSampling(page);
    if ((await secondTapGap(page)) < FLIP_MS - 20) break;
    samples = [];
  }
  expect(samples.length, 'second tap landed within the flip in at least one attempt').toBeGreaterThan(0);

  const moving = samples.findIndex((s) => s.deg > 0.01);
  const done = samples.findIndex((s) => s.deg > 179.99);
  expect(moving).toBeGreaterThan(0);
  expect(done).toBeGreaterThan(moving);
  const intermediate = samples.slice(moving, done).filter((s) => s.deg < 179.99);
  expect(intermediate.length).toBeGreaterThanOrEqual(5);
  // Angles only grow: a single flip to the back, never a flip back.
  for (let i = moving + 1; i < samples.length; i++) expect(samples[i].deg).toBeGreaterThanOrEqual(samples[i - 1].deg - 0.01);
  // From the last frame at rest to the first frame at 180°.
  const duration = samples[done].t - samples[moving - 1].t;
  expect(duration).toBeGreaterThanOrEqual(FLIP_MS - 100);
  expect(duration).toBeLessThanOrEqual(FLIP_MS + 100);
  // The back face is in place before the rotation passes 90°.
  expect(samples.filter((s) => s.deg > 90).every((s) => s.back)).toBe(true);

  await expect(currentFace(page, 'back')).toHaveText('Alligator');
  await expect(currentFace(page, 'front')).toHaveCount(0);
});

test('E2E-09 AC-30 with reduced motion the word appears at once and rapid taps are honoured', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(appUrl());
  await expect(current(page)).toHaveAttribute('data-card-id', 'alligator');
  const inner = current(page).locator('.card-inner');
  expect(await inner.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');

  await tapVisiblePart(page, current(page));
  // Immediately: no linger of the front face and the final rotation, with no animation.
  expect(await currentFace(page, 'back').count()).toBe(1);
  expect(await currentFace(page, 'front').count()).toBe(0);
  expect(await inner.evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m11)).toBeCloseTo(-1, 5);

  // Rapid consecutive taps, no waits: back → front → back → front → back.
  for (let i = 0; i < 4; i++) await tapVisiblePart(page, current(page));
  await expect(currentFace(page, 'back')).toHaveText('Alligator');
  await expect(current(page)).toHaveAccessibleName('Alligator. Card 1 of 5. Activate to flip back.');
});
