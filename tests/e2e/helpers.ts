import type { Page } from '@playwright/test';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Shared e2e setup: dist/merged opened from file:// (TESTSPEC §2).
const ROOT = resolve(__dirname, '../..');
export const MERGED = join(ROOT, 'dist/merged');
export const ALLOWED_SCHEMES = new Set(['file:', 'data:', 'blob:']);
export const DEFAULT_QUERY = 'cr_lang=english&cr_book=animals&cr_user_id=test-user';

export function appUrl(query = DEFAULT_QUERY, root = MERGED): string {
  return `${pathToFileURL(join(root, 'index.html')).href}?${query}`;
}

export function assertMergedBuild(): void {
  if (!existsSync(join(MERGED, 'index.html'))) {
    throw new Error('dist/merged missing: run `npm run build && npm run build:merged` first.');
  }
}

/**
 * A fixture variant (TESTSPEC §3.2) merged with the engine the way `build:merged` merges the primary
 * content, in a temporary directory. Call the returned `remove` when done.
 */
export function mergeVariant(name: string): { root: string; remove: () => void } {
  const engine = join(ROOT, 'dist/standalone');
  const variant = join(ROOT, 'fixtures/variants', name);
  if (!existsSync(join(engine, 'index.html'))) throw new Error('dist/standalone missing: run `npm run build` first.');
  if (!existsSync(variant)) throw new Error(`fixture variant ${name} missing: run \`npm run fixtures\` first.`);
  const root = mkdtempSync(join(tmpdir(), `flashcard-${name}-`));
  cpSync(engine, root, { recursive: true });
  cpSync(variant, root, { recursive: true });
  return { root, remove: () => rmSync(root, { recursive: true, force: true }) };
}

/** Counts `AudioBufferSourceNode.start` calls in `window.__audioStarts` (TESTSPEC §3.3). */
export async function countAudioStarts(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __audioStarts: number };
    w.__audioStarts = 0;
    const proto = AudioBufferSourceNode.prototype;
    const start = proto.start;
    proto.start = function (this: AudioBufferSourceNode, ...args: Parameters<AudioBufferSourceNode['start']>) {
      w.__audioStarts++;
      return start.apply(this, args);
    };
  });
}

export function audioStarts(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __audioStarts: number }).__audioStarts);
}

/** Records every request URL, `console.error` and uncaught page error. */
export function recordPage(page: Page): { requests: string[]; consoleErrors: string[]; pageErrors: string[] } {
  const log = { requests: [] as string[], consoleErrors: [] as string[], pageErrors: [] as string[] };
  page.on('request', (r) => log.requests.push(r.url()));
  page.on('console', (m) => {
    if (m.type() === 'error') log.consoleErrors.push(m.text());
  });
  page.on('pageerror', (e) => log.pageErrors.push(e.message));
  return log;
}

export function disallowedRequests(requests: readonly string[]): string[] {
  return requests.filter((u) => !ALLOWED_SCHEMES.has(new URL(u).protocol));
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
