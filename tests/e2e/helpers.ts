import { expect, type Locator, type Page } from '@playwright/test';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { SLIDE_MS } from '../../src/ui/gestures';

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

/** Taps the on-screen part of an element: a peek is mostly outside the viewport (UISPEC §U.7). */
export async function tapVisiblePart(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null) throw new Error('tapVisiblePart: no box or viewport');
  const left = Math.max(box.x, 0);
  const right = Math.min(box.x + box.width, viewport.width);
  await page.touchscreen.tap((left + right) / 2, box.y + box.height / 2);
}

/** Taps a peek (FR-19), then waits out the slide and its input lock (FR-22). */
export async function tapPeek(page: Page, side: 'prev' | 'next'): Promise<void> {
  await tapVisiblePart(page, page.getByTestId(`card-peek-${side}`));
  await page.waitForTimeout(SLIDE_MS + 50);
}

/** The current card's face (the peeks render front faces too). */
export function currentFace(page: Page, face: 'front' | 'back'): Locator {
  return page.getByTestId('card-current').getByTestId(`face-${face}`);
}

/** Waits for a flip to end: the face being left leaves the DOM after FLIP_MS (FR-21), with the input lock. */
export async function flipSettled(page: Page, shown: 'front' | 'back'): Promise<void> {
  await expect(currentFace(page, shown === 'front' ? 'back' : 'front')).toHaveCount(0);
}

/** Starts the next load on `cardId` through saved progress (FR-12). */
export async function startAt(page: Page, cardId: string): Promise<void> {
  await page.addInitScript(
    (value) => window.localStorage.setItem('flashcard:v1:english:animals', value),
    JSON.stringify({ card_id: cardId }),
  );
}

/**
 * Records when the page handles each `click` and `pointerdown`. The FR-22 locks are timers on page time, and
 * under load queued input is handled well after its `timeStamp`, so handling time is what decides a lock.
 */
export async function recordTapTimes(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __clicks: number[]; __downs: number[] };
    w.__clicks = [];
    w.__downs = [];
    window.addEventListener('click', () => w.__clicks.push(performance.now()), true);
    window.addEventListener('pointerdown', () => w.__downs.push(performance.now()), true);
  });
}

/** Page time from the first tap's click (where a lock starts) to the second tap's pointerdown. */
export function secondTapGap(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as { __clicks: number[]; __downs: number[] };
    return w.__downs[1] - w.__clicks[0];
  });
}

export interface TouchDriver {
  /**
   * One finger: down at `from`, through `path` (offsets from `from`) spread evenly over `ms`, then up unless
   * `release` is false. Event timestamps are set explicitly, so the classifier sees exactly `ms`.
   */
  gesture(from: [number, number], path: Array<[number, number]>, ms: number, release?: boolean): Promise<void>;
  release(): Promise<void>;
}

/** Touch input through CDP `Input.dispatchTouchEvent`, with controlled timestamps (UISPEC §U.8). */
export async function touchDriver(page: Page): Promise<TouchDriver> {
  const cdp = await page.context().newCDPSession(page);
  let clock = 0; // seconds; within a gesture it advances only by the planned steps
  const tick = (ms: number) => {
    clock += ms / 1000;
    return clock;
  };
  const send = async (
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    points: Array<[number, number]>,
    timestamp: number,
  ): Promise<void> => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y]) => ({ x, y })), timestamp });
  };
  const release = () => send('touchEnd', [], tick(0));
  return {
    release,
    async gesture([x0, y0], path, ms, doRelease = true) {
      clock = Math.max(clock, Date.now() / 1000);
      await send('touchStart', [[x0, y0]], clock);
      const step = ms / Math.max(path.length, 1);
      for (const [dx, dy] of path) await send('touchMove', [[x0 + dx, y0 + dy]], tick(step));
      if (path.length === 0) tick(ms);
      if (doRelease) await send('touchEnd', [], clock);
    },
  };
}
