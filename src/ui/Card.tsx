import { useMemo, useState, type KeyboardEvent } from 'react';
import type { AudioPlayer } from '../audio/audioPlayer';
import type { PlayableCard } from '../data/types';
import { useDeck } from '../state/DeckContext';
import type { Face } from '../state/deckReducer';
import { cardSize, type CardSize } from './computeLayout';
import { canvasMeasure, fitText, WORD_FIT_FRAC, type Measure } from './fitText';
import { strings } from './strings';
import { useViewport } from './useViewport';

let sharedMeasure: Measure | undefined;
const defaultMeasure: Measure = (text, px) => (sharedMeasure ??= canvasMeasure())(text, px);

export interface CurrentCardProps {
  audio: AudioPlayer;
  /** Word width measurement; defaults to canvas text metrics. */
  measure?: Measure;
}

/** The current card wired to the deck state and the audio player (FR-14, FR-15; UISPEC §U.5, §U.11). */
export function CurrentCard({ audio, measure = defaultMeasure }: CurrentCardProps) {
  const { state, dispatch } = useDeck();
  const viewport = useViewport();
  const card = state.cards[state.index];

  // FR-15: the flip and the audio start in the same gesture (FR-13). MVP: the back face is inert (FR-16 at Better).
  const activate = () => {
    if (state.face !== 'front') return;
    dispatch({ type: 'FLIP' });
    audio.play(card.cardId);
  };

  return (
    <>
      <Card
        key={card.cardId}
        card={card}
        face={state.face}
        position={state.index + 1}
        total={state.cards.length}
        size={cardSize(viewport.width, viewport.height)}
        measure={measure}
        onActivate={activate}
      />
      <div className="visually-hidden" data-testid="live-region" aria-live="polite">
        {state.face === 'back' ? card.word : ''}
      </div>
    </>
  );
}

export interface CardProps {
  card: PlayableCard;
  face: Face;
  /** 1-based position in the deck. */
  position: number;
  total: number;
  size: CardSize;
  measure: Measure;
  onActivate: () => void;
}

/** A bordered `Wc × Hc` card: front = image, back = word only (UISPEC §U.5). */
export function Card({ card, face, position, total, size, measure, onActivate }: CardProps) {
  const label = face === 'front' ? strings.cardFront(position, total) : strings.cardBack(card.word, position, total);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat) onActivate();
  };

  return (
    <div
      className="card"
      role="button"
      tabIndex={0}
      aria-label={label}
      data-testid="card-current"
      data-card-id={card.cardId}
      // React applies `style` through CSSOM (element.style), which a strict CSP allows (DEVSPEC §II.5).
      style={{ width: size.width, height: size.height }}
      onClick={onActivate}
      onKeyDown={onKeyDown}
    >
      <div className="card-inner">
        {face === 'front' ? (
          <FrontFace imageUrl={card.imageUrl} />
        ) : (
          <BackFace word={card.word} size={size} measure={measure} />
        )}
      </div>
    </div>
  );
}

function FrontFace({ imageUrl }: { imageUrl: string }) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="card-face face-front" data-testid="face-front">
      {failed ? (
        <ImagePlaceholder />
      ) : (
        <img className="card-image" src={imageUrl} alt="" draggable={false} onError={() => setFailed(true)} />
      )}
    </div>
  );
}

function BackFace({ word, size, measure }: { word: string; size: CardSize; measure: Measure }) {
  const { fontPx } = useMemo(
    () => fitText(word, size.width, size.height, measure),
    [word, size.width, size.height, measure],
  );
  // The word is a text node (never HTML, NFR-06). It wraps only when it cannot fit at WORD_MIN_PX.
  return (
    <div className="card-face face-back" data-testid="face-back">
      <p className="card-word" style={{ fontSize: fontPx, maxWidth: WORD_FIT_FRAC * size.width }}>
        {word}
      </p>
    </div>
  );
}

function ImagePlaceholder() {
  return (
    <div className="card-placeholder" data-testid="image-placeholder">
      <svg className="card-placeholder__icon" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="2" />
        <circle cx="9" cy="10" r="1.5" fill="currentColor" />
        <path d="M4 18l5-5 3 3 3-4 5 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
