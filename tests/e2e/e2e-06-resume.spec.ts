import { expect, test, type Page } from '@playwright/test';
import { appUrl, assertMergedBuild, recordPage } from './helpers';

// E2E-06 (FR-12, AC-36): progress saved by arrow navigation (FR-17) survives a reload; cleared storage
// starts over. Also AC-13/AC-14 in a real browser. The arrow part is Better only (retired at Great).
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
    await page.getByTestId('btn-next').tap();
    await expect(current(page)).toHaveAttribute('data-card-id', id);
  }
  // Only card_id is stored: no user id or other data (NFR-06).
  expect(await flashcardStorage(page)).toEqual({ [KEY]: '{"card_id":"dog"}' });

  await page.reload();
  await expect(current(page)).toHaveAttribute('data-card-id', 'dog');
  await expect(current(page)).toHaveAccessibleName('Card 4 of 5. Activate to reveal the word.');
  await expect(page.getByTestId('face-front').locator('img')).toBeVisible();
  await expect(page.getByTestId('face-back')).toHaveCount(0);

  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
  await expect(current(page)).toHaveAttribute('data-card-id', 'alligator');
  await expect(page.getByTestId('face-front')).toBeVisible();

  expect(log.consoleErrors).toEqual([]);
  expect(log.pageErrors).toEqual([]);
});

test('AC-13/AC-14 arrows move, reset the face, are disabled at the ends and work from the keyboard', async ({
  page,
}) => {
  await page.goto(appUrl());
  const prev = page.getByRole('button', { name: 'Previous card' });
  const next = page.getByRole('button', { name: 'Next card' });
  await expect(prev).toHaveAttribute('aria-disabled', 'true');
  await expect(next).toHaveAttribute('aria-disabled', 'false');

  // Targets ≥ 44 px (56 px circles) and the whole S-4 block inside the 360×640 viewport.
  for (const button of [prev, next]) {
    const box = await button.boundingBox();
    expect(box?.width).toBe(56);
    expect(box?.height).toBe(56);
    expect((box?.y ?? Infinity) + 56).toBeLessThanOrEqual(640);
  }

  // Playwright treats aria-disabled as not enabled; force the tap a child could still make.
  await prev.tap({ force: true });
  await expect(current(page)).toHaveAttribute('data-card-id', 'alligator');

  await current(page).tap();
  await expect(page.getByTestId('face-back')).toHaveText('Alligator');
  await next.tap();
  await expect(current(page)).toHaveAttribute('data-card-id', 'bear');
  await expect(page.getByTestId('face-front').locator('img')).toBeVisible();
  await expect(page.getByTestId('face-back')).toHaveCount(0);
  await expect(prev).toHaveAttribute('aria-disabled', 'false');

  // Native buttons: Enter and Space activate them.
  await next.focus();
  await page.keyboard.press('Enter');
  await expect(current(page)).toHaveAttribute('data-card-id', 'cat');
  await page.keyboard.press('Space');
  await expect(current(page)).toHaveAttribute('data-card-id', 'dog');
  await next.tap();
  await expect(current(page)).toHaveAttribute('data-card-id', 'elephant');
  await expect(next).toHaveAttribute('aria-disabled', 'true');
  await expect(next).toHaveCSS('opacity', '0.3');

  await next.tap({ force: true });
  await expect(current(page)).toHaveAttribute('data-card-id', 'elephant');

  // Landscape: card + 16 px + arrows still fit (252 + 16 + 56 ≤ 360).
  await page.setViewportSize({ width: 640, height: 360 });
  const box = await next.boundingBox();
  expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(
    true,
  );
});
