/**
 * @jest-environment node
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { inflateSync } from 'node:zlib';

// Fixture contract (TESTSPEC §3, §6 step 1): content and variants exist; images are true PNGs.
const ROOT = resolve(__dirname, '../..');
const FIXTURES = join(ROOT, 'fixtures');
const CONTENT = join(FIXTURES, 'content');
const VARIANTS = join(FIXTURES, 'variants');

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const SHAPES: Record<string, [number, number]> = {
  alligator: [800, 600],
  bear: [600, 800],
  cat: [1200, 300],
  dog: [200, 200],
  elephant: [1600, 1200],
};

beforeAll(() => {
  if (!existsSync(join(CONTENT, 'decks'))) {
    const result = spawnSync(process.execPath, [join(ROOT, 'scripts/make-fixtures.mjs')], { encoding: 'utf8' });
    if (result.status !== 0) throw new Error(result.stderr);
  }
});

const readJson = (path: string) => JSON.parse(readFileSync(path, 'utf8'));

function decodePng(path: string) {
  const buf = readFileSync(path);
  expect(buf.subarray(0, 8).equals(PNG_MAGIC)).toBe(true);
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const chunks: Buffer[] = [];
  for (let off = 8; off < buf.length; ) {
    const len = buf.readUInt32BE(off);
    if (buf.toString('ascii', off + 4, off + 8) === 'IDAT') chunks.push(buf.subarray(off + 8, off + 8 + len));
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const pixel = (x: number, y: number) => {
    const p = y * (1 + width * 3) + 1 + x * 3;
    return [raw[p], raw[p + 1], raw[p + 2]];
  };
  return { width, height, pixel };
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? listFiles(join(dir, e.name)) : [join(dir, e.name)],
  );
}

describe('fixtures (TESTSPEC §3.1)', () => {
  it('deck animals has the five cards in order', () => {
    const deck = readJson(join(CONTENT, 'decks/animals/deck.json'));
    expect(deck).toMatchObject({ schema_version: 1, deck_id: 'animals' });
    expect(deck.card_order).toEqual(Object.keys(SHAPES));
  });

  it.each(Object.entries(SHAPES))('%s is a true %ix%i PNG with an 8 px red frame', (id, [w, h]) => {
    const png = decodePng(join(CONTENT, `decks/animals/images/${id}.png`));
    expect([png.width, png.height]).toEqual([w, h]);
    expect(png.pixel(0, 0)).toEqual([255, 0, 0]);
    expect(png.pixel(7, 7)).toEqual([255, 0, 0]);
    expect(png.pixel(w - 1, h - 1)).toEqual([255, 0, 0]);
    expect(png.pixel(8, 8)).not.toEqual([255, 0, 0]);
    expect(png.pixel(Math.floor(w / 2), Math.floor(h / 2))).not.toEqual([255, 0, 0]);
  });

  it.each([
    ['english', ['Alligator', 'Bear', 'Cat', 'Dog', 'Elephant']],
    ['spanish', ['Caimán', 'Oso', 'Gato', 'Perro', 'Elefante']],
  ])('%s words and WAV audio are present', (lang, words) => {
    const file = readJson(join(CONTENT, `lang/${lang}/animals.json`));
    expect(file).toMatchObject({ schema_version: 1, deck_id: 'animals', lang });
    expect(file.cards.map((c: { target_word: string }) => c.target_word)).toEqual(words);
    for (const card of file.cards) {
      expect(card.audio).toBe(`lang/${lang}/audios/animals_${card.card_id}.wav`);
      const wav = readFileSync(join(CONTENT, card.audio));
      expect(wav.toString('ascii', 0, 4)).toBe('RIFF');
      expect(wav.toString('ascii', 8, 12)).toBe('WAVE');
    }
  });

  it('has a 512x512 PNG tile icon', () => {
    const icon = decodePng(join(CONTENT, 'icons/animals-english.png'));
    expect([icon.width, icon.height]).toEqual([512, 512]);
  });

  it('contains no absolute URLs in JSON data', () => {
    for (const f of listFiles(CONTENT).filter((f) => f.endsWith('.json'))) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/https?:\/\//);
    }
  });
});

describe('fixture variants (TESTSPEC §3.2)', () => {
  const variant = (name: string, rel: string) => join(VARIANTS, name, rel);
  const englishWords = (name: string) => readJson(variant(name, 'lang/english/animals.json'));
  const wordOf = (name: string, id: string) =>
    englishWords(name).cards.find((c: { card_id: string }) => c.card_id === id)?.target_word;

  it('produces all twelve variants', () => {
    expect(readdirSync(VARIANTS).sort()).toEqual(
      [
        'bad-schema',
        'bigdeck',
        'bigdeck-120',
        'corrupt-json',
        'dup-order',
        'html-word',
        'long-word',
        'missing-audio',
        'missing-image',
        'missing-word-one',
        'missing-words',
        'no-playable',
      ].sort(),
    );
  });

  it('each variant overrides exactly its one thing', () => {
    expect(existsSync(variant('missing-words', 'lang/english/animals.json'))).toBe(false);
    expect(() => englishWords('corrupt-json')).toThrow(SyntaxError);
    expect(readJson(variant('bad-schema', 'decks/animals/deck.json')).schema_version).toBe(2);
    expect(englishWords('no-playable').cards.map((c: { card_id: string }) => c.card_id)).toEqual(['zebra']);
    expect(readJson(variant('dup-order', 'decks/animals/deck.json')).card_order).toEqual([
      'alligator',
      'bear',
      'bear',
      'ghost',
      'cat',
    ]);
    expect(wordOf('missing-word-one', 'dog')).toBeUndefined();
    expect(wordOf('missing-word-one', 'cat')).toBe('Cat');
    expect(existsSync(variant('missing-image', 'decks/animals/images/cat.png'))).toBe(false);
    expect(existsSync(variant('missing-image', 'decks/animals/images/dog.png'))).toBe(true);
    expect(existsSync(variant('missing-audio', 'lang/english/audios/animals_bear.wav'))).toBe(false);
    expect(wordOf('long-word', 'cat')).toHaveLength(40);
    expect(wordOf('html-word', 'dog')).toBe('<b>Dog</b><img src=x onerror=alert(1)>');
  });

  it.each([
    ['bigdeck', 100],
    ['bigdeck-120', 120],
  ])('%s has %i cards with images and audio', (name, count) => {
    const deck = readJson(variant(name, 'decks/animals/deck.json'));
    expect(deck.card_order).toHaveLength(count);
    expect(englishWords(name).cards).toHaveLength(count);
    expect(readdirSync(variant(name, 'decks/animals/images'))).toHaveLength(count);
    expect(readdirSync(variant(name, 'lang/english/audios'))).toHaveLength(count);
  });
});
