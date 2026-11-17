import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { PlayableCard } from '../data/types';
import type { Face } from '../state/deckReducer';
import { SIDE_OPACITY, SIDE_SCALE, type CarouselLayout, type CardSize, type Slot } from './computeLayout';
import { fitText, WORD_FIT_FRAC, type Measure } from './fitText';
import { FLIP_EASING, PERSPECTIVE_PX, SLIDE_EASING } from './gestures';
import { strings } from './strings';

const TEST_IDS: Record<Slot, string> = {
  [-2]: 'card-staging',
  [-1]: 'card-peek-prev',
  0: 'card-current',
  1: 'card-peek-next',
  2: 'card-staging',
};

export interface CardProps {
  card: PlayableCard;
  /** Carousel slot (UISPEC §U.7): 0 is the current card. */
  slot: Slot;
  /** The current card's face; any other slot shows its front (UISPEC §U.5). */
  face: Face;
  /** 1-based position in the deck. */
  position: number;
  total: number;
  layout: CarouselLayout;
  measure: Measure;
  /** Flip duration; 0 flips instantly (reduced motion, or a card that is not current). */
  flipMs: number;
  /** Slide duration; 0 moves instantly (reduced motion, or a resize). */
  slideMs: number;
  /** Enter/Space on the current card. */
  onActivate: () => void;
}

/**
 * A bordered `Wc × Hc` card in a carousel slot: `.card` > `.card-inner` (rotates, FR-21) > faces
 * (UISPEC §U.5, §U.9). Outside a flip only the active face is rendered; during a flip the face being
 * left stays rendered, `aria-hidden`, until the rotation ends (UISPEC §U.10).
 */
export function Card({ card, slot, face, position, total, layout, measure, flipMs, slideMs, onActivate }: CardProps) {
  const current = slot === 0;
  const active: Face = current ? face : 'front';
  const size = layout.card;

  // Derived from props during render, so the face being left never unmounts mid-flip.
  const [shown, setShown] = useState(active);
  const [leaving, setLeaving] = useState<Face | null>(null);
  if (active !== shown) {
    setShown(active);
    setLeaving(flipMs > 0 ? shown : null);
  }
  useEffect(() => {
    if (leaving === null) return;
    const timer = setTimeout(() => setLeaving(null), flipMs);
    return () => clearTimeout(timer);
  }, [leaving, flipMs]);

  // Kept here, not in the front face, so the placeholder survives the face unmounting during a flip.
  const [imageFailed, setImageFailed] = useState(false);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat) onActivate();
  };

  const scale = current ? 1 : SIDE_SCALE;
  const x = layout.slotX[slot] - size.width / 2;
  const y = layout.centerY - size.height / 2;
  const slide = slideMs > 0 ? `transform ${slideMs}ms ${SLIDE_EASING}, opacity ${slideMs}ms ${SLIDE_EASING}` : 'none';

  return (
    <div
      className={current ? 'card card--current' : 'card'}
      data-testid={TEST_IDS[slot]}
      data-card-id={card.cardId}
      data-slot={slot}
      {...(current
        ? {
            role: 'button',
            tabIndex: 0,
            'aria-label': active === 'front' ? strings.cardFront(position, total) : strings.cardBack(card.word, position, total),
            onKeyDown,
          }
        : Math.abs(slot) === 2
          ? { 'aria-hidden': true }
          : {})}
      // React applies `style` through CSSOM (element.style), which a strict CSP allows (DEVSPEC §II.5).
      style={{
        width: size.width,
        height: size.height,
        transform: `translate(${x}px, ${y}px) scale(${scale})`,
        opacity: current ? 1 : SIDE_OPACITY,
        zIndex: 3 - Math.abs(slot),
        perspective: PERSPECTIVE_PX,
        transition: slide,
      }}
    >
      <div
        className="card-inner"
        style={{
          transform: active === 'back' ? 'rotateY(180deg)' : 'rotateY(0deg)',
          transition: flipMs > 0 ? `transform ${flipMs}ms ${FLIP_EASING}` : 'none',
        }}
      >
        {(active === 'front' || leaving === 'front') && (
          <FrontFace
            imageUrl={card.imageUrl}
            failed={imageFailed}
            hidden={active !== 'front'}
            onError={() => setImageFailed(true)}
          />
        )}
        {(active === 'back' || leaving === 'back') && (
          <BackFace word={card.word} size={size} measure={measure} hidden={active !== 'back'} />
        )}
      </div>
    </div>
  );
}

interface FrontFaceProps {
  imageUrl: string;
  failed: boolean;
  hidden: boolean;
  onError: () => void;
}

function FrontFace({ imageUrl, failed, hidden, onError }: FrontFaceProps) {
  return (
    <div className="card-face face-front" data-testid="face-front" aria-hidden={hidden || undefined}>
      {failed ? (
        <ImagePlaceholder />
      ) : (
        <img className="card-image" src={imageUrl} alt="" draggable={false} onError={onError} />
      )}
    </div>
  );
}

function BackFace({ word, size, measure, hidden }: { word: string; size: CardSize; measure: Measure; hidden: boolean }) {
  const { fontPx } = useMemo(
    () => fitText(word, size.width, size.height, measure),
    [word, size.width, size.height, measure],
  );
  // The word is a text node (never HTML, NFR-06). It wraps only when it cannot fit at WORD_MIN_PX.
  return (
    <div className="card-face face-back" data-testid="face-back" aria-hidden={hidden || undefined}>
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
