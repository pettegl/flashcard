import '@testing-library/jest-dom';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { PlayableCard } from '../../src/data/types';
import { DeckProvider, useDeck } from '../../src/state/DeckContext';

const CARDS: PlayableCard[] = ['alligator', 'bear', 'cat'].map((id, index) => ({
  cardId: id,
  index,
  imageUrl: `./decks/animals/images/${id}.png`,
  word: id,
  audioUrl: null,
}));

// CT-14 / FR-11: React glue for the deck reducer.
describe('CT-14 DeckProvider / useDeck', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <DeckProvider cards={CARDS} index={1}>
      {children}
    </DeckProvider>
  );

  it('seeds the state from cards and index on the front face, and dispatches reducer actions', () => {
    const { result } = renderHook(() => useDeck(), { wrapper });
    expect(result.current.state).toEqual({ cards: CARDS, index: 1, face: 'front' });

    act(() => result.current.dispatch({ type: 'FLIP' }));
    expect(result.current.state).toMatchObject({ index: 1, face: 'back' });

    act(() => result.current.dispatch({ type: 'NEXT' }));
    expect(result.current.state).toMatchObject({ index: 2, face: 'front' });
  });

  it('renders its children', () => {
    render(
      <DeckProvider cards={CARDS} index={0}>
        <p>child</p>
      </DeckProvider>,
    );
    expect(screen.getByText('child')).toBeInTheDocument();
  });

  it('useDeck outside a provider throws', () => {
    // React logs the uncaught render error through console.error; expected on this unhappy path.
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(() => renderHook(() => useDeck())).toThrow('[flashcard] useDeck() called outside <DeckProvider>');
    error.mockRestore();
  });
});
