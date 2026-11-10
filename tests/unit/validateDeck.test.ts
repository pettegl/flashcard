import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DeckError } from '../../src/data/types';
import { validateDeck } from '../../src/data/validateDeck';

const FIXTURES = resolve(__dirname, '../../fixtures');
const readDeck = (tree: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FIXTURES, tree, 'decks/animals/deck.json'), 'utf8'));
const validDeck = () => readDeck('content');

function problemsOf(json: unknown, deck = 'animals'): readonly string[] {
  try {
    validateDeck(json, deck);
  } catch (error) {
    expect(error).toBeInstanceOf(DeckError);
    expect((error as DeckError).code).toBe('E2');
    return (error as DeckError).problems;
  }
  throw new Error('expected validateDeck to throw a DeckError');
}

function withCard(card: unknown): Record<string, unknown> {
  const deck = validDeck();
  (deck.cards as unknown[])[1] = card;
  return deck;
}

describe('UT-10 validateDeck: valid fixture', () => {
  it('passes and returns the deck', () => {
    const json = validDeck();
    expect(validateDeck(json, 'animals')).toEqual(json);
  });

  it('accepts every allowed image extension, in any case', () => {
    const deck = validDeck();
    const exts = ['png', 'jpg', 'jpeg', 'webp', 'svg'];
    (deck.cards as { image: string }[]).forEach((card, i) => (card.image = `images/sub/${card.image.slice(7, -4)}.${exts[i]}`));
    expect(() => validateDeck(deck, 'animals')).not.toThrow();
    expect(() => validateDeck(withCard({ card_id: 'bear', image: 'images/bear.PNG' }), 'animals')).not.toThrow();
  });

  it('accepts a 64-char hyphenated card_id', () => {
    const id = `a-${'b'.repeat(62)}`;
    expect(() => validateDeck(withCard({ card_id: id, image: 'images/x.png' }), 'animals')).not.toThrow();
  });
});

describe('UT-11 validateDeck: violations throw DeckError (E2)', () => {
  it.each<[string, () => unknown, RegExp]>([
    ['schema_version 2', () => ({ ...validDeck(), schema_version: 2 }), /^schema_version must be 1 \(got 2\)/],
    ['schema_version "1"', () => ({ ...validDeck(), schema_version: '1' }), /^schema_version/],
    ['schema_version missing', () => ({ ...validDeck(), schema_version: undefined }), /^schema_version.*undefined/],
    ['deck_id mismatch', () => ({ ...validDeck(), deck_id: 'plants' }), /^deck_id must be "animals" \(got "plants"\)/],
    ['duplicate card_id', () => withCard({ card_id: 'alligator', image: 'images/b.png' }), /^cards\[1\]\.card_id "alligator" duplicates cards\[0\]/],
    ['card_id Bear', () => withCard({ card_id: 'Bear', image: 'images/bear.png' }), /^cards\[1\]\.card_id "Bear" must match/],
    ['card_id a_b', () => withCard({ card_id: 'a_b', image: 'images/bear.png' }), /^cards\[1\]\.card_id "a_b" must match/],
    ['card_id a--b', () => withCard({ card_id: 'a--b', image: 'images/bear.png' }), /^cards\[1\]\.card_id/],
    ['card_id -a', () => withCard({ card_id: '-a', image: 'images/bear.png' }), /^cards\[1\]\.card_id/],
    ['card_id 65 chars', () => withCard({ card_id: 'a'.repeat(65), image: 'images/bear.png' }), /^cards\[1\]\.card_id .* longer than 64/],
    ['card_id missing', () => withCard({ image: 'images/bear.png' }), /^cards\[1\]\.card_id must be a string/],
    ['image with ..', () => withCard({ card_id: 'bear', image: '../lion/images/bear.png' }), /^cards\[1\]\.image .*must not contain "\.\."/],
    ['image /x', () => withCard({ card_id: 'bear', image: '/x.png' }), /^cards\[1\]\.image .*must not start with "\/"/],
    ['image http://', () => withCard({ card_id: 'bear', image: 'http://example.org/bear.png' }), /^cards\[1\]\.image .*not a URL/],
    ['image data:', () => withCard({ card_id: 'bear', image: 'data:image/png;base64,AAAA.png' }), /^cards\[1\]\.image .*not a URL/],
    ['image C:/', () => withCard({ card_id: 'bear', image: 'C:/x.png' }), /^cards\[1\]\.image .*not a URL/],
    ['image bad extension', () => withCard({ card_id: 'bear', image: 'images/bear.gif' }), /^cards\[1\]\.image .*must end in \.png/],
    ['image no extension', () => withCard({ card_id: 'bear', image: 'images/bear' }), /^cards\[1\]\.image .*must end in/],
    ['image backslash', () => withCard({ card_id: 'bear', image: 'images\\bear.png' }), /^cards\[1\]\.image .*must not contain "\\"/],
    ['image %2e%2e', () => withCard({ card_id: 'bear', image: 'images/%2e%2e/%2e%2e/x.png' }), /^cards\[1\]\.image .*"%"/],
    ['image ?query', () => withCard({ card_id: 'bear', image: 'images/bear.png?x=.png' }), /^cards\[1\]\.image/],
    ['image .\\t.', () => withCard({ card_id: 'bear', image: 'images/.\t./x.png' }), /^cards\[1\]\.image/],
    ['image empty segment', () => withCard({ card_id: 'bear', image: 'images//bear.png' }), /^cards\[1\]\.image .*empty path segment/],
    ['image empty', () => withCard({ card_id: 'bear', image: '' }), /^cards\[1\]\.image must not be empty/],
    ['image not a string', () => withCard({ card_id: 'bear', image: 7 }), /^cards\[1\]\.image must be a string/],
    ['card not an object', () => withCard('bear'), /^cards\[1\] must be an object/],
    ['cards not an array', () => ({ ...validDeck(), cards: {} }), /^cards must be an array/],
    ['card_order not an array', () => ({ ...validDeck(), card_order: 'alligator' }), /^card_order must be an array/],
    ['card_order with a number', () => ({ ...validDeck(), card_order: ['alligator', 2] }), /^card_order must be an array/],
  ])('%s', (_label, make, expected) => {
    const problems = problemsOf(make());
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(expected);
  });

  it.each([null, [], 'deck', 1])('rejects a non-object file (%p)', (json) => {
    expect(problemsOf(json)).toEqual(['deck file must be a JSON object']);
  });

  it('lists every violation in one error', () => {
    const deck: Record<string, unknown> = { ...validDeck(), schema_version: 2, deck_id: 'plants' };
    (deck.cards as unknown[]).push(
      { card_id: 'Bear', image: '/x.png' },
      { card_id: 'alligator', image: 'images/a.gif' },
    );
    const problems = problemsOf(deck);
    expect(problems).toHaveLength(6);
    expect(problems.join('\n')).toMatch(/schema_version[\s\S]*deck_id[\s\S]*"Bear"[\s\S]*"\/x\.png"[\s\S]*\.gif[\s\S]*duplicates/);
  });

  it('the bad-schema variant throws', () => {
    expect(problemsOf(readDeck('variants/bad-schema'))).toEqual(['schema_version must be 1 (got 2)']);
  });

  it('a DeckError is an Error with a readable message', () => {
    const error = new DeckError('E2', ['a', 'b']);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DeckError');
    expect(error.message).toBe('[flashcard] E2: a; b');
  });
});

describe('UT-11 validateDeck: card_order runtime issues are not violations (RD-16)', () => {
  it('dup-order (duplicate and unknown order id) passes', () => {
    const json = readDeck('variants/dup-order');
    expect(validateDeck(json, 'animals').card_order).toEqual(['alligator', 'bear', 'bear', 'ghost', 'cat']);
  });

  it('bigdeck-120 (> MAX_CARDS) passes', () => {
    const deck = validateDeck(readDeck('variants/bigdeck-120'), 'animals');
    expect(deck.cards).toHaveLength(120);
    expect(deck.card_order).toHaveLength(120);
  });

  it('an empty deck passes validation (E3 is decided by buildPlayableCards)', () => {
    expect(() => validateDeck({ ...validDeck(), card_order: [], cards: [] }, 'animals')).not.toThrow();
  });

  it('returns only the known fields and copies card_order', () => {
    const json: Record<string, unknown> = { ...validDeck(), extra: true };
    const deck = validateDeck(json, 'animals');
    expect(deck).not.toHaveProperty('extra');
    expect(deck.card_order).not.toBe(json.card_order);
  });
});
