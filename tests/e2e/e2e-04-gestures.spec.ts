import { expect, test, type Page } from '@playwright/test';
import { RUBBER_BAND, SLIDE_MS } from '../../src/ui/gestures';
import { appUrl, assertMergedBuild, currentFace, recordPage, startAt, touchDriver, type TouchDriver } from './helpers';

// E2E-04 (FR-20, AC-20…AC-25): touch gestures classified per UISPEC §U.8, driven through CDP touch events
// with explicit timestamps so each gesture's duration is exact.
test.beforeAll(assertMergedBuild);

const current = (page: Page) => page.getByTestId('card-current');
/** Steps from (0, 0) to (dx, dy), evenly spaced. */
const line = (dx: number, dy: number, steps: number): Array<[number, number]> =>
  Array.from({ length: steps }, (_, i) => [(dx * (i + 1)) / steps, (dy * (i + 1)) / steps]);

async function centre(page: Page): Promise<[number, number]> {
  const box = await current(page).boundingBox();
  if (box === null) throw new Error('no current card');
  return [box.x + box.width / 2, box.y + box.height / 2];
}

/** The track's horizontal translation, in px. */
function trackOffset(page: Page): Promise<number> {
  return page
    .locator('.carousel-track')
    .evaluate((el) => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);
}

async function swipe(page: Page, touch: TouchDriver, dx: number, dy: number, ms: number, steps = 6): Promise<void> {
  await touch.gesture(await centre(page), line(dx, dy, steps), ms);
  await page.waitForTimeout(SLIDE_MS + 50);
}

async function open(page: Page, cardId?: string): Promise<TouchDriver> {
  if (cardId !== undefined) await startAt(page, cardId);
  await page.goto(appUrl());
  await expect(current(page)).toHaveAttribute('data-card-id', cardId ?? 'alligator');
  return touchDriver(page);
}

test('E2E-04 AC-20 a 120 px swipe moves exactly one card each way', async ({ page }) => {
  const log = recordPage(page);
  const touch = await open(page, 'cat');
  await swipe(page, touch, -120, 0, 200);
  await expect(current(page)).toHaveAttribute('data-card-id', 'dog');
  await expect(currentFace(page, 'front')).toBeVisible();
  await swipe(page, touch, 120, 0, 200);
  await expect(current(page)).toHaveAttribute('data-card-id', 'cat');
  expect(await trackOffset(page)).toBe(0);
  expect(log.consoleErrors).toEqual([]);
  expect(log.pageErrors).toEqual([]);
});

test('E2E-04 AC-21 past either end the group follows at 30% and the card stays', async ({ page }) => {
  const touch = await open(page);
  await touch.gesture(await centre(page), line(120, 0, 6), 200, false);
  const pulled = await trackOffset(page);
  expect(pulled).toBeGreaterThanOrEqual(120 * (RUBBER_BAND - 0.05));
  expect(pulled).toBeLessThanOrEqual(120 * (RUBBER_BAND + 0.05));
  await touch.release();
  await page.waitForTimeout(SLIDE_MS + 50);
  await expect(current(page)).toHaveAttribute('data-card-id', 'alligator');
  expect(await trackOffset(page)).toBe(0);

  // A neighbour in the drag direction: the group follows 1:1.
  await touch.gesture(await centre(page), line(-60, 0, 6), 300, false);
  expect(await trackOffset(page)).toBeCloseTo(-60, 0);
  await touch.release();
  await page.waitForTimeout(SLIDE_MS + 50);
  await expect(current(page)).toHaveAttribute('data-card-id', 'bear');
});

test('E2E-04 AC-21 swiping left on the last card keeps it current', async ({ page }) => {
  const touch = await open(page, 'elephant');
  await touch.gesture(await centre(page), line(-120, 0, 6), 200, false);
  const pulled = await trackOffset(page);
  expect(pulled).toBeLessThanOrEqual(-120 * (RUBBER_BAND - 0.05));
  expect(pulled).toBeGreaterThanOrEqual(-120 * (RUBBER_BAND + 0.05));
  await touch.release();
  await page.waitForTimeout(SLIDE_MS + 50);
  await expect(current(page)).toHaveAttribute('data-card-id', 'elephant');
  expect(await trackOffset(page)).toBe(0);
});

test('E2E-04 AC-22 a short slow drag cancels and snaps back', async ({ page }) => {
  const touch = await open(page, 'cat');
  await swipe(page, touch, -30, 0, 600);
  await expect(current(page)).toHaveAttribute('data-card-id', 'cat');
  expect(await trackOffset(page)).toBe(0);
  await expect(currentFace(page, 'front')).toBeVisible();
  await expect(currentFace(page, 'back')).toHaveCount(0);
});

test('E2E-04 AC-23 a fast 24 px flick navigates', async ({ page }) => {
  const touch = await open(page, 'cat');
  await swipe(page, touch, -24, 0, 40, 2);
  await expect(current(page)).toHaveAttribute('data-card-id', 'dog');
});

test('E2E-04 AC-24 a vertical-dominant drag is ignored', async ({ page }) => {
  const touch = await open(page, 'cat');
  await swipe(page, touch, -40, 60, 200);
  await expect(current(page)).toHaveAttribute('data-card-id', 'cat');
  await expect(currentFace(page, 'back')).toHaveCount(0);
});

test('E2E-04 AC-25 a 12 px move within 100 ms is not a tap', async ({ page }) => {
  const touch = await open(page, 'cat');
  await swipe(page, touch, -12, 0, 100, 3);
  await expect(current(page)).toHaveAttribute('data-card-id', 'cat');
  await expect(currentFace(page, 'back')).toHaveCount(0);
  await expect(current(page)).toHaveAccessibleName('Card 3 of 5. Activate to reveal the word.');
});
