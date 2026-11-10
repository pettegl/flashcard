import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { MAX_CARDS, buildPlayableCards } from '../../src/data/buildPlayableCards';
import { DeckError, type DeckFile, type WordsFile } from '../../src/data/types';
import { validateDeck } from '../../src/data/validateDeck';
import { validateWords } from '../../src/data/validateWords';

const FIXTURES = resolve(__dirname, '../../fixtures');
const readJson = (tree: string, rel: string): unknown => JSON.parse(readFileSync(join(FIXTURES, tree, rel), 'utf8'));
const deckOf = (tree: string) => validateDeck(readJson(tree, 'decks/animals/deck.json'), 'animals');
const wordsOf = (tree: string, lang = 'english') =>
  validateWords(readJson(tree, `lang/${lang}/animals.json`), 'animals', lang);

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

const warnings = () => warn.mock.calls.map((call) => call[0] as string);

function syntheticDeck(order: string[], ids: string[]): DeckFile {
  return {
    schema_version: 1,
    deck_id: 'animals',
    card_order: order,
    cards: ids.map((id) => ({ card_id: id, image: `images/${id}.png` })),
  };
}

function syntheticWords(ids: string[]): WordsFile {
  return {
    schema_version: 1,
    deck_id: 'animals',
    lang: 'english',
    cards: ids.map((id) => ({ card_id: id, target_word: id, audio: null })),
  };
}

const cardIds = (count: number, prefix = 'card') =>
  Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(3, '0')}`);

describe('UT-13 buildPlayableCards: order, skipping and urls', () => {
  it('builds the five primary cards in card_order with relative urls', () => {
    const cards = buildPlayableCards(deckOf('content'), wordsOf('content'));
    expect(cards).toHaveLength(5);
    expect(cards[0]).toEqual({
      cardId: 'alligator',
      index: 0,
      imageUrl: './decks/animals/images/alligator.png',
      word: 'Alligator',
      audioUrl: './lang/english/audios/animals_alligator.wav',
    });
    expect(cards.map((c) => [c.index, c.cardId])).toEqual([
      [0, 'alligator'],
      [1, 'bear'],
      [2, 'cat'],
      [3, 'dog'],
      [4, 'elephant'],
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('uses the words of the chosen language', () => {
    const cards = buildPlayableCards(deckOf('content'), wordsOf('content', 'spanish'));
    expect(cards.map((c) => c.word)).toEqual(['Caimán', 'Oso', 'Gato', 'Perro', 'Elefante']);
    expect(cards[0].audioUrl).toBe('./lang/spanish/audios/animals_alligator.wav');
  });

  it('dup-order: respects order, drops the duplicate and skips the unknown id, with warnings', () => {
    const cards = buildPlayableCards(deckOf('variants/dup-order'), wordsOf('variants/dup-order'));
    expect(cards.map((c) => [c.index, c.cardId])).toEqual([
      [0, 'alligator'],
      [1, 'bear'],
      [2, 'cat'],
    ]);
    expect(warnings()).toEqual([
      '[flashcard] card_order repeats "bear"; later occurrence skipped',
      '[flashcard] card_order id "ghost" is not in the deck cards; skipped',
    ]);
  });

  it('missing-word-one: skips the card without a word, with a warning', () => {
    const cards = buildPlayableCards(deckOf('variants/missing-word-one'), wordsOf('variants/missing-word-one'));
    expect(cards.map((c) => c.cardId)).toEqual(['alligator', 'bear', 'cat', 'elephant']);
    expect(cards.map((c) => c.index)).toEqual([0, 1, 2, 3]);
    expect(warnings()).toEqual(['[flashcard] card "dog" has no english word; skipped']);
  });

  it('a card without audio gets audioUrl null', () => {
    const cards = buildPlayableCards(syntheticDeck(['a'], ['a']), syntheticWords(['a']));
    expect(cards).toEqual([{ cardId: 'a', index: 0, imageUrl: './decks/animals/images/a.png', word: 'a', audioUrl: null }]);
  });

  it('deck cards absent from card_order are not shown', () => {
    const cards = buildPlayableCards(syntheticDeck(['b'], ['a', 'b']), syntheticWords(['a', 'b']));
    expect(cards.map((c) => c.cardId)).toEqual(['b']);
  });
});

describe('UT-14 buildPlayableCards: E3 and MAX_CARDS', () => {
  function expectE3(run: () => unknown) {
    expect(run).toThrow(DeckError);
    try {
      run();
    } catch (error) {
      expect((error as DeckError).code).toBe('E3');
    }
  }

  it('no-playable variant → E3', () => {
    expectE3(() => buildPlayableCards(deckOf('variants/no-playable'), wordsOf('variants/no-playable')));
  });

  it('empty card_order or empty words → E3', () => {
    expectE3(() => buildPlayableCards(syntheticDeck([], ['a']), syntheticWords(['a'])));
    expectE3(() => buildPlayableCards(syntheticDeck(['a'], ['a']), syntheticWords([])));
  });

  it('MAX_CARDS is 100 (DEVSPEC §I.2.5)', () => {
    expect(MAX_CARDS).toBe(100);
  });

  it('bigdeck-120: keeps the first 100 cards with one truncation warning', () => {
    const cards = buildPlayableCards(deckOf('variants/bigdeck-120'), wordsOf('variants/bigdeck-120'));
    expect(cards).toHaveLength(MAX_CARDS);
    expect(cards.map((c) => c.cardId)).toEqual(cardIds(100));
    expect(cards[99]).toMatchObject({ index: 99, word: 'Card 100' });
    expect(warnings()).toEqual(['[flashcard] deck has 120 playable cards; kept the first 100 (MAX_CARDS)']);
  });

  it('bigdeck (exactly 100): no warning', () => {
    expect(buildPlayableCards(deckOf('variants/bigdeck'), wordsOf('variants/bigdeck'))).toHaveLength(100);
    expect(warn).not.toHaveBeenCalled();
  });

  it('105 order ids of which 5 are unknown → 100 cards, limit counted after skipping (no truncation warning)', () => {
    const known = cardIds(100);
    const order = [...known.slice(0, 50), ...cardIds(5, 'ghost'), ...known.slice(50)];
    const cards = buildPlayableCards(syntheticDeck(order, known), syntheticWords(known));
    expect(cards.map((c) => c.cardId)).toEqual(known);
    expect(warnings()).toHaveLength(5);
    expect(warnings().every((w) => / is not in the deck cards; skipped$/.test(w))).toBe(true);
  });

  it('limit is counted after de-duplication', () => {
    const known = cardIds(100);
    const order = [known[0], known[0], ...known.slice(1)];
    const cards = buildPlayableCards(syntheticDeck(order, known), syntheticWords(known));
    expect(cards).toHaveLength(100);
    expect(warnings()).toEqual([`[flashcard] card_order repeats "${known[0]}"; later occurrence skipped`]);
  });
});
