import { useCallback, useEffect, useMemo, useState } from 'react';
import { createAudioPlayer } from '../audio/audioPlayer';
import type { PlayableCard } from '../data/types';
import { DeckProvider } from '../state/DeckContext';
import { saveProgress } from '../storage/progress';
import { CurrentCard } from '../ui/Card';
import { ErrorScreen, type ErrorCode } from '../ui/ErrorScreen';
import { LoadingScreen } from '../ui/LoadingScreen';
import { NavArrows } from '../ui/NavArrows';
import { boot, type ReadyDeck } from './boot';
import { ErrorBoundary } from './ErrorBoundary';

type AppState = { status: 'loading' } | { status: 'error'; code: ErrorCode } | { status: 'ready'; deck: ReadyDeck };

export interface AppProps {
  /** Launch query string; defaults to the page URL (CR§1). */
  search?: string;
}

export function App(props: AppProps) {
  return (
    <ErrorBoundary>
      <Game {...props} />
    </ErrorBoundary>
  );
}

// FR-10: S-1 until boot settles, then the ready UI or S-2.
function Game({ search = window.location.search }: AppProps) {
  const [state, setState] = useState<AppState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    boot(search).then(
      (result) => {
        if (active) setState(result.ok ? { status: 'ready', deck: result.deck } : { status: 'error', code: result.code });
      },
      (error: unknown) => {
        console.warn('[flashcard] E9: unexpected boot failure', error);
        if (active) setState({ status: 'error', code: 'E9' });
      },
    );
    return () => {
      active = false;
    };
  }, [search]);

  switch (state.status) {
    case 'loading':
      return <LoadingScreen />;
    case 'error':
      return <ErrorScreen code={state.code} />;
    case 'ready':
      return <ReadyScreen deck={state.deck} />;
  }
}

// S-4: the current card (FR-14…FR-16) with arrows below it (FR-17), resumed from and saved to progress (FR-12).
function ReadyScreen({ deck }: { deck: ReadyDeck }) {
  const audio = useMemo(() => createAudioPlayer(deck.cards, deck.preloaded), [deck]);
  useEffect(() => () => audio.stop(), [audio]);
  const save = useCallback((card: PlayableCard) => saveProgress(deck.params, card.cardId), [deck.params]);

  return (
    <DeckProvider cards={deck.cards} index={deck.index} onIndexChange={save}>
      <main className="screen screen--ready">
        <CurrentCard audio={audio} />
        <NavArrows audio={audio} />
      </main>
    </DeckProvider>
  );
}
