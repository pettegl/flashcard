import type { PlayableCard } from '../data/types';
import type { PreloadResult } from '../platform/preload';

// FR-13: one shared Web Audio context, one voice at a time, never throws into gameplay.
declare global {
  interface Window {
    /** iOS Safari < 14.1 (target: iOS 13, NFR-07). */
    webkitAudioContext?: typeof AudioContext;
  }
}

export interface AudioPlayer {
  /** Stops any playing audio, then starts the card's clip. Call from the user gesture that flips the card. */
  play(cardId: string): void;
  /** Stops playback; also cancels a clip still being decoded. Call on navigation and on flip to front. */
  stop(): void;
}

/**
 * `preloaded` is read at play time, so bytes that the background batch adds later (FR-10 step 7) are used
 * once they arrive. A card with no audio URL, failed audio or bytes not loaded yet plays nothing.
 */
export function createAudioPlayer(
  cards: readonly PlayableCard[],
  preloaded: ReadonlyMap<string, PreloadResult>,
): AudioPlayer {
  const audioUrls = new Map(cards.map((card) => [card.cardId, card.audioUrl]));
  return new WebAudioPlayer((cardId) => {
    const url = audioUrls.get(cardId);
    const result = url ? preloaded.get(url) : undefined;
    return result?.ok && result.kind === 'audio' ? result.data : null;
  });
}

type AudioBytes = (cardId: string) => ArrayBuffer | null;

class WebAudioPlayer implements AudioPlayer {
  /** `undefined` until the first `play`; `null` when Web Audio is unavailable (silent reveals). */
  private context: AudioContext | null | undefined;
  private readonly decoded = new Map<string, AudioBuffer>();
  private readonly decoding = new Map<string, Promise<AudioBuffer>>();
  private source: AudioBufferSourceNode | null = null;
  /** Bumped by every `play`/`stop`, so a decode that settles late cannot start a superseded clip. */
  private request = 0;

  constructor(private readonly bytes: AudioBytes) {}

  play(cardId: string): void {
    this.stop();
    const request = this.request;
    const context = this.ensureContext();
    if (!context) return;
    resumeIfNeeded(context);

    const ready = this.decoded.get(cardId);
    if (ready) {
      this.start(context, ready);
      return;
    }
    void this.decode(context, cardId)?.then((buffer) => {
      if (request === this.request) this.start(context, buffer);
    });
  }

  stop(): void {
    this.request++;
    const source = this.source;
    if (!source) return;
    this.source = null;
    try {
      source.stop();
      source.disconnect();
    } catch {
      // Already stopped or ended.
    }
  }

  private ensureContext(): AudioContext | null {
    if (this.context !== undefined) return this.context;
    const Context = window.AudioContext ?? window.webkitAudioContext;
    try {
      if (!Context) throw new Error('Web Audio API not supported');
      this.context = new Context();
    } catch (error) {
      console.warn('[flashcard] audio unavailable; reveals are silent', error);
      this.context = null;
    }
    return this.context;
  }

  private decode(context: AudioContext, cardId: string): Promise<AudioBuffer> | null {
    const pending = this.decoding.get(cardId);
    if (pending) return pending;
    const data = this.bytes(cardId);
    if (!data) return null;

    const decoding = decodeAudio(context, data)
      .catch((error: unknown) => {
        console.warn(`[flashcard] audio for ${cardId} could not be decoded; playing silence`, error);
        return context.createBuffer(1, 1, context.sampleRate);
      })
      .then((buffer) => {
        this.decoded.set(cardId, buffer);
        return buffer;
      })
      .finally(() => this.decoding.delete(cardId));
    this.decoding.set(cardId, decoding);
    return decoding;
  }

  private start(context: AudioContext, buffer: AudioBuffer): void {
    try {
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(context.destination);
      source.onended = () => {
        if (this.source === source) this.source = null;
      };
      source.start(0);
      this.source = source;
    } catch (error) {
      console.warn('[flashcard] audio could not be started', error);
    }
  }
}

// Inside a user gesture this also unlocks audio on iOS (autoplay policy, DEVSPEC §II.5).
function resumeIfNeeded(context: AudioContext): void {
  if (context.state === 'running') return;
  try {
    void Promise.resolve(context.resume()).catch((error: unknown) =>
      console.warn('[flashcard] audio context could not be resumed', error),
    );
  } catch (error) {
    console.warn('[flashcard] audio context could not be resumed', error);
  }
}

/**
 * Callback form for iOS Safari 13, which has no promise-returning `decodeAudioData`. The bytes are copied
 * because decoding detaches the buffer it is given, and the preloaded copy must stay intact.
 */
function decodeAudio(context: AudioContext, data: ArrayBuffer): Promise<AudioBuffer> {
  return new Promise<AudioBuffer>((resolve, reject) => {
    const returned: unknown = context.decodeAudioData(data.slice(0), resolve, (error) =>
      reject(error ?? new Error('decodeAudioData failed')),
    );
    // Modern engines also return a promise that rejects; handle it so it is not reported as unhandled.
    if (returned instanceof Promise) returned.catch(reject);
  });
}
