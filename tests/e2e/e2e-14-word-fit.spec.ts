import { expect, test } from '@playwright/test';
import { appUrl, assertMergedBuild, flipSettled, mergeVariant } from './helpers';

// E2E-14 (AC-08, PR-05): a long word stays inside the card; non-ASCII words render intact.
test.beforeAll(assertMergedBuild);

test.describe('long-word variant', () => {
  let variant: ReturnType<typeof mergeVariant>;
  test.beforeAll(() => {
    variant = mergeVariant('long-word');
  });
  test.afterAll(() => variant.remove());

  test('E2E-14 the 40-character word is fully inside the card', async ({ page }) => {
    await page.goto(appUrl(undefined, variant.root));
    const card = page.getByTestId('card-current');
    await expect(card).toHaveAttribute('data-card-id', 'alligator');
    await card.tap();

    const word = page.getByTestId('face-back').locator('.card-word');
    await expect(word).toHaveText('Supercalifragilisticexpialidociousgators');
    // Measure after the FR-21 rotation, when the back face lies flat in the card.
    await flipSettled(page, 'back');
    const cardBox = (await card.boundingBox())!;
    const wordBox = (await word.boundingBox())!;
    expect(wordBox.x).toBeGreaterThanOrEqual(cardBox.x);
    expect(wordBox.y).toBeGreaterThanOrEqual(cardBox.y);
    expect(wordBox.x + wordBox.width).toBeLessThanOrEqual(cardBox.x + cardBox.width);
    expect(wordBox.y + wordBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height);
    // The text must not overflow its own box (glyphs clipped by overflow: hidden). 1 px absorbs
    // subpixel line heights (1.2 × 18 px = 21.6 px) rounded into scrollHeight/clientHeight.
    const overflow = await word.evaluate((el) => ({ w: el.scrollWidth - el.clientWidth, h: el.scrollHeight - el.clientHeight }));
    expect(overflow.w).toBeLessThanOrEqual(1);
    expect(overflow.h).toBeLessThanOrEqual(1);
    expect(parseFloat(await word.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(18);
  });
});

test('E2E-14 the Spanish word renders with its diacritic', async ({ page }) => {
  await page.goto(appUrl('cr_lang=spanish&cr_book=animals&cr_user_id=test-user'));
  const card = page.getByTestId('card-current');
  await expect(card).toHaveAttribute('data-card-id', 'alligator');
  await card.tap();
  await expect(page.getByTestId('face-back')).toHaveText('Caimán');
});
