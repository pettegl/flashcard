// DEVSPEC §I.2: on-disk deck/words shapes (after validation) and the derived runtime card.

/** `decks/<deck>/deck.json` (§I.2.1). */
export interface DeckFile {
  schema_version: 1;
  deck_id: string;
  card_order: string[];
  cards: DeckCard[];
}

export interface DeckCard {
  card_id: string;
  image: string;
}

/** `lang/<lang>/<deck>.json` (§I.2.2), holding only the cards that passed validation. */
export interface WordsFile {
  schema_version: 1;
  deck_id: string;
  lang: string;
  cards: WordsCard[];
}

export interface WordsCard {
  card_id: string;
  target_word: string;
  audio: string | null;
}

/** §I.2.3 */
export interface PlayableCard {
  cardId: string;
  index: number;
  imageUrl: string;
  word: string;
  audioUrl: string | null;
}

/** Error screen code: E2 = unusable deck/words data, E3 = zero playable cards (§II.4). */
export type DeckErrorCode = 'E2' | 'E3';

export class DeckError extends Error {
  readonly code: DeckErrorCode;
  readonly problems: readonly string[];

  constructor(code: DeckErrorCode, problems: readonly string[]) {
    super(`[flashcard] ${code}: ${problems.join('; ')}`);
    this.name = 'DeckError';
    this.code = code;
    this.problems = problems;
  }
}
