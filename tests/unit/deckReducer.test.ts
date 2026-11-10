import type { PlayableCard } from '../../src/data/types';
import { deckReducer, initDeckState, type DeckAction, type DeckState } from '../../src/state/deckReducer';

const IDS = ['alligator', 'bear', 'cat', 'dog', 'elephant'];
const CARDS: PlayableCard[] = IDS.map((id, index) => ({
  cardId: id,
  index,
  imageUrl: `./decks/animals/images/${id}.png`,
  word: id,
  audioUrl: `./lang/english/audios/animals_${id}.wav`,
}));

const at = (index: number, face: DeckState['face'] = 'front'): DeckState => ({ cards: CARDS, index, face });
const run = (state: DeckState, ...actions: DeckAction[]) => actions.reduce(deckReducer, state);

describe('UT-15 initial state', () => {
  it.each([0, 3, 4])('starts on the supplied index %i, front face', (index) => {
    const state = initDeckState({ cards: CARDS, index });
    expect(state).toEqual({ cards: CARDS, index, face: 'front' });
    expect(state.cards).toBe(CARDS);
  });
});

describe('UT-16 NEXT/PREV at bounds (no wrap)', () => {
  it('PREV on the first card and NEXT on the last card are no-ops', () => {
    const first = at(0);
    const last = at(4);
    expect(deckReducer(first, { type: 'PREV' })).toBe(first);
    expect(deckReducer(last, { type: 'NEXT' })).toBe(last);
  });

  it('a no-op at a bound keeps the back face', () => {
    const back = at(4, 'back');
    expect(deckReducer(back, { type: 'NEXT' })).toBe(back);
  });

  it('NEXT and PREV move one card inside the bounds', () => {
    expect(deckReducer(at(0), { type: 'NEXT' })).toEqual(at(1));
    expect(deckReducer(at(4), { type: 'PREV' })).toEqual(at(3));
  });

  it('walks the whole deck and stops at each end', () => {
    const next: DeckAction = { type: 'NEXT' };
    const prev: DeckAction = { type: 'PREV' };
    expect(run(at(0), next, next, next, next, next, next).index).toBe(4);
    expect(run(at(4), prev, prev, prev, prev, prev, prev).index).toBe(0);
  });

  it('a one-card deck ignores NEXT and PREV', () => {
    const single: DeckState = { cards: CARDS.slice(0, 1), index: 0, face: 'front' };
    expect(run(single, { type: 'NEXT' }, { type: 'PREV' })).toBe(single);
  });
});

describe('UT-17 GO_TO', () => {
  it.each([0, 1, 4])('moves to the valid index %i', (index) => {
    expect(deckReducer(at(2), { type: 'GO_TO', index })).toEqual(at(index));
  });

  it.each([
    ['current', 2],
    ['negative', -1],
    ['= n', 5],
    ['> n', 99],
    ['non-integer', 1.5],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
  ])('%s index is a no-op (same state object)', (_label, index) => {
    const state = at(2, 'back');
    expect(deckReducer(state, { type: 'GO_TO', index })).toBe(state);
  });
});

describe('UT-19 FLIP (MVP: front→back only)', () => {
  it('FLIP on front reveals the back without moving', () => {
    expect(deckReducer(at(1), { type: 'FLIP' })).toEqual(at(1, 'back'));
  });

  it('FLIP on back stays back (same state object)', () => {
    const back = at(1, 'back');
    expect(deckReducer(back, { type: 'FLIP' })).toBe(back);
    expect(run(at(1), { type: 'FLIP' }, { type: 'FLIP' }, { type: 'FLIP' })).toEqual(back);
  });
});

describe('UT-20 any index change resets the face to front (RD-9)', () => {
  it.each<[string, DeckAction, number]>([
    ['NEXT', { type: 'NEXT' }, 3],
    ['PREV', { type: 'PREV' }, 1],
    ['GO_TO', { type: 'GO_TO', index: 0 }, 0],
  ])('%s from a back face lands on the front face', (_label, action, index) => {
    expect(deckReducer(at(2, 'back'), action)).toEqual(at(index, 'front'));
  });

  it('does not mutate the previous state', () => {
    const before = at(2, 'back');
    const snapshot = { ...before };
    deckReducer(before, { type: 'NEXT' });
    deckReducer(before, { type: 'FLIP' });
    expect(before).toEqual(snapshot);
  });
});
