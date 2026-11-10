import { expect, test } from '@playwright/test';
import { ALLOWED_SCHEMES, appUrl, assertMergedBuild, loadingSnapshot, recordLoadingScreen } from './helpers';

// BLD-02 smoke / Module 0 exit: dist/merged opens from file:// offline and shows S-1 with no errors.
// Since boot (Module 4) S-1 can clear within a frame, so its appearance is recorded in-page.
test.beforeAll(assertMergedBuild);

test('BLD-02 merged build loads from file:// offline and shows the loading screen', async ({ page }) => {
  const requests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => pageErrors.push(e.message));
  await recordLoadingScreen(page);

  await page.goto(appUrl());
  await page.waitForLoadState('load');

  expect(await loadingSnapshot(page)).toEqual({ role: 'status', label: 'Loading', text: '' });

  // CSS was extracted to a file and applied (S-1 background is --bg).
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(234, 244, 255)');

  expect(requests.length).toBeGreaterThan(0);
  expect(requests.filter((u) => !ALLOWED_SCHEMES.has(new URL(u).protocol))).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
