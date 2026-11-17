import { expect, test, type Page } from '@playwright/test';
import { SLIDE_MS } from '../../src/ui/gestures';
import { SIDE_OPACITY, SIDE_SCALE } from '../../src/ui/computeLayout';
import {
  appUrl,
  assertMergedBuild,
  audioStarts,
  countAudioStarts,
  currentFace,
  recordPage,
  recordTapTimes,
  secondTapGap,
  startAt,
  tapPeek,
} from './helpers';

// E2E-05 (FR-18, FR-19, FR-22; AC-15…AC-19, AC-28): the peeks, and peek taps that move one card.
test.beforeAll(assertMergedBuild);

const current = (page: Page) => page.getByTestId('card-current');
const peek = (page: Page, side: 'prev' | 'next') => page.getByTestId(`card-peek-${side}`);

/** Width of the part of `side`'s peek inside the viewport. */
async function sliver(page: Page, side: 'prev' | 'next'): Promise<number> {
  const box = await peek(page, side).boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  if (box === null) throw new Error(`no ${side} peek`);
  return Math.min(box.x + box.width, width) - Math.max(box.x, 0);
}

test('E2E-05 AC-15 AC-18 AC-19 peek taps move one card on its front with no audio', async ({ page }) => {
  const log = recordPage(page);
  await countAudioStarts(page);
  await startAt(page, 'cat');
  await page.goto(appUrl());
  await expect(current(page)).toHaveAttribute('data-card-id', 'cat');

  // AC-15: a scaled, faded peek each side, each with a visible sliver.
  for (const side of ['prev', 'next'] as const) {
    const style = await peek(page, side).evaluate((el) => {
      const cs = getComputedStyle(el);
      return { opacity: Number(cs.opacity), scale: new DOMMatrixReadOnly(cs.transform).a };
    });
    expect(style.opacity).toBeCloseTo(SIDE_OPACITY, 5);
    expect(style.scale).toBeCloseTo(SIDE_SCALE, 5);
    expect(await sliver(page, side)).toBeGreaterThanOrEqual(24);
    await expect(peek(page, side).getByTestId('face-front')).toBeAttached();
  }
  await expect(peek(page, 'prev')).toHaveAttribute('data-card-id', 'bear');
  await expect(peek(page, 'next')).toHaveAttribute('data-card-id', 'dog');

  // AC-18: forward, unflipped, and the window rotates.
  await tapPeek(page, 'next');
  await expect(current(page)).toHaveAttribute('data-card-id', 'dog');
  await expect(currentFace(page, 'front')).toBeVisible();
  await expect(page.getByTestId('face-back')).toHaveCount(0);
  await expect(peek(page, 'prev')).toHaveAttribute('data-card-id', 'cat');
  await expect(peek(page, 'next')).toHaveAttribute('data-card-id', 'elephant');
  expect(await audioStarts(page)).toBe(0);

  await tapPeek(page, 'prev');
  await expect(current(page)).toHaveAttribute('data-card-id', 'cat');
  // AC-19
  await tapPeek(page, 'prev');
  await expect(current(page)).toHaveAttribute('data-card-id', 'bear');
  await expect(currentFace(page, 'front')).toBeVisible();
  expect(await audioStarts(page)).toBe(0);

  expect(log.consoleErrors).toEqual([]);
  expect(log.pageErrors).toEqual([]);
});

test('E2E-05 AC-16 AC-17 no peek past either end and no arrow buttons', async ({ page }) => {
  await page.goto(appUrl());
  await expect(current(page)).toHaveAttribute('data-card-id', 'alligator');
  await expect(peek(page, 'prev')).toHaveCount(0);
  await expect(peek(page, 'next')).toHaveAttribute('data-card-id', 'bear');
  await expect(page.getByRole('button', { name: /previous card|next card/i })).toHaveCount(0);

  await startAt(page, 'elephant');
  await page.reload();
  await expect(current(page)).toHaveAttribute('data-card-id', 'elephant');
  await expect(peek(page, 'next')).toHaveCount(0);
  await expect(peek(page, 'prev')).toHaveAttribute('data-card-id', 'dog');
  await expect(page.getByRole('button', { name: /previous card|next card/i })).toHaveCount(0);
});

test('E2E-05 AC-28 a second tap during the slide is ignored', async ({ page }) => {
  await startAt(page, 'cat');
  await recordTapTimes(page);

  // Under load the second tap can land after the lock ends; such an attempt proves nothing, so retry.
  let checked = false;
  for (let attempt = 0; attempt < 5 && !checked; attempt++) {
    await page.goto(appUrl());
    await expect(current(page)).toHaveAttribute('data-card-id', 'cat');
    const box = await peek(page, 'next').boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    if (box === null) throw new Error('no next peek');
    // The right peek's visible part, where the new right peek lands.
    const point: [number, number] = [(Math.max(box.x, 0) + width) / 2, box.y + box.height / 2];

    await page.touchscreen.tap(...point);
    await page.waitForTimeout(100);
    await page.touchscreen.tap(...point);
    await page.waitForTimeout(SLIDE_MS + 100);
    if (!((await secondTapGap(page)) < SLIDE_MS - 20)) continue;
    checked = true;

    await expect(current(page)).toHaveAttribute('data-card-id', 'dog');
    await expect(currentFace(page, 'back')).toHaveCount(0);
    // Once the slide has ended, the same tap is honoured again.
    await page.touchscreen.tap(...point);
    await page.waitForTimeout(SLIDE_MS + 50);
    await expect(current(page)).toHaveAttribute('data-card-id', 'elephant');
  }
  expect(checked, 'second tap landed within the slide in at least one attempt').toBe(true);
});
