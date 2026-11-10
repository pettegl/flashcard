import { expect, test } from '@playwright/test';
import { appUrl, assertMergedBuild, mergeVariant } from './helpers';

// PERF-01 (NFR-02, FR-10): a 100-card deck under 4× CPU throttling reaches the ready UI in < 10 s
// with no long task over 500 ms during boot.
test.beforeAll(assertMergedBuild);

let variant: ReturnType<typeof mergeVariant>;
test.beforeAll(() => {
  variant = mergeVariant('bigdeck');
});
test.afterAll(() => variant.remove());

test('PERF-01 bigdeck boots under 10 s at 4× CPU throttle with no long task over 500 ms', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __longTasks: number[] };
    w.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) w.__longTasks.push(entry.duration);
    }).observe({ type: 'longtask', buffered: true });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  const started = Date.now();
  await page.goto(appUrl(undefined, variant.root));
  await expect(page.getByTestId('card-current')).toBeVisible({ timeout: 10_000 });
  expect(Date.now() - started).toBeLessThan(10_000);

  const longTasks = await page.evaluate(() => (window as unknown as { __longTasks: number[] }).__longTasks);
  expect(Math.max(0, ...longTasks)).toBeLessThanOrEqual(500);
});
