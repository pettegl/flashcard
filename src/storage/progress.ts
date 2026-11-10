import type { PlayableCard } from '../data/types';
import type { LaunchParams } from '../platform/launchParams';

// FR-12 (DEVSPEC §I.2.4): resume on the last viewed card. Storage problems never reach gameplay (§II.4).
export const STORAGE_KEY_PREFIX = 'flashcard:v1';

export type ProgressScope = Pick<LaunchParams, 'lang' | 'deck'>;

/** `flashcard:v1:<lang>:<deck>`; never carries a user identifier (NFR-06). */
export function progressKey({ lang, deck }: ProgressScope): string {
  return `${STORAGE_KEY_PREFIX}:${lang}:${deck}`;
}

/** Stores `{"card_id": …}` for the deck; a failing storage is warned about and otherwise ignored. */
export function saveProgress(scope: ProgressScope, cardId: string): void {
  try {
    window.localStorage.setItem(progressKey(scope), JSON.stringify({ card_id: cardId }));
  } catch (error) {
    console.warn('[flashcard] progress not saved: localStorage unavailable', error);
  }
}

/** Index of the saved card in `cards`, or 0 when nothing usable is saved. Never throws. */
export function restoreIndex(scope: ProgressScope, cards: readonly PlayableCard[]): number {
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(progressKey(scope));
  } catch (error) {
    console.warn('[flashcard] progress not restored: localStorage unavailable', error);
    return 0;
  }
  if (raw === null) return 0;

  const cardId = parseCardId(raw);
  if (cardId === null) {
    console.warn('[flashcard] saved progress is corrupt; starting on the first card');
    return 0;
  }
  const index = cards.findIndex((card) => card.cardId === cardId);
  if (index < 0) {
    console.warn(`[flashcard] saved card "${cardId}" is not in the deck; starting on the first card`);
    return 0;
  }
  return index;
}

function parseCardId(raw: string): string | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const cardId = (value as { card_id?: unknown }).card_id;
    return typeof cardId === 'string' ? cardId : null;
  } catch {
    return null;
  }
}
