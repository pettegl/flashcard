import { createContext, useContext, useEffect, useReducer, useRef, type Dispatch, type ReactNode } from 'react';
import type { PlayableCard } from '../data/types';
import { deckReducer, initDeckState, type DeckAction, type DeckState } from './deckReducer';

export interface DeckContextValue {
  state: DeckState;
  dispatch: Dispatch<DeckAction>;
}

const DeckContext = createContext<DeckContextValue | null>(null);

export interface DeckProviderProps {
  cards: readonly PlayableCard[];
  index: number;
  /** Called after each change of the current card (not for the seed): the hook for progress saving (FR-12). */
  onIndexChange?: (card: PlayableCard) => void;
  children?: ReactNode;
}

/** Holds the FR-11 deck state for the ready UI; `cards`/`index` seed it once, on mount. */
export function DeckProvider({ cards, index, onIndexChange, children }: DeckProviderProps) {
  const [state, dispatch] = useReducer(deckReducer, { cards, index }, initDeckState);

  // Side effects stay out of the reducer: this runs after the new index is committed.
  const reported = useRef(state.index);
  useEffect(() => {
    if (state.index === reported.current) return;
    reported.current = state.index;
    onIndexChange?.(state.cards[state.index]);
  }, [state.index, state.cards, onIndexChange]);

  return <DeckContext.Provider value={{ state, dispatch }}>{children}</DeckContext.Provider>;
}

export function useDeck(): DeckContextValue {
  const value = useContext(DeckContext);
  if (value === null) throw new Error('[flashcard] useDeck() called outside <DeckProvider>');
  return value;
}
