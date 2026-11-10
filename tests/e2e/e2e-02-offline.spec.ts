import { expect, test } from '@playwright/test';
import { appUrl, assertMergedBuild, audioStarts, countAudioStarts, disallowedRequests, recordPage } from './helpers';

// E2E-02 (NFR-01, NFR-10, K-2): offline load and a pass through every reachable card issues only
// file:/data:/blob: requests, with no console.error and no uncaught exception. From Better every card is
// reachable with the arrows (FR-17): each is revealed on the way forward, then the pass returns to card 1.
test.beforeAll(assertMergedBuild);

const WORDS = ['Alligator', 'Bear', 'Cat', 'Dog', 'Elephant'];

test('E2E-02 load and a pass through every card stay offline and error-free', async ({ page }) => {
  const log = recordPage(page);
  await countAudioStarts(page);
  await page.goto(appUrl());
  const card = page.getByTestId('card-current');
  const next = page.getByTestId('btn-next');

  for (const [i, word] of WORDS.entries()) {
    await expect(page.getByTestId('face-front').locator('img')).toHaveJSProperty('complete', true);
    await card.tap();
    await expect(page.getByTestId('face-back')).toHaveText(word);
    await expect.poll(() => audioStarts(page)).toBe(i + 1);
    if (i < WORDS.length - 1) await next.tap();
  }
  for (let i = WORDS.length - 1; i > 0; i--) await page.getByTestId('btn-prev').tap();
  await expect(card).toHaveAttribute('data-card-id', 'alligator');
  // Let the background preload of the remaining cards finish.
  await page.waitForLoadState('networkidle');

  expect(log.requests.length).toBeGreaterThan(0);
  expect(disallowedRequests(log.requests)).toEqual([]);
  expect(log.consoleErrors).toEqual([]);
  expect(log.pageErrors).toEqual([]);
});
