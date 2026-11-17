import { expect, test } from '@playwright/test';
import { appUrl, assertMergedBuild, audioStarts, countAudioStarts, currentFace, mergeVariant } from './helpers';

// E2E-03 (FR-13, FR-15, AC-07): one tap on the front reveals the word and starts its audio once.
// Also covers the card geometry (FR-14, AC-05/AC-06) and AC-09 (missing image) in a real browser.
test.beforeAll(assertMergedBuild);

test('E2E-03 tapping the current card reveals the word and plays its audio once', async ({ page }) => {
  await countAudioStarts(page);
  await page.goto(appUrl());
  const card = page.getByTestId('card-current');
  await expect(card).toHaveAttribute('data-card-id', 'alligator');
  await expect(currentFace(page, 'front').locator('img')).toHaveJSProperty('naturalWidth', 800);

  await card.tap();

  await expect(currentFace(page, 'back')).toHaveText('Alligator');
  // The front stays rendered (aria-hidden) until the FR-21 flip ends.
  await expect(card.locator('img')).toHaveCount(0);
  await expect.poll(() => audioStarts(page)).toBe(1);
  await expect(card).toHaveAccessibleName('Alligator. Card 1 of 5. Activate to flip back.');
});

test('E2E-03 the card face: 4 px border, whole image contained, sized per §U.7', async ({ page }) => {
  await page.goto(appUrl());
  const card = page.getByTestId('card-current');
  const front = currentFace(page, 'front');
  const img = front.locator('img');
  await expect(img).toHaveJSProperty('complete', true);

  // The border is drawn by each face, so the 3D flip is not flattened (UISPEC §U.9).
  const style = await front.evaluate((el) => {
    const s = getComputedStyle(el);
    return { border: s.borderTopWidth, radius: s.borderTopLeftRadius };
  });
  expect(style.border).toBe('4px');
  expect(parseFloat(style.radius)).toBeGreaterThan(0);
  await expect(img).toHaveCSS('object-fit', 'contain');
  await expect(img).toHaveAttribute('alt', '');

  // 360×640: Wc = floor(min(0.78·360, 0.7·640·4/3, 720)) = 280, Hc = 210.
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.round(box!.width)).toBe(280);
  expect(Math.round(box!.height)).toBe(210);
});

test.describe('AC-09 missing image', () => {
  let variant: ReturnType<typeof mergeVariant>;
  test.beforeAll(() => {
    variant = mergeVariant('missing-image');
  });
  test.afterAll(() => variant.remove());

  test('shows the placeholder on the front and still reveals the word', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (e) => pageErrors.push(e.message));
    await page.goto(appUrl(undefined, variant.root));
    const card = page.getByTestId('card-current');
    await expect(card).toHaveAttribute('data-card-id', 'alligator');
    await expect(card.getByTestId('image-placeholder')).toBeVisible();

    await card.tap();
    await expect(currentFace(page, 'back')).toHaveText('Alligator');
    expect(pageErrors).toEqual([]);
  });
});
