import { buildPlayableCards } from '../data/buildPlayableCards';
import { DeckError, type DeckErrorCode, type PlayableCard } from '../data/types';
import { validateDeck } from '../data/validateDeck';
import { validateWords } from '../data/validateWords';
import { parseLaunchParams, type LaunchParams } from '../platform/launchParams';
import { loadJson } from '../platform/loadBinary';
import { preload, type PreloadAsset, type PreloadResult } from '../platform/preload';

// FR-10: boot sequence and loading gate (DEVSPEC §I.2.5).
export const LOAD_GATE_MS = 5000;

export const FONT_ASSETS: readonly PreloadAsset[] = [
  { kind: 'font', url: './fonts/NotoSans-Regular.woff2', family: 'Noto Sans', weight: '400' },
  { kind: 'font', url: './fonts/NotoSans-Bold.woff2', family: 'Noto Sans', weight: '700' },
];

export type BootErrorCode = 'E1' | DeckErrorCode;

export interface ReadyDeck {
  params: LaunchParams;
  cards: PlayableCard[];
  index: number;
  /** Preload results by URL; filled in as the critical and background batches settle. */
  preloaded: Map<string, PreloadResult>;
}

export type BootResult = { ok: true; deck: ReadyDeck } | { ok: false; code: BootErrorCode };

/**
 * Resolves once the deck is ready to show (or unusable). Never rejects for content problems;
 * a rejection means a programming error (the app shows E9).
 */
export async function boot(search: string): Promise<BootResult> {
  // (1) Params are validated before any path is built (FR-03).
  const parsed = parseLaunchParams(search);
  if (!parsed.ok) return { ok: false, code: 'E1' };
  const { params } = parsed;

  // (2) Deck + words in parallel; any load failure is E2.
  let deckJson: unknown;
  let wordsJson: unknown;
  try {
    [deckJson, wordsJson] = await Promise.all([
      loadJson(`./decks/${params.deck}/deck.json`, { timeoutMs: LOAD_GATE_MS }),
      loadJson(`./lang/${params.lang}/${params.deck}.json`, { timeoutMs: LOAD_GATE_MS }),
    ]);
  } catch (error) {
    console.warn('[flashcard] E2: deck or words file could not be loaded', error);
    return { ok: false, code: 'E2' };
  }

  // (3) Validate and merge → E2/E3.
  let cards: PlayableCard[];
  try {
    cards = buildPlayableCards(
      validateDeck(deckJson, params.deck),
      validateWords(wordsJson, params.deck, params.lang),
    );
  } catch (error) {
    if (!(error instanceof DeckError)) throw error;
    console.warn(`[flashcard] ${error.code}: ${error.problems.join('; ')}`);
    return { ok: false, code: error.code };
  }

  // (4) Progress restore (FR-12) arrives with Module 5; the MVP always starts on the first card (RD-11).
  const index = 0;

  // (5) Critical assets race the gate; (7) the rest follow in the background once they settle.
  const preloaded = new Map<string, PreloadResult>();
  const record = (results: Map<string, PreloadResult>) => results.forEach((result, url) => preloaded.set(url, result));
  const critical = criticalAssets(cards, index);
  const criticalDone = preload(critical, { timeoutMs: LOAD_GATE_MS }).then(record);
  void criticalDone
    .then(() => preload(backgroundAssets(cards, index, critical), { timeoutMs: LOAD_GATE_MS }))
    .then(record);
  await gate(criticalDone, LOAD_GATE_MS);

  // (6) The caller renders the ready UI.
  return { ok: true, deck: { params, cards, index, preloaded } };
}

/** Current card first (it is what the child sees), then fonts, then the neighbours. */
export function criticalAssets(cards: readonly PlayableCard[], index: number): PreloadAsset[] {
  const neighbours = [cards[index - 1], cards[index + 1]].filter((card) => card !== undefined);
  return [...cardAssets(cards[index]), ...FONT_ASSETS, ...neighbours.flatMap(cardAssets)];
}

/** Every other card, nearest to the current one first. */
export function backgroundAssets(
  cards: readonly PlayableCard[],
  index: number,
  exclude: readonly PreloadAsset[],
): PreloadAsset[] {
  const excluded = new Set(exclude.map((asset) => asset.url));
  return [...cards]
    .sort((a, b) => Math.abs(a.index - index) - Math.abs(b.index - index))
    .flatMap(cardAssets)
    .filter((asset) => !excluded.has(asset.url));
}

function cardAssets(card: PlayableCard): PreloadAsset[] {
  const image: PreloadAsset = { kind: 'image', url: card.imageUrl };
  return card.audioUrl === null ? [image] : [image, { kind: 'audio', url: card.audioUrl }];
}

// Promise.race against the gate, clearing the timer when the work wins.
function gate(work: Promise<void>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(() => {
      console.warn(`[flashcard] critical assets not ready after ${ms} ms; showing the deck anyway`);
      resolve();
    }, ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}
