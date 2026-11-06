import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// BLD-02 smoke / Module 0 exit: dist/merged opens from file:// offline and shows S-1 with no errors.
// E2E-01 (loading clears to a card) and E2E-02 (full pass) extend this once boot exists (Module 4).
const MERGED = resolve(__dirname, '../../dist/merged');
const APP_URL = `${pathToFileURL(join(MERGED, 'index.html')).href}?cr_lang=english&cr_book=animals&cr_user_id=test-user`;
const ALLOWED_SCHEMES = new Set(['file:', 'data:', 'blob:']);

test.beforeAll(() => {
  if (!existsSync(join(MERGED, 'index.html'))) {
    throw new Error('dist/merged missing: run `npm run build && npm run build:merged` first.');
  }
});

test('BLD-02 merged build loads from file:// offline and shows the loading screen', async ({ page }) => {
  const requests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));

  await page.goto(APP_URL);

  const loading = page.getByTestId('loading');
  await expect(loading).toBeVisible();
  await expect(page.getByRole('status', { name: 'Loading' })).toBeVisible();
  await expect(loading).toHaveText('');

  // CSS was extracted to a file and applied (S-1 background is --bg).
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(234, 244, 255)');

  await page.waitForLoadState('load');
  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((u) => !ALLOWED_SCHEMES.has(new URL(u).protocol))).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
