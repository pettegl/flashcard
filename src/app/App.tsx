import { useEffect, useState } from 'react';
import type { PlayableCard } from '../data/types';
import { ErrorScreen, type ErrorCode } from '../ui/ErrorScreen';
import { LoadingScreen } from '../ui/LoadingScreen';
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
      return <CurrentCardStandIn card={state.deck.cards[state.deck.index]} />;
  }
}

// Minimal ready UI (front face of the current card) until the Card component lands in Module 7 (FR-14).
function CurrentCardStandIn({ card }: { card: PlayableCard }) {
  return (
    <main className="screen">
      <div className="card-standin" data-testid="card-current" data-card-id={card.cardId}>
        <div className="card-standin__face" data-testid="face-front">
          <img className="card-standin__image" src={card.imageUrl} alt="" draggable={false} />
        </div>
      </div>
    </main>
  );
}
