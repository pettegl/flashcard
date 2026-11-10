import { createAudioPlayer } from '../../src/audio/audioPlayer';
import type { PlayableCard } from '../../src/data/types';
import type { PreloadResult } from '../../src/platform/preload';

// UT-23: AudioPlayer with a mocked AudioContext (FR-13).

class FakeSource {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  connect = jest.fn();
  disconnect = jest.fn();
  start = jest.fn();
  stop = jest.fn();
}

interface PendingDecode {
  data: ArrayBuffer;
  succeed: () => void;
  fail: () => void;
}

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  static initialState: AudioContextState = 'running';
  /** When false, `decodeAudioData` waits for the test to settle it (see `pendingDecodes`). */
  static autoDecode = true;
  static failDecode = false;
  static returnPromise = false;

  state: AudioContextState = FakeAudioContext.initialState;
  sampleRate = 44100;
  destination = { name: 'destination' };
  sources: FakeSource[] = [];
  pendingDecodes: PendingDecode[] = [];
  resume = jest.fn(() => {
    this.state = 'running';
    return Promise.resolve();
  });
  createBuffer = jest.fn((channels: number, length: number, sampleRate: number) => ({
    silent: true,
    channels,
    length,
    sampleRate,
  }));
  decodeAudioData = jest.fn(
    (data: ArrayBuffer, success: (buffer: unknown) => void, failure: (error: unknown) => void) => {
      const decode: PendingDecode = {
        data,
        succeed: () => success({ decodedFrom: data.byteLength }),
        fail: () => failure(null),
      };
      let returned: Promise<unknown> | undefined;
      if (FakeAudioContext.returnPromise) {
        // Modern engines: callbacks and a promise that rejects on failure.
        returned = new Promise((resolve, reject) => {
          decode.succeed = () => {
            success({ decodedFrom: data.byteLength });
            resolve(undefined);
          };
          decode.fail = () => {
            failure(new Error('bad audio'));
            reject(new Error('bad audio'));
          };
        });
      }
      if (!FakeAudioContext.autoDecode) this.pendingDecodes.push(decode);
      else if (FakeAudioContext.failDecode) decode.fail();
      else decode.succeed();
      return returned;
    },
  );
  createBufferSource = jest.fn(() => {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  });

  constructor() {
    FakeAudioContext.instances.push(this);
  }
}

const bytes = (length: number) => new ArrayBuffer(length);

const card = (cardId: string, index: number, audioUrl: string | null): PlayableCard => ({
  cardId,
  index,
  imageUrl: `./decks/animals/images/${cardId}.png`,
  word: cardId,
  audioUrl,
});

const audioUrl = (cardId: string) => `./lang/english/audios/animals_${cardId}.wav`;

const cards = [
  card('alligator', 0, audioUrl('alligator')),
  card('bear', 1, audioUrl('bear')),
  card('cat', 2, null),
  card('dog', 3, audioUrl('dog')),
  card('elephant', 4, audioUrl('elephant')),
];

let preloaded: Map<string, PreloadResult>;
let warn: jest.SpyInstance;

function setContextConstructors(standard: unknown, webkit: unknown = undefined) {
  Object.defineProperty(window, 'AudioContext', { value: standard, configurable: true, writable: true });
  Object.defineProperty(window, 'webkitAudioContext', { value: webkit, configurable: true, writable: true });
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const context = () => FakeAudioContext.instances[0];
const started = () => context().sources.filter((source) => source.start.mock.calls.length > 0);

beforeEach(() => {
  FakeAudioContext.instances = [];
  FakeAudioContext.initialState = 'running';
  FakeAudioContext.autoDecode = true;
  FakeAudioContext.failDecode = false;
  FakeAudioContext.returnPromise = false;
  setContextConstructors(FakeAudioContext);
  preloaded = new Map<string, PreloadResult>([
    [audioUrl('alligator'), { ok: true, kind: 'audio', data: bytes(10) }],
    [audioUrl('bear'), { ok: true, kind: 'audio', data: bytes(20) }],
    [audioUrl('dog'), { ok: false, kind: 'audio', error: new Error('missing') }],
  ]);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  delete (window as { AudioContext?: unknown }).AudioContext;
  delete (window as { webkitAudioContext?: unknown }).webkitAudioContext;
  warn.mockRestore();
});

describe('UT-23 AudioPlayer', () => {
  it('creates the context lazily on the first play and shares it afterwards', async () => {
    const player = createAudioPlayer(cards, preloaded);
    expect(FakeAudioContext.instances).toHaveLength(0);

    player.stop();
    expect(FakeAudioContext.instances).toHaveLength(0);

    player.play('alligator');
    player.play('bear');
    await flush();
    expect(FakeAudioContext.instances).toHaveLength(1);
  });

  it('falls back to webkitAudioContext (iOS Safari 13)', async () => {
    setContextConstructors(undefined, FakeAudioContext);
    const player = createAudioPlayer(cards, preloaded);
    player.play('alligator');
    await flush();
    expect(FakeAudioContext.instances).toHaveLength(1);
    expect(started()).toHaveLength(1);
  });

  it('resumes a suspended context, and leaves a running one alone', async () => {
    FakeAudioContext.initialState = 'suspended';
    const player = createAudioPlayer(cards, preloaded);
    player.play('alligator');
    expect(context().resume).toHaveBeenCalledTimes(1);

    player.play('alligator');
    expect(context().resume).toHaveBeenCalledTimes(1);

    context().state = 'interrupted' as AudioContextState;
    player.play('alligator');
    expect(context().resume).toHaveBeenCalledTimes(2);
    await flush();
  });

  it('starts the card buffer once, decoding a copy of the preloaded bytes', async () => {
    const player = createAudioPlayer(cards, preloaded);
    player.play('alligator');
    await flush();

    const [source] = started();
    expect(started()).toHaveLength(1);
    expect(source.buffer).toEqual({ decodedFrom: 10 });
    expect(source.connect).toHaveBeenCalledWith(context().destination);
    const original = (preloaded.get(audioUrl('alligator')) as { data: ArrayBuffer }).data;
    expect(context().decodeAudioData.mock.calls[0][0]).not.toBe(original);
    expect(original.byteLength).toBe(10);
  });

  it('decodes each card once and replays a decoded card synchronously', async () => {
    const player = createAudioPlayer(cards, preloaded);
    player.play('alligator');
    await flush();
    player.play('alligator');
    expect(started()).toHaveLength(2);
    expect(context().decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('stops the first source when a second play starts (one voice at a time)', async () => {
    const player = createAudioPlayer(cards, preloaded);
    player.play('alligator');
    await flush();
    player.play('bear');
    await flush();

    const [first, second] = started();
    expect(first.stop).toHaveBeenCalledTimes(1);
    expect(second.buffer).toEqual({ decodedFrom: 20 });
    expect(second.stop).not.toHaveBeenCalled();
  });

  it('stop() stops the playing source; a second stop() is harmless', async () => {
    const player = createAudioPlayer(cards, preloaded);
    player.play('alligator');
    await flush();
    player.stop();
    player.stop();
    expect(started()[0].stop).toHaveBeenCalledTimes(1);
    expect(started()[0].disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not stop a source that has already ended', async () => {
    const player = createAudioPlayer(cards, preloaded);
    player.play('alligator');
    await flush();
    started()[0].onended?.();
    player.stop();
    expect(started()[0].stop).not.toHaveBeenCalled();
  });

  it('never starts a clip whose decode finishes after stop() or a newer play()', async () => {
    FakeAudioContext.autoDecode = false;
    const player = createAudioPlayer(cards, preloaded);

    player.play('alligator');
    player.stop();
    context().pendingDecodes[0].succeed();
    await flush();
    expect(started()).toHaveLength(0);

    player.play('bear');
    player.play('alligator');
    context().pendingDecodes[1].succeed();
    await flush();
    expect(started()).toHaveLength(1);
    expect(started()[0].buffer).toEqual({ decodedFrom: 10 });
    // alligator was decoded once, by the first play; the second play reused it.
    expect(context().decodeAudioData).toHaveBeenCalledTimes(2);
  });

  it('shares an in-flight decode between plays of the same card', async () => {
    FakeAudioContext.autoDecode = false;
    const player = createAudioPlayer(cards, preloaded);
    player.play('alligator');
    player.play('alligator');
    expect(context().decodeAudioData).toHaveBeenCalledTimes(1);
    context().pendingDecodes[0].succeed();
    await flush();
    expect(started()).toHaveLength(1);
  });

  it.each([
    ['has no audio file', 'cat'],
    ['failed to preload', 'dog'],
    ['is not preloaded yet', 'elephant'],
    ['is unknown', 'ghost'],
  ])('plays nothing and does not throw when the card %s', async (_, cardId) => {
    const player = createAudioPlayer(cards, preloaded);
    expect(() => player.play(cardId)).not.toThrow();
    await flush();
    expect(started()).toHaveLength(0);
    expect(context().decodeAudioData).not.toHaveBeenCalled();
  });

  it('uses bytes that the background batch adds after the player was created', async () => {
    const player = createAudioPlayer(cards, preloaded);
    player.play('elephant');
    await flush();
    expect(started()).toHaveLength(0);

    preloaded.set(audioUrl('elephant'), { ok: true, kind: 'audio', data: bytes(50) });
    player.play('elephant');
    await flush();
    expect(started()[0].buffer).toEqual({ decodedFrom: 50 });
  });

  it.each([
    ['is not supported', () => setContextConstructors(undefined)],
    [
      'throws on construction',
      () =>
        setContextConstructors(function Broken() {
          throw new Error('no audio hardware');
        }),
    ],
  ])('plays nothing, without throwing, when Web Audio %s; warns once', async (_, setUp) => {
    setUp();
    const player = createAudioPlayer(cards, preloaded);
    expect(() => {
      player.play('alligator');
      player.play('bear');
      player.stop();
    }).not.toThrow();
    await flush();
    expect(FakeAudioContext.instances).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[flashcard\] audio unavailable/);
  });

  it.each([
    ['callback-only decodeAudioData (iOS Safari 13)', false],
    ['promise-returning decodeAudioData', true],
  ])('substitutes a 1-frame silent buffer when decoding fails: %s', async (_, returnPromise) => {
    FakeAudioContext.failDecode = true;
    FakeAudioContext.returnPromise = returnPromise;
    const player = createAudioPlayer(cards, preloaded);
    player.play('alligator');
    await flush();

    expect(context().createBuffer).toHaveBeenCalledWith(1, 1, 44100);
    expect(started()).toHaveLength(1);
    expect(started()[0].buffer).toMatchObject({ silent: true, length: 1 });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[flashcard\] audio for alligator could not be decoded/);

    player.play('alligator');
    expect(context().decodeAudioData).toHaveBeenCalledTimes(1);
  });

  it('treats a decodeAudioData that throws synchronously as a decode failure', async () => {
    const player = createAudioPlayer(cards, preloaded);
    player.play('bear');
    await flush();
    context().decodeAudioData.mockImplementation(() => {
      throw new Error('detached buffer');
    });
    player.play('alligator');
    await flush();
    expect(started()[1].buffer).toMatchObject({ silent: true });
  });

  it('swallows a failing resume() and a failing source start()', async () => {
    FakeAudioContext.initialState = 'suspended';
    const player = createAudioPlayer(cards, preloaded);
    player.play('alligator');
    await flush();

    context().state = 'suspended';
    context().resume.mockImplementation(() => Promise.reject(new Error('not allowed')));
    context().createBufferSource.mockImplementation(() => {
      const source = new FakeSource();
      source.start.mockImplementation(() => {
        throw new Error('cannot start');
      });
      return source;
    });
    expect(() => player.play('alligator')).not.toThrow();
    await flush();

    context().resume.mockImplementation(() => {
      throw new Error('closed');
    });
    expect(() => player.play('alligator')).not.toThrow();
    await flush();
    expect(warn.mock.calls.map((call) => call[0])).toEqual([
      '[flashcard] audio could not be started',
      '[flashcard] audio context could not be resumed',
      '[flashcard] audio context could not be resumed',
      '[flashcard] audio could not be started',
    ]);
  });
});
