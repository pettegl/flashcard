import type { PlayableCard } from '../data/types';

// FR-11: pure deck state. Side effects (audio, storage, telemetry) belong to the handlers, never here.

export type Face = 'front' | 'back';

export interface DeckState {
  cards: readonly PlayableCard[];
  index: number;
  face: Face;
}

export type DeckAction = { type: 'FLIP' } | { type: 'NEXT' } | { type: 'PREV' } | { type: 'GO_TO'; index: number };

/** The supplied card index on its front face (RD-6, RD-9). */
export function initDeckState({ cards, index }: { cards: readonly PlayableCard[]; index: number }): DeckState {
  return { cards, index, face: 'front' };
}

/** Every no-op returns the same state object, so React skips the re-render. */
export function deckReducer(state: DeckState, action: DeckAction): DeckState {
  switch (action.type) {
    case 'FLIP':
      // Better: toggles, without limit (FR-16).
      return { ...state, face: state.face === 'front' ? 'back' : 'front' };
    case 'NEXT':
      return goTo(state, state.index + 1);
    case 'PREV':
      return goTo(state, state.index - 1);
    case 'GO_TO':
      return goTo(state, action.index);
  }
}

// Out of bounds, non-integer or current index → no-op (no wrap, OQ-5); any move resets to front (RD-9).
function goTo(state: DeckState, index: number): DeckState {
  if (!Number.isInteger(index) || index < 0 || index >= state.cards.length || index === state.index) return state;
  return { ...state, index, face: 'front' };
}
