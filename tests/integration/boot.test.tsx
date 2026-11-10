/**
 * @jest-environment-options {"url": "file:///flashcard/index.html"}
 */
import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { TextDecoder as NodeTextDecoder } from 'node:util';
import { App } from '../../src/app/App';
import { boot, LOAD_GATE_MS } from '../../src/app/boot';
import { IS_FILE_ORIGIN } from '../../src/platform/env';

// IT-01…IT-04 (FR-10, FR-06, FR-14, FR-15): boot over the generated fixtures through a mocked file:// XHR.
const ROOT = resolve(__dirname, '../..');
const CONTENT = join(ROOT, 'fixtures', 'content');
const FONTS = join(ROOT, 'src', 'assets', 'fonts');
const VALID = '?cr_lang=english&cr_book=animals&cr_user_id=test-user';
const ANIMALS = ['alligator', 'bear', 'cat', 'dog', 'elephant'];

let contentRoot = CONTENT;
let hangs: (url: string) => boolean = () => false;

// What the container's extracted directory serves for a relative URL ("./fonts" ships with the engine).
function fileFor(url: string): string {
  const path = url.replace(/^\.\//, '');
  return path.startsWith('fonts/') ? join(FONTS, path.slice('fonts/'.length)) : join(contentRoot, path);
}

class FakeXhr {
  static requests: string[] = [];
  status = 0;
  response: ArrayBuffer | null = null;
  responseType = '';
  url = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  abort = jest.fn();

  open(_method: string, url: string) {
    this.url = url;
  }

  send() {
    FakeXhr.requests.push(this.url);
    if (hangs(this.url)) return;
    const file = fileFor(this.url);
    setTimeout(() => {
      if (!existsSync(file)) return this.onerror?.();
      const data = readFileSync(file);
      this.response = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
      this.onload?.();
    }, 0);
  }
}

class FakeImage {
  static requests: string[] = [];
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(url: string) {
    FakeImage.requests.push(url);
    if (hangs(url)) return;
    setTimeout(() => (existsSync(fileFor(url)) ? this.onload?.() : this.onerror?.()), 0);
  }
}

class FakeFontFace {
  constructor(public family: string) {}
  load() {
    return Promise.resolve(this);
  }
}

const originals = { XMLHttpRequest: globalThis.XMLHttpRequest, Image: globalThis.Image };
let warn: jest.SpyInstance;
let error: jest.SpyInstance;

function setGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

function useVariant(name: string) {
  contentRoot = join(ROOT, 'fixtures', 'variants', name);
}

const isBinaryAsset = (url: string) => !url.endsWith('.json');

beforeEach(() => {
  contentRoot = CONTENT;
  hangs = () => false;
  FakeXhr.requests = [];
  FakeImage.requests = [];
  setGlobal('XMLHttpRequest', FakeXhr);
  setGlobal('Image', FakeImage);
  setGlobal('FontFace', FakeFontFace);
  Object.defineProperty(document, 'fonts', { value: { add: jest.fn() }, configurable: true });
  if (typeof globalThis.TextDecoder === 'undefined') setGlobal('TextDecoder', NodeTextDecoder);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  error = jest.spyOn(console, 'error');
});

afterEach(() => {
  jest.useRealTimers();
  setGlobal('XMLHttpRequest', originals.XMLHttpRequest);
  setGlobal('Image', originals.Image);
  delete (globalThis as { FontFace?: unknown }).FontFace;
  delete (document as { fonts?: unknown }).fonts;
  warn.mockRestore();
  error.mockRestore();
});

it('runs on a file: origin, so loadBinary takes the XHR path', () => {
  expect(IS_FILE_ORIGIN).toBe(true);
});

describe('IT-01 boot animals/english', () => {
  it('goes from loading to the ready UI showing the first card front', async () => {
    render(<App search={VALID} />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();

    const current = await screen.findByTestId('card-current');
    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    expect(current).toHaveAttribute('data-card-id', 'alligator');
    expect(screen.getByTestId('face-front').querySelector('img')).toHaveAttribute(
      'src',
      './decks/animals/images/alligator.png',
    );
    expect(screen.queryByTestId('face-back')).not.toBeInTheDocument();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('builds 5 cards in card_order, preloads the critical set, then the rest in the background', async () => {
    const result = await boot(VALID);
    if (!result.ok) throw new Error(`boot failed with ${result.code}`);
    const { deck } = result;

    expect(deck.params).toEqual({ lang: 'english', deck: 'animals', userId: 'test-user' });
    expect(deck.cards.map((card) => card.cardId)).toEqual(ANIMALS);
    expect(deck.index).toBe(0);
    // Critical = current (0) ± 1 + fonts; all settled before ready.
    for (const url of [
      './decks/animals/images/alligator.png',
      './lang/english/audios/animals_alligator.wav',
      './decks/animals/images/bear.png',
      './lang/english/audios/animals_bear.wav',
      './fonts/NotoSans-Regular.woff2',
      './fonts/NotoSans-Bold.woff2',
    ]) {
      expect(deck.preloaded.get(url)).toMatchObject({ ok: true });
    }
    expect(deck.preloaded.has('./decks/animals/images/cat.png')).toBe(false);

    // (7) the remaining cards follow without blocking the ready UI.
    await act(() => new Promise((done) => setTimeout(done, 50)));
    expect(FakeImage.requests).toEqual(ANIMALS.map((id) => `./decks/animals/images/${id}.png`));
    expect(deck.preloaded.size).toBe(2 + 2 * ANIMALS.length);
    expect([...deck.preloaded.values()].every((r) => r.ok)).toBe(true);
    const elephantAudio = deck.preloaded.get('./lang/english/audios/animals_elephant.wav');
    expect(elephantAudio).toMatchObject({ ok: true, kind: 'audio' });
    expect(elephantAudio?.ok && elephantAudio.kind === 'audio' && elephantAudio.data.byteLength).toBeGreaterThan(44);
  });
});

describe('IT-02 boot failures', () => {
  it.each([
    ['missing-words', 'E2'],
    ['corrupt-json', 'E2'],
    ['bad-schema', 'E2'],
    ['no-playable', 'E3'],
  ])('%s shows error code %s', async (variant, code) => {
    useVariant(variant);
    render(<App search={VALID} />);

    expect(await screen.findByTestId('error-code')).toHaveTextContent(new RegExp(`^${code}$`));
    expect(screen.getByRole('alert', { name: `Content unavailable, code ${code}` })).toBeInTheDocument();
    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-current')).not.toBeInTheDocument();
    expect(FakeImage.requests).toEqual([]);
    const codeWarning = new RegExp(`^\\[flashcard\\] ${code}: `);
    expect(warn.mock.calls.some(([message]) => codeWarning.test(String(message)))).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });

  it.each([
    ['missing cr_lang', '?cr_book=animals&cr_user_id=test-user'],
    ['missing cr_book', '?cr_lang=english'],
    ['traversal in cr_book', '?cr_lang=english&cr_book=..%2Fx'],
    ['upper-case cr_lang', '?cr_lang=ENGLISH&cr_book=animals'],
    ['no query at all', ''],
  ])('%s shows E1 and issues no request', async (_label, search) => {
    render(<App search={search} />);

    expect(await screen.findByTestId('error-code')).toHaveTextContent(/^E1$/);
    expect(FakeXhr.requests).toEqual([]);
    expect(FakeImage.requests).toEqual([]);
    expect(error).not.toHaveBeenCalled();
  });
});

describe('IT-03 missing assets degrade, never block', () => {
  // A minimal Web Audio stand-in: decoding succeeds, every started source is counted.
  let starts: string[];
  class FakeAudioContext {
    state = 'running';
    sampleRate = 44100;
    destination = {};
    createBufferSource() {
      const source = { buffer: null as unknown, connect: jest.fn(), disconnect: jest.fn(), stop: jest.fn() };
      return { ...source, start: () => starts.push('start') };
    }
    createBuffer() {
      return {};
    }
    decodeAudioData(_data: ArrayBuffer, ok: (buffer: unknown) => void) {
      ok({});
    }
    resume() {
      return Promise.resolve();
    }
  }

  beforeEach(() => {
    starts = [];
    setGlobal('AudioContext', FakeAudioContext);
    // jsdom has no canvas; the word then keeps its start size (canvasMeasure fallback).
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    delete (globalThis as { AudioContext?: unknown }).AudioContext;
    jest.restoreAllMocks();
  });

  async function revealFirstCard() {
    const card = await screen.findByTestId('card-current');
    fireEvent.click(card);
    await act(() => new Promise((done) => setTimeout(done, 0)));
    return card;
  }

  it('control: the primary content reveal starts its audio once', async () => {
    render(<App search={VALID} />);
    await revealFirstCard();
    expect(screen.getByTestId('face-back')).toHaveTextContent(/^Alligator$/);
    expect(starts).toHaveLength(1);
  });

  it('missing-image: the first card shows the placeholder and still reveals its word', async () => {
    useVariant('missing-image');
    render(<App search={VALID} />);

    const card = await screen.findByTestId('card-current');
    const img = card.querySelector('img') as HTMLImageElement;
    expect(img).toHaveAttribute('src', './decks/animals/images/alligator.png');
    expect(existsSync(fileFor(img.getAttribute('src') as string))).toBe(false);
    // jsdom never loads <img> resources; dispatch the error the browser raises for the absent file.
    fireEvent.error(img);
    expect(screen.getByTestId('image-placeholder')).toBeInTheDocument();

    await revealFirstCard();
    expect(screen.getByTestId('face-back')).toHaveTextContent(/^Alligator$/);
    expect(starts).toHaveLength(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('missing-audio: the reveal shows the word silently, with no error', async () => {
    useVariant('missing-audio');
    render(<App search={VALID} />);
    await revealFirstCard();

    expect(screen.getByTestId('face-back')).toHaveTextContent(/^Alligator$/);
    expect(starts).toEqual([]);
    expect(screen.queryByTestId('error-code')).not.toBeInTheDocument();
    expect(error).not.toHaveBeenCalled();
  });

  it('missing-word-one: dog is skipped with a warning and the deck still plays', async () => {
    useVariant('missing-word-one');
    render(<App search={VALID} />);

    const card = await screen.findByTestId('card-current');
    expect(card).toHaveAccessibleName('Card 1 of 4. Activate to reveal the word.');
    expect(warn.mock.calls.some(([message]) => /\[flashcard\].*dog/.test(String(message)))).toBe(true);
    await revealFirstCard();
    expect(screen.getByTestId('face-back')).toHaveTextContent(/^Alligator$/);
    expect(error).not.toHaveBeenCalled();
  });
});

describe('IT-04 loading gate', () => {
  it('renders the ready UI at LOAD_GATE_MS when every image/audio/font load hangs, then preloads the rest', async () => {
    jest.useFakeTimers();
    hangs = isBinaryAsset;
    render(<App search={VALID} />);

    await act(() => jest.advanceTimersByTimeAsync(LOAD_GATE_MS - 1));
    expect(screen.getByTestId('loading')).toBeInTheDocument();
    // The first PRELOAD_CONCURRENCY critical assets (current card, then fonts) are in flight; nothing else yet.
    expect(FakeImage.requests).toEqual(['./decks/animals/images/alligator.png']);
    expect(FakeXhr.requests.filter(isBinaryAsset)).toEqual([
      './lang/english/audios/animals_alligator.wav',
      './fonts/NotoSans-Regular.woff2',
      './fonts/NotoSans-Bold.woff2',
    ]);

    await act(() => jest.advanceTimersByTimeAsync(1));
    expect(screen.queryByTestId('loading')).not.toBeInTheDocument();
    expect(screen.getByTestId('card-current')).toHaveAttribute('data-card-id', 'alligator');
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[flashcard\] critical assets not ready after 5000 ms/));

    // Hung assets time out and free their slots, so the background batch still runs.
    await act(() => jest.advanceTimersByTimeAsync(3 * LOAD_GATE_MS));
    expect(FakeImage.requests).toEqual(ANIMALS.map((id) => `./decks/animals/images/${id}.png`));
    expect(error).not.toHaveBeenCalled();
  });

  it('times out a hanging deck file after LOAD_GATE_MS with E2', async () => {
    jest.useFakeTimers();
    hangs = (url) => url.endsWith('deck.json');
    render(<App search={VALID} />);

    await act(() => jest.advanceTimersByTimeAsync(LOAD_GATE_MS - 1));
    expect(screen.getByTestId('loading')).toBeInTheDocument();
    await act(() => jest.advanceTimersByTimeAsync(1));
    expect(screen.getByTestId('error-code')).toHaveTextContent(/^E2$/);
  });
});
