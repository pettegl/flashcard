import { expect, test, type Page } from '@playwright/test';
import { appUrl, assertMergedBuild, currentFace, recordPage, tapPeek } from './helpers';

// E2E-06 (FR-12, AC-36): progress saved by navigation survives a reload; cleared storage starts over.
// At Great the navigation is a tap on the right peek (FR-19); the Better arrow part retired with FR-17.
test.beforeAll(assertMergedBuild);

const KEY = 'flashcard:v1:english:animals';
const current = (page: Page) => page.getByTestId('card-current');

function flashcardStorage(page: Page): Promise<Record<string, string | null>> {
  return page.evaluate(() =>
    Object.fromEntries(
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('flashcard:'))
        .map((k) => [k, window.localStorage.getItem(k)]),
    ),
  );
}

test('E2E-06 resumes on dog after a reload, and on alligator once storage is cleared', async ({ page }) => {
  const log = recordPage(page);
  await page.goto(appUrl());
  await expect(current(page)).toHaveAttribute('data-card-id', 'alligator');

  for (const id of ['bear', 'cat', 'dog']) {
    await tapPeek(page, 'next');
    await expect(current(page)).toHaveAttribute('data-card-id', id);
  }
  // Only card_id is stored: no user id or other data (NFR-06).
  expect(await flashcardStorage(page)).toEqual({ [KEY]: '{"card_id":"dog"}' });

  await page.reload();
  await expect(current(page)).toHaveAttribute('data-card-id', 'dog');
  await expect(current(page)).toHaveAccessibleName('Card 4 of 5. Activate to reveal the word.');
  await expect(currentFace(page, 'front').locator('img')).toBeVisible();
  await expect(page.getByTestId('face-back')).toHaveCount(0);

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(current(page)).toHaveAttribute('data-card-id', 'alligator');
  await expect(currentFace(page, 'front')).toBeVisible();

  expect(log.consoleErrors).toEqual([]);
  expect(log.pageErrors).toEqual([]);
});
