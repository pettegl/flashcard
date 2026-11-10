import type { Page } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Shared e2e setup: dist/merged opened from file:// (TESTSPEC §2).
export const MERGED = resolve(__dirname, '../../dist/merged');
export const ALLOWED_SCHEMES = new Set(['file:', 'data:', 'blob:']);

export function appUrl(query = 'cr_lang=english&cr_book=animals&cr_user_id=test-user'): string {
  return `${pathToFileURL(join(MERGED, 'index.html')).href}?${query}`;
}

export function assertMergedBuild(): void {
  if (!existsSync(join(MERGED, 'index.html'))) {
    throw new Error('dist/merged missing: run `npm run build && npm run build:merged` first.');
  }
}

export interface LoadingSnapshot {
  role: string | null;
  label: string | null;
  text: string | null;
}

/**
 * S-1 can clear within a frame offline, faster than a polling assertion; record its first appearance
 * from inside the page instead. Read it back with `loadingSnapshot(page)`.
 */
export async function recordLoadingScreen(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __loadingSeen: LoadingSnapshot | null };
    w.__loadingSeen = null;
    new MutationObserver((_records, observer) => {
      const el = document.querySelector('[data-testid="loading"]');
      if (!el) return;
      w.__loadingSeen = { role: el.getAttribute('role'), label: el.getAttribute('aria-label'), text: el.textContent };
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
}

export function loadingSnapshot(page: Page): Promise<LoadingSnapshot | null> {
  return page.evaluate(() => (window as unknown as { __loadingSeen: LoadingSnapshot | null }).__loadingSeen);
}
