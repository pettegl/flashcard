import { DeckError, type DeckFile, type PlayableCard, type WordsFile } from './types';

// FR-09: merge the validated deck and words into the ordered playable list (RD-16).
export const MAX_CARDS = 100;

export function buildPlayableCards(deck: DeckFile, words: WordsFile): PlayableCard[] {
  const imageOf = new Map(deck.cards.map((card) => [card.card_id, card.image]));
  const wordOf = new Map(words.cards.map((card) => [card.card_id, card]));
  const seen = new Set<string>();
  const playable: PlayableCard[] = [];
  let truncated = 0;

  for (const cardId of deck.card_order) {
    if (seen.has(cardId)) {
      console.warn(`[flashcard] card_order repeats "${cardId}"; later occurrence skipped`);
      continue;
    }
    seen.add(cardId);

    const image = imageOf.get(cardId);
    if (image === undefined) {
      console.warn(`[flashcard] card_order id "${cardId}" is not in the deck cards; skipped`);
      continue;
    }
    const word = wordOf.get(cardId);
    if (word === undefined) {
      console.warn(`[flashcard] card "${cardId}" has no ${words.lang} word; skipped`);
      continue;
    }
    if (playable.length === MAX_CARDS) {
      truncated++;
      continue;
    }
    playable.push({
      cardId,
      index: playable.length,
      imageUrl: `./decks/${deck.deck_id}/${image}`,
      word: word.target_word,
      audioUrl: word.audio === null ? null : `./${word.audio}`,
    });
  }

  if (truncated > 0) {
    console.warn(
      `[flashcard] deck has ${MAX_CARDS + truncated} playable cards; kept the first ${MAX_CARDS} (MAX_CARDS)`,
    );
  }
  if (playable.length === 0) throw new DeckError('E3', ['no playable cards']);
  return playable;
}
