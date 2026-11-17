import { expect, test, type Page } from '@playwright/test';
import { appUrl, assertMergedBuild, tapPeek } from './helpers';

// E2E-10 (FR-14, FR-18; AC-06, AC-15, AC-31): the §U.7 geometry at the supported viewports, and every
// fixture image drawn uncropped at its natural aspect.
test.beforeAll(assertMergedBuild);

const current = (page: Page) => page.getByTestId('card-current');

// UISPEC §U.7 worked vectors.
const VECTORS = [
  { w: 360, h: 640, wc: 280, hc: 210, sliver: 28 },
  { w: 640, h: 360, wc: 336, hc: 252, sliver: 140 },
  { w: 1280, h: 800, wc: 720, hc: 540, sliver: 268 },
];

for (const v of VECTORS) {
  test(`E2E-10 AC-31 geometry at ${v.w}x${v.h}`, async ({ page }) => {
    await page.setViewportSize({ width: v.w, height: v.h });
    await page.goto(appUrl());
    await expect(current(page)).toHaveAttribute('data-card-id', 'alligator');
    await tapPeek(page, 'next'); // bear: a peek on each side
    // Settled once centred: the slide may run past its nominal end on a loaded machine.
    await expect
      .poll(async () => {
        const box = await current(page).boundingBox();
        return box === null ? Infinity : Math.abs(box.x + box.width / 2 - v.w / 2);
      })
      .toBeLessThanOrEqual(1);

    const card = await current(page).boundingBox();
    if (card === null) throw new Error('no current card');
    expect(Math.abs(card.width - v.wc)).toBeLessThanOrEqual(1);
    expect(Math.abs(card.height - v.hc)).toBeLessThanOrEqual(1);
    expect(Math.abs(card.y + card.height / 2 - v.h / 2)).toBeLessThanOrEqual(1);

    const prev = await page.getByTestId('card-peek-prev').boundingBox();
    const next = await page.getByTestId('card-peek-next').boundingBox();
    if (prev === null || next === null) throw new Error('missing peek');
    const prevSliver = Math.min(prev.x + prev.width, v.w) - Math.max(prev.x, 0);
    const nextSliver = Math.min(next.x + next.width, v.w) - Math.max(next.x, 0);
    for (const sliver of [prevSliver, nextSliver]) {
      expect(sliver).toBeGreaterThanOrEqual(24);
      expect(Math.abs(sliver - v.sliver)).toBeLessThanOrEqual(1);
    }

    const scroll = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      body: document.body.scrollWidth - document.body.clientWidth,
    }));
    expect(scroll.doc).toBeLessThanOrEqual(0);
    expect(scroll.body).toBeLessThanOrEqual(0);
  });
}

test('E2E-10 AC-06 every fixture image keeps its aspect, uncropped, inside the card', async ({ page }) => {
  await page.goto(appUrl());
  const ids = ['alligator', 'bear', 'cat', 'dog', 'elephant'];
  for (const [i, id] of ids.entries()) {
    if (i > 0) await tapPeek(page, 'next');
    await expect(current(page)).toHaveAttribute('data-card-id', id);
    const img = current(page).getByTestId('face-front').locator('img');
    await expect(img).toBeVisible();
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

    const m = await img.evaluate((el: HTMLImageElement) => {
      const box = el.getBoundingClientRect();
      const card = el.closest('[data-testid="card-current"]')!.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // The drawn content of an `object-fit: contain` image, centred in its box.
      const s = Math.min(box.width / el.naturalWidth, box.height / el.naturalHeight);
      const w = el.naturalWidth * s;
      const h = el.naturalHeight * s;
      const x = box.left + (box.width - w) / 2;
      const y = box.top + (box.height - h) / 2;
      return {
        fit: cs.objectFit,
        position: cs.objectPosition,
        natural: el.naturalWidth / el.naturalHeight,
        drawn: w / h,
        inside: x >= card.left - 0.5 && y >= card.top - 0.5 && x + w <= card.right + 0.5 && y + h <= card.bottom + 0.5,
        boxInside:
          box.left >= card.left - 0.5 && box.top >= card.top - 0.5 && box.right <= card.right + 0.5 && box.bottom <= card.bottom + 0.5,
      };
    });
    expect(m.fit).toBe('contain');
    expect(m.position).toBe('50% 50%');
    expect(Math.abs(m.drawn / m.natural - 1)).toBeLessThanOrEqual(0.01);
    expect(m.boxInside).toBe(true);
    expect(m.inside).toBe(true);
  }
});
