import type { PlayableCard } from '../../src/data/types';
import { initDeckState } from '../../src/state/deckReducer';
import { progressKey, restoreIndex, saveProgress, STORAGE_KEY_PREFIX } from '../../src/storage/progress';

// UT-21, UT-22 (FR-12; DEVSPEC §I.2.4, §II.4).
const CARDS: PlayableCard[] = ['alligator', 'bear', 'cat', 'dog', 'elephant'].map((id, index) => ({
  cardId: id,
  index,
  imageUrl: `./decks/animals/images/${id}.png`,
  word: id,
  audioUrl: null,
}));
const ANIMALS = { lang: 'english', deck: 'animals' };
const KEY = 'flashcard:v1:english:animals';

let warn: jest.SpyInstance;
beforeEach(() => {
  window.localStorage.clear();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => jest.restoreAllMocks());

describe('UT-21 save then restore progress', () => {
  it('stores only the card_id under flashcard:v1:<lang>:<deck>', () => {
    expect(STORAGE_KEY_PREFIX).toBe('flashcard:v1');
    const params = { ...ANIMALS, userId: 'test-user' };
    expect(progressKey(params)).toBe(KEY);

    saveProgress(ANIMALS, 'dog');
    expect(window.localStorage.length).toBe(1);
    expect(window.localStorage.getItem(KEY)).toBe('{"card_id":"dog"}');
  });

  it('restores the saved card on its front face', () => {
    saveProgress(ANIMALS, 'dog');
    const index = restoreIndex(ANIMALS, CARDS);
    expect(index).toBe(3);
    expect(initDeckState({ cards: CARDS, index })).toMatchObject({ index: 3, face: 'front' });
    expect(warn).not.toHaveBeenCalled();
  });

  it('the latest save wins, and each language/deck keeps its own progress', () => {
    saveProgress(ANIMALS, 'bear');
    saveProgress(ANIMALS, 'elephant');
    saveProgress({ lang: 'spanish', deck: 'animals' }, 'cat');

    expect(restoreIndex(ANIMALS, CARDS)).toBe(4);
    expect(restoreIndex({ lang: 'spanish', deck: 'animals' }, CARDS)).toBe(2);
    expect(restoreIndex({ lang: 'english', deck: 'fruit' }, CARDS)).toBe(0);
  });

  it('nothing saved → index 0 without a warning', () => {
    expect(restoreIndex(ANIMALS, CARDS)).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('UT-22 unusable progress starts on the first card, never throws', () => {
  it('a stored id that is no longer in the deck → index 0 with a warning', () => {
    saveProgress(ANIMALS, 'ghost');
    expect(restoreIndex(ANIMALS, CARDS)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[flashcard\] saved card "ghost" is not in the deck/));
  });

  it.each([
    ['invalid JSON', '{"card_id":'],
    ['null', 'null'],
    ['a bare string', '"dog"'],
    ['an array', '["dog"]'],
    ['a non-string card_id', '{"card_id":3}'],
    ['no card_id', '{"id":"dog"}'],
  ])('corrupt value (%s) → index 0 with a warning', (_label, raw) => {
    window.localStorage.setItem(KEY, raw);
    expect(restoreIndex(ANIMALS, CARDS)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[flashcard\] saved progress is corrupt/));
  });

  it('getItem throwing → index 0 with a warning', () => {
    jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(restoreIndex(ANIMALS, CARDS)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[flashcard\] progress not restored/), expect.any(DOMException));
  });

  it('setItem throwing (quota) → no exception, a warning', () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    expect(() => saveProgress(ANIMALS, 'dog')).not.toThrow();
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/^\[flashcard\] progress not saved/), expect.any(DOMException));
  });

  it('localStorage itself inaccessible → save and restore neither throw', () => {
    jest.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    expect(() => saveProgress(ANIMALS, 'dog')).not.toThrow();
    expect(restoreIndex(ANIMALS, CARDS)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
