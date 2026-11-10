import { expect, test } from '@playwright/test';
import { appUrl, assertMergedBuild, audioStarts, countAudioStarts } from './helpers';

// E2E-15 (FR-13, FR-16, AC-11, AC-12): flip back and forth without limit; audio once per reveal, none on the way back.
test.beforeAll(assertMergedBuild);

test('E2E-15 ten alternating taps give five reveals with one audio start each', async ({ page }) => {
  await countAudioStarts(page);
  await page.goto(appUrl());
  const card = page.getByTestId('card-current');
  await expect(card).toHaveAttribute('data-card-id', 'alligator');

  for (let reveal = 1; reveal <= 5; reveal++) {
    await card.tap();
    await expect(page.getByTestId('face-back')).toHaveText('Alligator');
    await expect(card.locator('img')).toHaveCount(0);
    // Wait out the reveal (its audio has started) before flipping back, as a child would.
    await expect.poll(() => audioStarts(page)).toBe(reveal);

    await card.tap();
    await expect(page.getByTestId('face-front').locator('img')).toBeVisible();
    await expect(page.getByTestId('face-back')).toHaveCount(0);
    expect(await audioStarts(page)).toBe(reveal);
  }

  await expect(card).toHaveAccessibleName('Card 1 of 5. Activate to reveal the word.');
});
