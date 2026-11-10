import { expect, test } from '@playwright/test';
import { appUrl, assertMergedBuild } from './helpers';

// SEC-01 (FR-03, NFR-06, AC-02): path-traversal launch params are rejected before any content request.
test.beforeAll(assertMergedBuild);

for (const query of ['cr_lang=english&cr_book=../x&cr_user_id=test-user', 'cr_lang=%2e%2e&cr_book=animals&cr_user_id=test-user']) {
  test(`SEC-01 ${query} shows E1 and requests no content`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', (r) => requests.push(r.url()));

    await page.goto(appUrl(query));
    await expect(page.getByRole('alert', { name: 'Content unavailable, code E1' })).toBeVisible();
    await expect(page.getByTestId('error-code')).toHaveText('E1');
    expect(requests.filter((u) => /\/(decks|lang)\/|\.\.|%2e/i.test(u.split('?')[0]))).toEqual([]);
  });
}
