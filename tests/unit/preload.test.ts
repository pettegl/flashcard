import { loadBinary } from '../../src/platform/loadBinary';
import { PRELOAD_CONCURRENCY, preload, type PreloadAsset } from '../../src/platform/preload';

jest.mock('../../src/platform/loadBinary', () => ({ loadBinary: jest.fn() }));

const loadBinaryMock = loadBinary as jest.MockedFunction<typeof loadBinary>;

interface Deferred {
  resolve: () => void;
  reject: () => void;
}

// Image() stand-in: each src assignment is held until the test settles it.
class FakeImage {
  static pending = new Map<string, Deferred>();
  static inFlight = 0;
  static maxInFlight = 0;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(url: string) {
    FakeImage.inFlight++;
    FakeImage.maxInFlight = Math.max(FakeImage.maxInFlight, FakeImage.inFlight);
    const done = (cb: (() => void) | null) => () => {
      FakeImage.inFlight--;
      FakeImage.pending.delete(url);
      cb?.();
    };
    FakeImage.pending.set(url, { resolve: done(this.onload), reject: done(this.onerror) });
  }
}

class FakeFontFace {
  static instances: FakeFontFace[] = [];
  static failLoad = false;
  constructor(
    public family: string,
    public data: ArrayBuffer,
    public descriptors: FontFaceDescriptors,
  ) {
    FakeFontFace.instances.push(this);
  }
  load() {
    return FakeFontFace.failLoad ? Promise.reject(new Error('bad font')) : Promise.resolve(this);
  }
}

const fontsAdd = jest.fn();
const originalImage = globalThis.Image;
let warn: jest.SpyInstance;

function setGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

const image = (name: string): PreloadAsset => ({ kind: 'image', url: `./decks/animals/images/${name}.png` });

// Settle each pending image (in request order) until the preload resolves.
async function drainImages<T>(pending: Promise<T>, failing: string[] = []): Promise<T> {
  let finished = false;
  void pending.then(() => (finished = true));
  while (!finished) {
    await Promise.resolve();
    for (const [url, deferred] of FakeImage.pending) {
      if (failing.includes(url)) deferred.reject();
      else deferred.resolve();
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return pending;
}

beforeEach(() => {
  FakeImage.pending.clear();
  FakeImage.inFlight = 0;
  FakeImage.maxInFlight = 0;
  FakeFontFace.instances = [];
  FakeFontFace.failLoad = false;
  fontsAdd.mockReset();
  loadBinaryMock.mockReset();
  setGlobal('Image', FakeImage);
  setGlobal('FontFace', FakeFontFace);
  Object.defineProperty(document, 'fonts', { value: { add: fontsAdd }, configurable: true });
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.useRealTimers();
  setGlobal('Image', originalImage);
  delete (globalThis as { FontFace?: unknown }).FontFace;
  delete (document as { fonts?: unknown }).fonts;
  warn.mockRestore();
});

describe('UT-09 preload', () => {
  it('resolves with 1 of 5 failing; the failure is recorded and warned, never thrown', async () => {
    const assets = ['alligator', 'bear', 'cat', 'dog', 'elephant'].map(image);
    const results = await drainImages(preload(assets), ['./decks/animals/images/cat.png']);

    expect(results.size).toBe(5);
    expect(results.get('./decks/animals/images/cat.png')).toEqual({
      ok: false,
      kind: 'image',
      error: expect.any(Error),
    });
    for (const name of ['alligator', 'bear', 'dog', 'elephant']) {
      expect(results.get(`./decks/animals/images/${name}.png`)).toEqual({ ok: true, kind: 'image' });
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[flashcard\] preload failed for .*cat\.png/);
  });

  it(`keeps at most PRELOAD_CONCURRENCY (${PRELOAD_CONCURRENCY}) requests in flight`, async () => {
    const assets = Array.from({ length: 10 }, (_, i) => image(`card-${i}`));
    const pending = preload(assets);
    await Promise.resolve();
    expect(FakeImage.inFlight).toBe(4);
    const results = await drainImages(pending);
    expect(FakeImage.maxInFlight).toBe(4);
    expect(results.size).toBe(10);
  });

  it('honours a custom concurrency and loads duplicate URLs once', async () => {
    const results = await drainImages(preload([image('a'), image('b'), image('a')], { concurrency: 1 }));
    expect(FakeImage.maxInFlight).toBe(1);
    expect([...results.keys()]).toEqual(['./decks/animals/images/a.png', './decks/animals/images/b.png']);
  });

  it('returns audio bytes, and records an audio load failure without decoding', async () => {
    const data = new ArrayBuffer(8);
    loadBinaryMock.mockImplementation((url) =>
      url.endsWith('bear.wav') ? Promise.reject(new Error('missing')) : Promise.resolve(data),
    );
    const results = await preload(
      [
        { kind: 'audio', url: './lang/english/audios/animals_alligator.wav' },
        { kind: 'audio', url: './lang/english/audios/animals_bear.wav' },
      ],
      { timeoutMs: 5000 },
    );
    expect(results.get('./lang/english/audios/animals_alligator.wav')).toEqual({ ok: true, kind: 'audio', data });
    expect(results.get('./lang/english/audios/animals_bear.wav')).toMatchObject({ ok: false, kind: 'audio' });
    expect(loadBinaryMock).toHaveBeenCalledWith('./lang/english/audios/animals_alligator.wav', { timeoutMs: 5000 });
  });

  it('loads fonts through loadBinary + FontFace and registers them', async () => {
    const data = new ArrayBuffer(4);
    loadBinaryMock.mockResolvedValue(data);
    const results = await preload([
      { kind: 'font', url: './fonts/NotoSans-Bold.woff2', family: 'Noto Sans', weight: '700' },
    ]);
    expect(results.get('./fonts/NotoSans-Bold.woff2')).toEqual({ ok: true, kind: 'font' });
    expect(FakeFontFace.instances[0]).toMatchObject({ family: 'Noto Sans', data, descriptors: { weight: '700' } });
    expect(fontsAdd).toHaveBeenCalledWith(FakeFontFace.instances[0]);
  });

  it('treats a font that fails to load, or a missing FontFace API, as non-fatal', async () => {
    const font: PreloadAsset = { kind: 'font', url: './fonts/NotoSans-Regular.woff2', family: 'Noto Sans', weight: '400' };
    loadBinaryMock.mockResolvedValue(new ArrayBuffer(4));
    FakeFontFace.failLoad = true;
    expect((await preload([font])).get(font.url)).toMatchObject({ ok: false, kind: 'font' });

    delete (globalThis as { FontFace?: unknown }).FontFace;
    expect((await preload([font])).get(font.url)).toMatchObject({ ok: false, kind: 'font' });
    expect(fontsAdd).not.toHaveBeenCalled();
  });

  it('fails a hanging image after timeoutMs and frees its slot for the rest', async () => {
    jest.useFakeTimers();
    const pending = preload([image('hang'), image('next')], { concurrency: 1, timeoutMs: 5000 });
    await jest.advanceTimersByTimeAsync(5000);
    for (let i = 0; i < 10 && !FakeImage.pending.has('./decks/animals/images/next.png'); i++) {
      await Promise.resolve();
    }
    FakeImage.pending.get('./decks/animals/images/next.png')?.resolve();
    const results = await pending;
    expect(results.get('./decks/animals/images/hang.png')).toMatchObject({ ok: false, kind: 'image' });
    expect(results.get('./decks/animals/images/next.png')).toEqual({ ok: true, kind: 'image' });
  });

  it('resolves an empty batch to an empty map', async () => {
    await expect(preload([])).resolves.toEqual(new Map());
  });
});
