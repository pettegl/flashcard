import { expect, test } from '@playwright/test';
import { appUrl, assertMergedBuild } from './helpers';

// PERF-02 (NFR-03, K-3), CI baseline: tap → flip start latency, median ≤ 100 ms over 20 reveals at 4× CPU
// throttling. Until the flip animation (FR-21) the flip is the instant face swap, so a sample runs from the
// tap's pointerup (event.timeStamp, the performance.now() time base) to the first animation frame after
// face-back enters the DOM. The reference-device run is recorded separately by the owner.
test.beforeAll(assertMergedBuild);

const SAMPLES = 20;
const BUDGET_MS = 100;

test('PERF-02 tap → flip start median ≤ 100 ms over 20 reveals (4× CPU throttle)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __flipSamples: number[] };
    w.__flipSamples = [];
    const backShown = () => document.querySelector('[data-testid="face-back"]') !== null;
    let start: number | null = null;
    // Only a tap on the front (a reveal) starts a sample; flip-backs are not timed.
    window.addEventListener(
      'pointerup',
      (event) => {
        start = backShown() ? null : event.timeStamp;
      },
      true,
    );
    new MutationObserver(() => {
      if (start === null || !backShown()) return;
      const t0 = start;
      start = null;
      requestAnimationFrame(() => w.__flipSamples.push(performance.now() - t0));
    }).observe(document, { childList: true, subtree: true });
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });

  await page.goto(appUrl());
  const card = page.getByTestId('card-current');
  await expect(page.getByTestId('face-front').locator('img')).toHaveJSProperty('complete', true);

  const samples = () => page.evaluate(() => (window as unknown as { __flipSamples: number[] }).__flipSamples);
  for (let i = 1; i <= SAMPLES; i++) {
    await card.tap();
    await expect(page.getByTestId('face-back')).toBeVisible();
    await expect.poll(async () => (await samples()).length).toBe(i);
    await card.tap();
    await expect(page.getByTestId('face-front')).toBeVisible();
  }

  const values = await samples();
  const sorted = [...values].sort((a, b) => a - b);
  const median = (sorted[SAMPLES / 2 - 1] + sorted[SAMPLES / 2]) / 2;
  const p90 = sorted[Math.ceil(0.9 * SAMPLES) - 1];
  // The first reveal also creates the AudioContext (DEVSPEC OQ-14), so it is reported on its own.
  const summary = `first ${values[0].toFixed(1)} ms, median ${median.toFixed(1)} ms, p90 ${p90.toFixed(1)} ms, max ${sorted[SAMPLES - 1].toFixed(1)} ms; samples ${values.map((v) => v.toFixed(1)).join(', ')}`;
  test.info().annotations.push({ type: 'PERF-02', description: summary });
  console.log(`PERF-02 CI baseline (4× CPU): ${summary}`);

  expect(values).toHaveLength(SAMPLES);
  expect(median).toBeLessThanOrEqual(BUDGET_MS);
});
