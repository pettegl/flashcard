import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { DeckError } from '../../src/data/types';
import { validateWords } from '../../src/data/validateWords';

const FIXTURES = resolve(__dirname, '../../fixtures');
const readWords = (tree: string, lang = 'english'): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FIXTURES, tree, `lang/${lang}/animals.json`), 'utf8'));
const validWords = () => readWords('content');

let warn: jest.SpyInstance;
beforeEach(() => {
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => warn.mockRestore());

function problemsOf(json: unknown, deck = 'animals', lang = 'english'): readonly string[] {
  try {
    validateWords(json, deck, lang);
  } catch (error) {
    expect(error).toBeInstanceOf(DeckError);
    expect((error as DeckError).code).toBe('E2');
    return (error as DeckError).problems;
  }
  throw new Error('expected validateWords to throw a DeckError');
}

function withCard(card: unknown): Record<string, unknown> {
  const words = validWords();
  (words.cards as unknown[])[1] = card;
  return words;
}

const bear = (overrides: Record<string, unknown>) => ({
  card_id: 'bear',
  target_word: 'Bear',
  audio: 'lang/english/audios/animals_bear.mp3',
  ...overrides,
});

describe('UT-12 validateWords: valid files', () => {
  it.each([
    ['english', ['Alligator', 'Bear', 'Cat', 'Dog', 'Elephant']],
    ['spanish', ['Caimán', 'Oso', 'Gato', 'Perro', 'Elefante']],
  ])('%s fixture passes with every card', (lang, words) => {
    const json = readWords('content', lang);
    const result = validateWords(json, 'animals', lang);
    expect(result).toEqual(json);
    expect(result.cards.map((c) => c.target_word)).toEqual(words);
    expect(warn).not.toHaveBeenCalled();
  });

  it('treats absent or null audio as no audio', () => {
    const json = validWords();
    const cards = json.cards as Record<string, unknown>[];
    delete cards[0].audio;
    cards[1].audio = null;
    const result = validateWords(json, 'animals', 'english');
    expect(result.cards.slice(0, 2).map((c) => c.audio)).toEqual([null, null]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('keeps target_word verbatim: case, padding, diacritics and HTML-like text', () => {
    const word = '  <b>Dog</b><img src=x onerror=alert(1)> ';
    expect(validateWords(withCard(bear({ target_word: word })), 'animals', 'english').cards[1].target_word).toBe(word);
    const html = validateWords(readWords('variants/html-word'), 'animals', 'english');
    expect(html.cards[3].target_word).toBe('<b>Dog</b><img src=x onerror=alert(1)>');
  });

  it('accepts a 64-character target_word, counted in characters not UTF-16 units', () => {
    expect(validateWords(withCard(bear({ target_word: 'w'.repeat(64) })), 'animals', 'english').cards).toHaveLength(5);
    expect(validateWords(withCard(bear({ target_word: '🐻'.repeat(64) })), 'animals', 'english').cards).toHaveLength(5);
  });

  it('accepts .wav and .mp3 in any case, and the no-playable variant (zebra only)', () => {
    expect(validateWords(withCard(bear({ audio: 'lang/english/audios/x/animals_bear.MP3' })), 'animals', 'english').cards).toHaveLength(5);
    expect(validateWords(readWords('variants/no-playable'), 'animals', 'english').cards.map((c) => c.card_id)).toEqual(['zebra']);
  });

  it('returns only the known fields', () => {
    const json = { ...withCard({ ...bear({}), extra: 1 }), extra: true };
    const result = validateWords(json, 'animals', 'english');
    expect(result).not.toHaveProperty('extra');
    expect(result.cards[1]).toEqual(bear({}));
  });
});

describe('UT-12 validateWords: file-level violations throw DeckError (E2)', () => {
  it.each<[string, () => unknown, string]>([
    ['schema_version 2', () => ({ ...validWords(), schema_version: 2 }), 'schema_version must be 1 (got 2)'],
    ['deck_id mismatch', () => ({ ...validWords(), deck_id: 'plants' }), 'deck_id must be "animals" (got "plants")'],
    ['lang mismatch', () => ({ ...validWords(), lang: 'spanish' }), 'lang must be "english" (got "spanish")'],
    ['lang missing', () => ({ ...validWords(), lang: undefined }), 'lang must be "english" (got undefined)'],
    ['cards not an array', () => ({ ...validWords(), cards: null }), 'cards must be an array'],
  ])('%s', (_label, make, expected) => {
    expect(problemsOf(make())).toEqual([expected]);
  });

  it.each([null, [], 'words'])('rejects a non-object file (%p)', (json) => {
    expect(problemsOf(json)).toEqual(['words file must be a JSON object']);
  });

  it('lists every file-level violation in one error', () => {
    expect(problemsOf({ schema_version: 2, deck_id: 'x', lang: 'y', cards: 1 })).toHaveLength(4);
  });
});

describe('UT-12 validateWords: card-level violations drop only that card', () => {
  it.each<[string, unknown, RegExp]>([
    ['empty target_word', bear({ target_word: '' }), /target_word must not be empty/],
    ['blank target_word', bear({ target_word: ' \t ' }), /target_word must not be empty/],
    ['65-char target_word', bear({ target_word: 'w'.repeat(65) }), /target_word is longer than 64/],
    ['missing target_word', bear({ target_word: undefined }), /target_word must be a string/],
    ['numeric target_word', bear({ target_word: 7 }), /target_word must be a string/],
    ['audio of another lang', bear({ audio: 'lang/spanish/audios/animals_bear.mp3' }), /must start with "lang\/english\/audios\/"/],
    ['audio outside audios/', bear({ audio: 'audios/animals_bear.mp3' }), /must start with "lang\/english\/audios\/"/],
    ['audio is a URL', bear({ audio: 'https://example.org/lang/english/audios/animals_bear.mp3' }), /not a URL/],
    ['audio leaves its folder', bear({ audio: 'lang/english/audios/../../../x.mp3' }), /must not contain "\.\."/],
    ['audio absolute', bear({ audio: '/lang/english/audios/animals_bear.mp3' }), /must not start with "\/"/],
    ['audio bad extension', bear({ audio: 'lang/english/audios/animals_bear.ogg' }), /must end in \.mp3 or \.wav/],
    ['audio not a string', bear({ audio: 3 }), /audio must be a string/],
    ['card_id missing', bear({ card_id: undefined }), /card_id must be a non-empty string/],
    ['card_id empty', bear({ card_id: '' }), /card_id must be a non-empty string/],
    ['card not an object', 'bear', /must be an object/],
  ])('%s', (_label, card, expected) => {
    const result = validateWords(withCard(card), 'animals', 'english');
    expect(result.cards.map((c) => c.card_id)).toEqual(['alligator', 'cat', 'dog', 'elephant']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[flashcard\] words cards\[1\] dropped: /);
    expect(warn.mock.calls[0][0]).toMatch(expected);
  });

  it('a later duplicate card_id is dropped and the first kept', () => {
    const json = validWords();
    (json.cards as unknown[]).push(bear({ target_word: 'Second bear' }));
    const result = validateWords(json, 'animals', 'english');
    expect(result.cards.filter((c) => c.card_id === 'bear').map((c) => c.target_word)).toEqual(['Bear']);
    expect(warn).toHaveBeenCalledWith('[flashcard] words cards[5] dropped: card_id "bear" duplicates cards[1]');
  });

  it('an invalid first entry does not count as the original of a later duplicate', () => {
    const json = validWords();
    (json.cards as unknown[])[1] = bear({ target_word: '' });
    (json.cards as unknown[]).push(bear({ target_word: 'Bear 2' }));
    const result = validateWords(json, 'animals', 'english');
    expect(result.cards.find((c) => c.card_id === 'bear')?.target_word).toBe('Bear 2');
  });

  it('reports every problem of a dropped card in its one warning', () => {
    validateWords(withCard({ card_id: 'bear', target_word: '', audio: 'x.ogg' }), 'animals', 'english');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/target_word must not be empty; audio "x\.ogg" must start with/);
  });
});
