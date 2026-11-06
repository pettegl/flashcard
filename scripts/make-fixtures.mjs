#!/usr/bin/env node
// Generates deterministic test content (TESTSPEC §3). Output is ephemeral and gitignored.
// Uses Node built-ins only: PNGs are encoded with zlib, WAVs are written as raw PCM.
import { mkdirSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'fixtures');
const CONTENT = join(OUT, 'content');
const VARIANTS = join(OUT, 'variants');

const DECK = 'animals';

const CARDS = [
  { id: 'alligator', w: 800, h: 600, fill: [76, 153, 76], freq: 440 },
  { id: 'bear', w: 600, h: 800, fill: [139, 94, 60], freq: 494 },
  { id: 'cat', w: 1200, h: 300, fill: [240, 180, 60], freq: 523 },
  { id: 'dog', w: 200, h: 200, fill: [90, 140, 220], freq: 587 },
  { id: 'elephant', w: 1600, h: 1200, fill: [150, 150, 160], freq: 659 },
];

const WORDS = {
  english: { alligator: 'Alligator', bear: 'Bear', cat: 'Cat', dog: 'Dog', elephant: 'Elephant' },
  spanish: { alligator: 'Caimán', bear: 'Oso', cat: 'Gato', dog: 'Perro', elephant: 'Elefante' },
};

const FRAME_PX = 8;
const FRAME_RGB = [255, 0, 0];
const SAMPLE_RATE = 22050;
const TONE_SECONDS = 0.3;

// ---------- PNG (true PNG, RGB 8-bit) ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([len, typeAndData, crc]);
}

/** Solid fill with an 8 px red frame on every edge so crop/stretch is detectable (TESTSPEC §3.1). */
function makePng(width, height, fill, frame = FRAME_PX) {
  const rowLen = 1 + width * 3;
  const raw = Buffer.alloc(rowLen * height);
  for (let y = 0; y < height; y++) {
    const row = y * rowLen;
    raw[row] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const onFrame = x < frame || y < frame || x >= width - frame || y >= height - frame;
      const [r, g, b] = onFrame ? FRAME_RGB : fill;
      const p = row + 1 + x * 3;
      raw[p] = r;
      raw[p + 1] = g;
      raw[p + 2] = b;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------- WAV (PCM 16-bit mono) ----------

function makeWav(freq, seconds = TONE_SECONDS, sampleRate = SAMPLE_RATE) {
  const samples = Math.round(seconds * sampleRate);
  const fade = Math.round(0.01 * sampleRate);
  const data = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const env = Math.min(1, i / fade, (samples - 1 - i) / fade);
    const v = Math.round(Math.sin((2 * Math.PI * freq * i) / sampleRate) * 0.5 * env * 32767);
    data.writeInt16LE(v, i * 2);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

// ---------- Content trees ----------

function write(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

function writeJson(path, value) {
  write(path, `${JSON.stringify(value, null, 2)}\n`);
}

function deckJson(cards, order = cards.map((c) => c.id)) {
  return {
    schema_version: 1,
    deck_id: DECK,
    card_order: order,
    cards: cards.map((c) => ({ card_id: c.id, image: `images/${c.id}.png` })),
  };
}

function wordsJson(lang, cards, wordOf) {
  return {
    schema_version: 1,
    deck_id: DECK,
    lang,
    cards: cards.map((c) => ({
      card_id: c.id,
      target_word: wordOf(c),
      audio: `lang/${lang}/audios/${DECK}_${c.id}.wav`,
    })),
  };
}

function writeTree(root, { cards, langs }) {
  writeJson(join(root, 'decks', DECK, 'deck.json'), deckJson(cards));
  for (const c of cards) write(join(root, 'decks', DECK, 'images', `${c.id}.png`), makePng(c.w, c.h, c.fill));
  for (const [lang, wordOf] of Object.entries(langs)) {
    writeJson(join(root, 'lang', lang, `${DECK}.json`), wordsJson(lang, cards, wordOf));
    for (const c of cards) write(join(root, 'lang', lang, 'audios', `${DECK}_${c.id}.wav`), makeWav(c.freq));
  }
}

const primaryLangs = {
  english: (c) => WORDS.english[c.id],
  spanish: (c) => WORDS.spanish[c.id],
};

function bigDeckCards(count) {
  return Array.from({ length: count }, (_, i) => {
    const n = i + 1;
    return {
      id: `card-${String(n).padStart(3, '0')}`,
      n,
      w: 400,
      h: 300,
      fill: [(n * 37) % 256, (n * 91) % 256, (n * 53) % 256],
      freq: 300 + n * 5,
    };
  });
}

function wordsPath(root, lang = 'english') {
  return join(root, 'lang', lang, `${DECK}.json`);
}

// Each variant is a full merged content tree that overrides exactly one thing (TESTSPEC §3.2).
const VARIANT_BUILDERS = {
  'missing-words': (dir) => rmSync(wordsPath(dir)),
  'corrupt-json': (dir) => write(wordsPath(dir), '{ "schema_version": 1, "deck_id": "animals", "cards": [\n'),
  'bad-schema': (dir) => writeJson(join(dir, 'decks', DECK, 'deck.json'), { ...deckJson(CARDS), schema_version: 2 }),
  'no-playable': (dir) =>
    writeJson(wordsPath(dir), {
      schema_version: 1,
      deck_id: DECK,
      lang: 'english',
      cards: [{ card_id: 'zebra', target_word: 'Zebra' }],
    }),
  'dup-order': (dir) =>
    writeJson(join(dir, 'decks', DECK, 'deck.json'), deckJson(CARDS, ['alligator', 'bear', 'bear', 'ghost', 'cat'])),
  'missing-word-one': (dir) =>
    writeJson(
      wordsPath(dir),
      wordsJson('english', CARDS.filter((c) => c.id !== 'dog'), (c) => WORDS.english[c.id]),
    ),
  'missing-image': (dir) => rmSync(join(dir, 'decks', DECK, 'images', 'cat.png')),
  'missing-audio': (dir) => rmSync(join(dir, 'lang', 'english', 'audios', `${DECK}_bear.wav`)),
  'long-word': (dir) =>
    writeJson(
      wordsPath(dir),
      wordsJson('english', CARDS, (c) =>
        c.id === 'cat' ? 'Supercalifragilisticexpialidociouscatcat' : WORDS.english[c.id],
      ),
    ),
  'html-word': (dir) =>
    writeJson(
      wordsPath(dir),
      wordsJson('english', CARDS, (c) =>
        c.id === 'dog' ? '<b>Dog</b><img src=x onerror=alert(1)>' : WORDS.english[c.id],
      ),
    ),
};

function main() {
  rmSync(OUT, { recursive: true, force: true });

  writeTree(CONTENT, { cards: CARDS, langs: primaryLangs });
  write(join(CONTENT, 'icons', `${DECK}-english.png`), makePng(512, 512, [43, 76, 126]));

  for (const [name, apply] of Object.entries(VARIANT_BUILDERS)) {
    const dir = join(VARIANTS, name);
    cpSync(join(CONTENT, 'decks'), join(dir, 'decks'), { recursive: true });
    cpSync(join(CONTENT, 'lang'), join(dir, 'lang'), { recursive: true });
    apply(dir);
  }

  for (const [name, count] of [
    ['bigdeck', 100],
    ['bigdeck-120', 120],
  ]) {
    writeTree(join(VARIANTS, name), { cards: bigDeckCards(count), langs: { english: (c) => `Card ${c.n}` } });
  }

  const variantCount = Object.keys(VARIANT_BUILDERS).length + 2;
  console.log(`[fixtures] wrote fixtures/content (${CARDS.length} cards, 2 languages) and ${variantCount} variants`);
}

main();
