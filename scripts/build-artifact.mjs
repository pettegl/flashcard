#!/usr/bin/env node
// FR-30: one self-contained HTML file (engine + one deck in one language) for a quick phone check.
// Development aid only (RD-26): never uploaded or shipped, so inline script/style are allowed here and
// nowhere else. The engine bundle is embedded unchanged; a loader shim serves it the embedded files.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ENGINE = join(ROOT, 'dist', 'standalone');
const SLUG = /^[a-z0-9-]{1,64}$/;

const MIME = {
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain',
};

function fail(message) {
  console.error(`[build:artifact] ${message}`);
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

const toKey = (root, file) => relative(root, file).split('\\').join('/');

// Runs in the page before the engine bundle. Serialised with Function.prototype.toString, so it must be
// self-contained and stay within the browser targets of NFR-07.
/* global window, location, history, ProgressEvent, HTMLImageElement, Element */
function artifactShim(files, launch) {
  var own = Object.prototype.hasOwnProperty;
  var decoded = {};

  function key(url) {
    if (url == null) return null;
    var path = String(url).split('#')[0].split('?')[0];
    var base = location.href.split('#')[0].split('?')[0];
    base = base.slice(0, base.lastIndexOf('/') + 1);
    if (path.indexOf(base) === 0) path = path.slice(base.length);
    while (path.indexOf('./') === 0) path = path.slice(2);
    return own.call(files, path) ? path : null;
  }

  // A fresh copy per request: decodeAudioData detaches the buffer it is given.
  function bytes(k) {
    if (!decoded[k]) {
      var bin = atob(files[k][1]);
      var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      decoded[k] = arr;
    }
    return decoded[k].slice().buffer;
  }

  function mapSrc(value) {
    var k = key(value);
    return k === null ? value : 'data:' + files[k][0] + ';base64,' + files[k][1];
  }

  function FakeXhr() {
    this.readyState = 0;
    this.status = 0;
    this.response = null;
    this.responseType = '';
    this.onload = null;
    this.onerror = null;
    this._url = null;
    this._aborted = false;
  }
  FakeXhr.prototype.open = function (_method, url) {
    this._url = url;
    this.readyState = 1;
  };
  FakeXhr.prototype.setRequestHeader = function () {};
  FakeXhr.prototype.abort = function () {
    this._aborted = true;
  };
  FakeXhr.prototype.send = function () {
    setTimeout(() => {
      if (this._aborted) return;
      var k = key(this._url);
      this.readyState = 4;
      if (k === null) {
        if (this.onerror) this.onerror(new ProgressEvent('error'));
        return;
      }
      this.status = 200;
      this.response = this.responseType === 'arraybuffer' ? bytes(k) : new TextDecoder().decode(bytes(k));
      if (this.onload) this.onload(new ProgressEvent('load'));
    }, 0);
  };
  window.XMLHttpRequest = FakeXhr;

  window.fetch = function (input) {
    var url = typeof input === 'string' ? input : input && input.url;
    var k = key(url);
    if (k === null) return Promise.reject(new TypeError('Not in this artifact (offline): ' + url));
    return Promise.resolve(new Response(bytes(k), { status: 200, headers: { 'Content-Type': files[k][0] } }));
  };

  // Everything is already in memory; a cache would only serve stale bytes from an older artifact.
  try {
    Object.defineProperty(window, 'caches', { value: undefined, configurable: true });
  } catch (error) {
    console.warn('[flashcard] artifact: could not hide Cache Storage', error);
  }

  var srcProp = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    configurable: true,
    enumerable: srcProp.enumerable,
    get: srcProp.get,
    set: function (value) {
      srcProp.set.call(this, mapSrc(value));
    },
  });
  var setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (this instanceof HTMLImageElement && String(name).toLowerCase() === 'src') value = mapSrc(value);
    return setAttribute.call(this, name, value);
  };

  // A file opened on a phone has no query; supply the launch params the container would (never cr_user_id).
  try {
    var query = new URLSearchParams(location.search);
    if (!query.get('cr_lang') || !query.get('cr_book')) {
      if (!query.get('cr_lang')) query.set('cr_lang', launch.lang);
      if (!query.get('cr_book')) query.set('cr_book', launch.deck);
      history.replaceState(history.state, '', '?' + query.toString() + location.hash);
    }
  } catch (error) {
    console.warn('[flashcard] artifact: could not set the launch query', error);
  }
}

const { values } = parseArgs({
  options: {
    deck: { type: 'string', default: 'animals' },
    lang: { type: 'string', default: 'english' },
    content: { type: 'string', default: join(ROOT, 'fixtures', 'content') },
    out: { type: 'string' },
  },
});
const { deck, lang } = values;
if (!SLUG.test(deck)) fail(`--deck must match ${SLUG}: ${deck}`);
if (!SLUG.test(lang)) fail(`--lang must match ${SLUG}: ${lang}`);
const content = resolve(values.content);
const out = resolve(values.out ?? join(ROOT, 'dist', 'artifact', `flashcard-${deck}-${lang}.html`));

const indexPath = join(ENGINE, 'index.html');
if (!existsSync(indexPath)) fail('dist/standalone/index.html not found. Run `npm run build` first.');
if (!existsSync(content) || !statSync(content).isDirectory()) {
  fail(`content directory not found: ${content} (run \`npm run fixtures\` for fixtures/content)`);
}

const deckDir = join(content, 'decks', deck);
const wordsFile = join(content, 'lang', lang, `${deck}.json`);
if (!existsSync(join(deckDir, 'deck.json'))) fail(`missing ${toKey(content, join(deckDir, 'deck.json'))} in ${content}`);
if (!existsSync(wordsFile)) fail(`missing ${toKey(content, wordsFile)} in ${content}`);

let html = readFileSync(indexPath, 'utf8');
const scriptTag = html.match(/<script\b[^>]*\bsrc=["']?\.\/(js\/[^"'\s>]+\.js)["']?[^>]*><\/script>/i);
const styleTag = html.match(/<link\b[^>]*\bhref=["']?\.\/(css\/[^"'\s>]+\.css)["']?[^>]*>/i);
if (!scriptTag || !styleTag) fail('could not find the bundle <script> and stylesheet <link> in dist/standalone/index.html');

const js = readFileSync(join(ENGINE, scriptTag[1]), 'utf8');
const css = readFileSync(join(ENGINE, styleTag[1]), 'utf8');
if (/<!--/.test(js)) fail('the bundle contains "<!--", which cannot be inlined safely in a <script>');
if (/<\/style/i.test(css)) fail('the stylesheet contains "</style", which cannot be inlined safely');

const files = {};
function embed(root, file) {
  files[toKey(root, file)] = [MIME[extname(file).toLowerCase()] ?? 'application/octet-stream', readFileSync(file).toString('base64')];
}
const inlined = new Set(['index.html', scriptTag[1], styleTag[1]]);
for (const file of listFiles(ENGINE)) if (!inlined.has(toKey(ENGINE, file))) embed(ENGINE, file);
for (const file of listFiles(deckDir)) embed(content, file);
embed(content, wordsFile);
const audios = join(content, 'lang', lang, 'audios');
if (existsSync(audios)) {
  for (const file of listFiles(audios)) if (file.slice(audios.length + 1).startsWith(`${deck}_`)) embed(content, file);
}

const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const shim = `(${artifactShim.toString()})(${json(files)}, ${json({ deck, lang })});`;
const inlineJs = js.replace(/<\/(script)/gi, '<\\/$1');

html = html
  .replace(scriptTag[0], '')
  .replace(styleTag[0], () => `<style>${css}</style>`)
  .replace(/<\/body>/i, () => `<script>${shim}</script><script>${inlineJs}</script></body>`);

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
const kib = (statSync(out).size / 1024).toFixed(0);
console.log(`[build:artifact] ${toKey(ROOT, out)}: ${deck}/${lang}, ${Object.keys(files).length} embedded files, ${kib} KiB`);
