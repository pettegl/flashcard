#!/usr/bin/env node
// FR-02: dist/merged = engine (dist/standalone) + fixture deck + fixture langs, merged the way
// the container extracts the three ZIPs into one directory. Any overwritten path is a failure.
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = join(ROOT, 'dist', 'standalone');
const CONTENT = join(ROOT, 'fixtures', 'content');
const OUT = join(ROOT, 'dist', 'merged');

// Tile icons are uploaded alongside the language pack, never inside a ZIP (CR§4).
const CONTENT_TIERS = ['decks', 'lang'];

function fail(message) {
  console.error(`[build:merged] ${message}`);
  process.exit(1);
}

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

function mergeTree(srcRoot, srcDir, label) {
  let count = 0;
  for (const file of listFiles(srcDir)) {
    const rel = relative(srcRoot, file);
    const dest = join(OUT, rel);
    if (existsSync(dest)) fail(`merge collision: ${label} would overwrite ${rel.split('\\').join('/')}`);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(file, dest);
    count++;
  }
  return count;
}

if (!existsSync(join(ENGINE, 'index.html'))) fail('dist/standalone/index.html not found. Run `npm run build` first.');
if (!existsSync(CONTENT) || !statSync(CONTENT).isDirectory()) {
  fail('fixtures/content not found. Run `npm run fixtures` first.');
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

const engineFiles = mergeTree(ENGINE, ENGINE, 'engine');
if (existsSync(join(OUT, 'decks')) || existsSync(join(OUT, 'lang'))) {
  fail('engine output must not contain decks/ or lang/ (DEVSPEC §I.1)');
}

let contentFiles = 0;
for (const tier of CONTENT_TIERS) {
  const dir = join(CONTENT, tier);
  if (existsSync(dir)) contentFiles += mergeTree(CONTENT, dir, tier);
}

console.log(`[build:merged] dist/merged: ${engineFiles} engine files + ${contentFiles} content files, no collisions`);
