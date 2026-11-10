import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
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
  children?: ReactNode;
}

/** Holds the FR-11 deck state for the ready UI; `cards`/`index` seed it once, on mount. */
export function DeckProvider({ cards, index, children }: DeckProviderProps) {
  const [state, dispatch] = useReducer(deckReducer, { cards, index }, initDeckState);
  return <DeckContext.Provider value={{ state, dispatch }}>{children}</DeckContext.Provider>;
}

export function useDeck(): DeckContextValue {
  const value = useContext(DeckContext);
  if (value === null) throw new Error('[flashcard] useDeck() called outside <DeckProvider>');
  return value;
}
