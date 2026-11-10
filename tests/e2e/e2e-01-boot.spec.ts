import { expect, test } from '@playwright/test';
import { ALLOWED_SCHEMES, appUrl, assertMergedBuild, loadingSnapshot, recordLoadingScreen } from './helpers';

// E2E-01 (FR-10, AC-01, NFR-02, K-1): offline from file://, S-1 shows then gives way to a card in < 10 s.
test.beforeAll(assertMergedBuild);

test('E2E-01 loading screen clears to the first card in under 10 s offline', async ({ page }) => {
  const requests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await recordLoadingScreen(page);

  const started = Date.now();
  await page.goto(appUrl());
  const current = page.getByTestId('card-current');
  await expect(current).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - started).toBeLessThan(10_000);

  expect(await loadingSnapshot(page)).toEqual({ role: 'status', label: 'Loading', text: '' });
  await expect(page.getByTestId('loading')).toHaveCount(0);
  await expect(current).toHaveAttribute('data-card-id', 'alligator');
  await expect(page.getByTestId('face-front').locator('img')).toHaveJSProperty('naturalWidth', 800);

  expect(requests.filter((u) => !ALLOWED_SCHEMES.has(new URL(u).protocol))).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('E2E-01 bad launch params show E1 without requesting deck data', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));

  await page.goto(appUrl('cr_book=animals&cr_user_id=test-user'));
  await expect(page.getByRole('alert', { name: 'Content unavailable, code E1' })).toBeVisible();
  await expect(page.getByTestId('error-code')).toHaveText('E1');
  expect(requests.filter((u) => /\/(decks|lang)\//.test(u))).toEqual([]);
});
