import { expect, test } from '@playwright/test';
import { appUrl, assertMergedBuild, audioStarts, countAudioStarts, disallowedRequests, recordPage } from './helpers';

// E2E-02 (NFR-01, NFR-10, K-2): offline load and a pass through every reachable card issues only
// file:/data:/blob: requests, with no console.error and no uncaught exception. At MVP the only reachable
// card is the first one (navigation arrives with FR-16/FR-17), so the pass is its front and back.
test.beforeAll(assertMergedBuild);

test('E2E-02 load and reveal stay offline and error-free', async ({ page }) => {
  const log = recordPage(page);
  await countAudioStarts(page);
  await page.goto(appUrl());
  const card = page.getByTestId('card-current');
  await expect(page.getByTestId('face-front').locator('img')).toHaveJSProperty('complete', true);

  await card.tap();
  await expect(page.getByTestId('face-back')).toBeVisible();
  await expect.poll(() => audioStarts(page)).toBe(1);
  // Let the background preload of the remaining cards finish.
  await page.waitForLoadState('networkidle');

  expect(log.requests.length).toBeGreaterThan(0);
  expect(disallowedRequests(log.requests)).toEqual([]);
  expect(log.consoleErrors).toEqual([]);
  expect(log.pageErrors).toEqual([]);
});
