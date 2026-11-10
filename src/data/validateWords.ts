import { DeckError, type WordsCard, type WordsFile } from './types';
import { SCHEMA_VERSION, describeValue, isRecord, relativePathProblem } from './validateDeck';

// FR-08: words file (lang tier) validation, DEVSPEC §I.2.2. File-level violations throw (E2);
// card-level violations drop only that card, with a warning, so one bad entry never blocks the deck.
export const TARGET_WORD_MAX_LENGTH = 64;
const AUDIO_EXTENSION = /\.(mp3|wav)$/i;

export function validateWords(json: unknown, deck: string, lang: string): WordsFile {
  if (!isRecord(json)) throw new DeckError('E2', ['words file must be a JSON object']);
  const problems: string[] = [];

  if (json.schema_version !== SCHEMA_VERSION) {
    problems.push(`schema_version must be ${SCHEMA_VERSION} (got ${describeValue(json.schema_version)})`);
  }
  if (json.deck_id !== deck) problems.push(`deck_id must be "${deck}" (got ${describeValue(json.deck_id)})`);
  if (json.lang !== lang) problems.push(`lang must be "${lang}" (got ${describeValue(json.lang)})`);
  if (!Array.isArray(json.cards)) problems.push('cards must be an array');
  if (problems.length > 0) throw new DeckError('E2', problems);

  const cards: WordsCard[] = [];
  const firstIndexOf = new Map<string, number>();
  (json.cards as unknown[]).forEach((raw, i) => {
    const at = `cards[${i}]`;
    const result = validateCard(raw, lang);
    if (!result.ok) {
      console.warn(`[flashcard] words ${at} dropped: ${result.problems.join('; ')}`);
      return;
    }
    const first = firstIndexOf.get(result.card.card_id);
    if (first !== undefined) {
      console.warn(`[flashcard] words ${at} dropped: card_id "${result.card.card_id}" duplicates cards[${first}]`);
      return;
    }
    firstIndexOf.set(result.card.card_id, i);
    cards.push(result.card);
  });

  return { schema_version: SCHEMA_VERSION, deck_id: deck, lang, cards };
}

type CardResult = { ok: true; card: WordsCard } | { ok: false; problems: string[] };

function validateCard(raw: unknown, lang: string): CardResult {
  if (!isRecord(raw)) return { ok: false, problems: ['must be an object'] };
  const { card_id: cardId, target_word: word, audio } = raw;
  const problems: string[] = [];

  if (typeof cardId !== 'string' || cardId === '') {
    problems.push(`card_id must be a non-empty string (got ${describeValue(cardId)})`);
  }
  const wordProblem = targetWordProblem(word);
  if (wordProblem !== null) problems.push(`target_word ${wordProblem}`);
  const audioProblem = audioPathProblem(audio, lang);
  if (audioProblem !== null) problems.push(`audio ${audioProblem}`);

  if (problems.length > 0) return { ok: false, problems };
  return {
    ok: true,
    card: { card_id: cardId as string, target_word: word as string, audio: (audio as string | null | undefined) ?? null },
  };
}

// Displayed verbatim (never trimmed or HTML-parsed); the trim only decides emptiness.
function targetWordProblem(value: unknown): string | null {
  if (typeof value !== 'string') return `must be a string (got ${describeValue(value)})`;
  if (value.trim() === '') return 'must not be empty';
  if (Array.from(value).length > TARGET_WORD_MAX_LENGTH) {
    return `is longer than ${TARGET_WORD_MAX_LENGTH} characters`;
  }
  return null;
}

// Optional: absent or null means a silent reveal.
function audioPathProblem(value: unknown, lang: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return `must be a string (got ${describeValue(value)})`;
  const pathProblem = relativePathProblem(value);
  if (pathProblem !== null) return pathProblem;
  const folder = `lang/${lang}/audios/`;
  if (!value.startsWith(folder)) return `"${value}" must start with "${folder}"`;
  if (!AUDIO_EXTENSION.test(value)) return `"${value}" must end in .mp3 or .wav`;
  return null;
}
