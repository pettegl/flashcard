import { expect, test, type Page } from '@playwright/test';
import { appUrl, assertMergedBuild, currentFace, flipSettled, recordPage, startAt, tapVisiblePart } from './helpers';

// E2E-11 (FR-18, AC-32): rotating the device keeps the current card and its face, with the new geometry.
test.beforeAll(assertMergedBuild);

const current = (page: Page) => page.getByTestId('card-current');

test('E2E-11 AC-32 rotation keeps dog on its word and re-lays out the cards', async ({ page }) => {
  const log = recordPage(page);
  await page.setViewportSize({ width: 360, height: 640 });
  await startAt(page, 'dog');
  await page.goto(appUrl());
  await expect(current(page)).toHaveAttribute('data-card-id', 'dog');
  await tapVisiblePart(page, current(page));
  await flipSettled(page, 'back');
  await expect(currentFace(page, 'back')).toHaveText('Dog');

  await page.setViewportSize({ width: 640, height: 360 });
  await expect(current(page)).toHaveAttribute('data-card-id', 'dog');
  await expect(currentFace(page, 'back')).toHaveText('Dog');
  await expect(currentFace(page, 'front')).toHaveCount(0);
  await expect(current(page)).toHaveAccessibleName('Dog. Card 4 of 5. Activate to flip back.');

  // The new layout is applied without a slide (UISPEC §U.7), so it holds as soon as it renders.
  await expect
    .poll(async () => {
      const box = await current(page).boundingBox();
      return box && [Math.round(box.width), Math.round(box.height), Math.round(box.x + box.width / 2)];
    })
    .toEqual([336, 252, 320]);
  const next = await page.getByTestId('card-peek-next').boundingBox();
  if (next === null) throw new Error('no next peek');
  expect(Math.abs(640 - Math.max(next.x, 0) - 140)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  expect(log.consoleErrors).toEqual([]);
  expect(log.pageErrors).toEqual([]);
});
