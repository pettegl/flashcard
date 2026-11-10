import { DeckError, type DeckCard, type DeckFile } from './types';

// FR-07: deck file (core tier) validation, DEVSPEC §I.2.1. Every violation is collected, then thrown once.
export const SCHEMA_VERSION = 1;
export const CARD_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const CARD_ID_MAX_LENGTH = 64;
const IMAGE_EXTENSION = /\.(png|jpe?g|webp|svg)$/i;
const URL_SCHEME = /^[a-z][a-z0-9+.-]*:/i;
// The URL parser treats "\" as "/", decodes "%2e" to ".", strips tab/CR/LF, and gives "?"/"#" meaning,
// so any of them could turn a harmless-looking path into another file.
const UNSAFE_PATH_CHARS = /[\\%?#\t\n\r]/;

export function validateDeck(json: unknown, deck: string): DeckFile {
  if (!isRecord(json)) throw new DeckError('E2', ['deck file must be a JSON object']);
  const problems: string[] = [];

  if (json.schema_version !== SCHEMA_VERSION) {
    problems.push(`schema_version must be ${SCHEMA_VERSION} (got ${describeValue(json.schema_version)})`);
  }
  if (json.deck_id !== deck) problems.push(`deck_id must be "${deck}" (got ${describeValue(json.deck_id)})`);

  const cardOrder = json.card_order;
  const orderIsValid = Array.isArray(cardOrder) && cardOrder.every((id) => typeof id === 'string');
  if (!orderIsValid) problems.push('card_order must be an array of card_id strings');

  const cards: DeckCard[] = [];
  if (!Array.isArray(json.cards)) {
    problems.push('cards must be an array');
  } else {
    const firstIndexOf = new Map<string, number>();
    json.cards.forEach((card: unknown, i) => {
      const at = `cards[${i}]`;
      if (!isRecord(card)) {
        problems.push(`${at} must be an object`);
        return;
      }
      const { card_id: cardId, image } = card;
      const idProblem = cardIdProblem(cardId);
      const imageProblem = imagePathProblem(image);
      if (idProblem !== null) problems.push(`${at}.card_id ${idProblem}`);
      if (imageProblem !== null) problems.push(`${at}.image ${imageProblem}`);
      if (typeof cardId !== 'string' || idProblem !== null) return;

      const first = firstIndexOf.get(cardId);
      if (first !== undefined) {
        problems.push(`${at}.card_id "${cardId}" duplicates cards[${first}]`);
        return;
      }
      firstIndexOf.set(cardId, i);
      if (typeof image === 'string' && imageProblem === null) cards.push({ card_id: cardId, image });
    });
  }

  if (problems.length > 0) throw new DeckError('E2', problems);
  return { schema_version: SCHEMA_VERSION, deck_id: deck, card_order: [...(cardOrder as string[])], cards };
}

function cardIdProblem(value: unknown): string | null {
  if (typeof value !== 'string') return `must be a string (got ${describeValue(value)})`;
  if (value.length > CARD_ID_MAX_LENGTH) return `"${value}" is longer than ${CARD_ID_MAX_LENGTH} characters`;
  if (!CARD_ID_PATTERN.test(value)) return `"${value}" must match ${CARD_ID_PATTERN.source}`;
  return null;
}

function imagePathProblem(value: unknown): string | null {
  if (typeof value !== 'string') return `must be a string (got ${describeValue(value)})`;
  const pathProblem = relativePathProblem(value);
  if (pathProblem !== null) return pathProblem;
  if (!IMAGE_EXTENSION.test(value)) return `"${value}" must end in .png, .jpg, .jpeg, .webp or .svg`;
  return null;
}

/** Rules shared by deck image and words audio paths: relative, inside its folder, no URL. */
export function relativePathProblem(path: string): string | null {
  if (path === '') return 'must not be empty';
  if (URL_SCHEME.test(path)) return `"${path}" must be a relative path, not a URL`;
  if (path.startsWith('/')) return `"${path}" must not start with "/"`;
  if (path.includes('..')) return `"${path}" must not contain ".."`;
  if (UNSAFE_PATH_CHARS.test(path)) return `"${path}" must not contain "\\", "%", "?", "#" or line breaks`;
  if (path.split('/').includes('')) return `"${path}" must not contain an empty path segment`;
  return null;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function describeValue(value: unknown): string {
  const text = value === undefined ? 'undefined' : JSON.stringify(value);
  return text.length > 40 ? `${text.slice(0, 37)}...` : text;
}
