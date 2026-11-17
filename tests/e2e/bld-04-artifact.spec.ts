import { expect, test, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { audioStarts, countAudioStarts, disallowedRequests, recordPage } from './helpers';

// BLD-04 (FR-30, RD-26): the single-file phone build runs alone — no sibling files, no query —
// from file:// offline and over http:// from a server that has nothing but that one file.
const ROOT = resolve(__dirname, '../..');
const NAME = 'flashcard-animals-english.html';
let dir: string;

test.beforeAll(() => {
  if (!existsSync(join(ROOT, 'dist/standalone/index.html'))) {
    throw new Error('dist/standalone missing: run `npm run build` first.');
  }
  const build = mkdtempSync(join(tmpdir(), 'flashcard-artifact-build-'));
  dir = mkdtempSync(join(tmpdir(), 'flashcard-artifact-'));
  try {
    execFileSync(process.execPath, [join(ROOT, 'scripts/build-artifact.mjs'), '--out', join(build, NAME)], { cwd: ROOT });
    copyFileSync(join(build, NAME), join(dir, NAME));
  } finally {
    rmSync(build, { recursive: true, force: true });
  }
});

test.afterAll(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

async function expectPlayable(page: Page): Promise<void> {
  const url = new URL(page.url());
  expect(url.searchParams.get('cr_lang')).toBe('english');
  expect(url.searchParams.get('cr_book')).toBe('animals');
  expect(url.searchParams.has('cr_user_id')).toBe(false);

  const card = page.getByTestId('card-current');
  await expect(card).toHaveAttribute('data-card-id', 'alligator');
  await expect(card.getByTestId('face-front').locator('img')).toHaveJSProperty('naturalWidth', 800);
  expect(
    await page.evaluate(() => [document.fonts.check('400 16px "Noto Sans"'), document.fonts.check('700 16px "Noto Sans"')]),
  ).toEqual([true, true]);

  await card.tap();
  await expect(page.getByTestId('face-back')).toHaveText('Alligator');
  await expect.poll(() => audioStarts(page)).toBe(1);
}

test('BLD-04 the single file is the only file and plays from file:// offline with no query', async ({ page }) => {
  expect(readdirSync(dir)).toEqual([NAME]);
  const log = recordPage(page);
  await countAudioStarts(page);

  await page.goto(pathToFileURL(join(dir, NAME)).href);
  await expectPlayable(page);

  expect(log.requests.length).toBeGreaterThan(0);
  expect(disallowedRequests(log.requests)).toEqual([]);
  expect(log.requests.filter((u) => u.startsWith('file:'))).toEqual([pathToFileURL(join(dir, NAME)).href]);
  expect(log.consoleErrors).toEqual([]);
  expect(log.pageErrors).toEqual([]);
});

test.describe('over http://', () => {
  test.use({ offline: false });
  let server: Server;
  const served: string[] = [];

  test.beforeAll(async () => {
    const body = readFileSync(join(dir, NAME));
    server = createServer((req, res) => {
      const path = (req.url ?? '/').split('?')[0];
      served.push(path);
      if (path === `/${NAME}`) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(body);
      } else if (path === '/favicon.ico') {
        // The browser's own request; a 404 would surface as a console error unrelated to the game.
        res.writeHead(204);
        res.end();
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  });

  test.afterAll(async () => {
    await new Promise<void>((done) => server.close(() => done()));
  });

  test('BLD-04 the single file plays when served alone over http://', async ({ page }) => {
    const { port } = server.address() as AddressInfo;
    const pageUrl = `http://127.0.0.1:${port}/${NAME}`;
    const log = recordPage(page);
    await countAudioStarts(page);

    await page.goto(pageUrl);
    await expectPlayable(page);

    expect(served.filter((p) => p !== '/favicon.ico')).toEqual([`/${NAME}`]);
    const http = log.requests.filter((u) => u.startsWith('http'));
    expect(http.every((u) => u.split('?')[0] === pageUrl || new URL(u).pathname === '/favicon.ico')).toBe(true);
    expect(log.requests.filter((u) => !/^(https?|data|blob):/.test(u))).toEqual([]);
    expect(log.consoleErrors).toEqual([]);
    expect(log.pageErrors).toEqual([]);
  });
});
