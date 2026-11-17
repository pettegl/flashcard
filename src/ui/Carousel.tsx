import { useEffect, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from 'react';
import type { AudioPlayer } from '../audio/audioPlayer';
import { useDeck } from '../state/DeckContext';
import type { DeckAction } from '../state/deckReducer';
import { Card } from './Card';
import { computeLayout, SLOTS } from './computeLayout';
import { canvasMeasure, type Measure } from './fitText';
import {
  classifyGesture,
  dragOffset,
  FLIP_MS,
  SLIDE_EASING,
  SLIDE_MS,
  swipeAction,
  TAP_MAX_MOVE_PX,
  type GestureKind,
} from './gestures';
import { useViewport } from './useViewport';

let sharedMeasure: Measure | undefined;
const defaultMeasure: Measure = (text, px) => (sharedMeasure ??= canvasMeasure())(text, px);

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';
/** A click this long after a pointer gesture is not that gesture's click (e.g. one from assistive technology). */
const CLICK_AFTER_POINTER_MS = 1000;

interface TrackedPointer {
  id: number;
  x0: number;
  y0: number;
  t0: number;
  maxMove: number;
  /** Slot under the pointerdown target (UISPEC §U.8 tap routing). */
  slot: number | null;
  dragging: boolean;
  /** Started while a slide was running (FR-22). */
  ignored: boolean;
}

interface PointerOutcome {
  kind: GestureKind | 'ignored';
  slot: number | null;
  at: number;
}

export interface CarouselProps {
  audio: AudioPlayer;
  /** Word width measurement; defaults to canvas text metrics. */
  measure?: Measure;
}

/**
 * S-5 carousel (FR-18…FR-22; UISPEC §U.7–U.9, §U.11): the current card with a peek on each side, flip,
 * peek taps and swipes, slide and flip animation, and the input lock.
 */
export function Carousel({ audio, measure = defaultMeasure }: CarouselProps) {
  const { state, dispatch } = useDeck();
  const viewport = useViewport();
  const layout = useMemo(() => computeLayout(viewport.width, viewport.height), [viewport.width, viewport.height]);
  const reducedMotion = useReducedMotion();
  const flipMs = reducedMotion ? 0 : FLIP_MS;
  const slideMs = reducedMotion ? 0 : SLIDE_MS;
  const { cards, index, face } = state;
  const card = cards[index];

  // A resize or rotation re-lays out the cards without animation (UISPEC §U.7); the next navigation slides again.
  const [placed, setPlaced] = useState({ layout, index: state.index });
  const [resized, setResized] = useState(false);
  if (layout !== placed.layout || state.index !== placed.index) {
    setPlaced({ layout, index: state.index });
    setResized(layout !== placed.layout);
  }

  // FR-22 input lock: a timer per lock; reduced motion never sets one.
  const slideTimer = useRef<ReturnType<typeof setTimeout>>();
  const flipTimer = useRef<ReturnType<typeof setTimeout>>();
  const sliding = () => slideTimer.current !== undefined;
  const flipping = () => flipTimer.current !== undefined;
  useEffect(
    () => () => {
      clearTimeout(slideTimer.current);
      clearTimeout(flipTimer.current);
    },
    [],
  );
  const hold = (timer: typeof slideTimer, ms: number) => {
    clearTimeout(timer.current);
    timer.current = ms > 0 ? setTimeout(() => (timer.current = undefined), ms) : undefined;
  };

  const trackRef = useRef<HTMLDivElement>(null);
  const moveTrack = (offset: number, animate: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate && slideMs > 0 ? `transform ${slideMs}ms ${SLIDE_EASING}` : 'none';
    track.style.transform = `translateX(${offset}px)`;
  };

  // FR-15/FR-16 with the FR-22 lock: the reveal and its audio start in the same gesture (FR-13).
  const flip = () => {
    if (sliding() || flipping()) return;
    dispatch({ type: 'FLIP' });
    if (face === 'front') audio.play(card.cardId);
    else audio.stop();
    hold(flipTimer, flipMs);
  };

  // FR-19/FR-20: one card per input; the leaving card is reset to front instantly (RD-9, FR-22).
  const navigate = (action: DeckAction, target: number): boolean => {
    if (sliding() || target < 0 || target >= cards.length || target === index) return false;
    dispatch(action);
    audio.stop();
    hold(flipTimer, 0);
    hold(slideTimer, slideMs);
    return true;
  };

  const tap = (slot: number | null) => {
    if (slot === 0) flip();
    else if (slot === -1 || slot === 1) navigate({ type: 'GO_TO', index: index + slot }, index + slot);
  };

  const hasNeighbour = (dx: number) => (dx < 0 ? index < cards.length - 1 : index > 0);

  const pointer = useRef<TrackedPointer | null>(null);
  const lastOutcome = useRef<PointerOutcome | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (pointer.current !== null) return; // only the first active pointer is tracked
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    lastOutcome.current = null;
    pointer.current = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      t0: event.timeStamp,
      maxMove: 0,
      slot: slotOf(event.target),
      dragging: false,
      ignored: sliding(),
    };
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // A pointer that is already gone cannot be captured; its pointerup or pointercancel still arrives.
    }
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    if (p === null || p.id !== event.pointerId || p.ignored) return;
    const dx = event.clientX - p.x0;
    p.maxMove = Math.max(p.maxMove, Math.hypot(dx, event.clientY - p.y0));
    if (p.maxMove > TAP_MAX_MOVE_PX) p.dragging = true;
    if (p.dragging) moveTrack(dragOffset(dx, hasNeighbour(dx)), false);
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    if (p === null || p.id !== event.pointerId) return;
    pointer.current = null;
    const at = event.timeStamp;
    if (p.ignored) {
      lastOutcome.current = { kind: 'ignored', slot: null, at };
      return;
    }
    const dx = event.clientX - p.x0;
    const dy = event.clientY - p.y0;
    const kind = classifyGesture({ dx, dy, dt: at - p.t0, maxMove: Math.max(p.maxMove, Math.hypot(dx, dy)) });
    lastOutcome.current = { kind, slot: p.slot, at };
    if (kind === 'swipe') {
      const action = swipeAction(dx);
      navigate({ type: action }, index + (action === 'NEXT' ? 1 : -1));
    }
    // Slide to the new card, or snap back after a cancel or a swipe with no neighbour.
    if (p.dragging || kind === 'swipe') moveTrack(0, true);
  };

  const onPointerCancel = (event: PointerEvent<HTMLDivElement>) => {
    const p = pointer.current;
    if (p === null || p.id !== event.pointerId) return;
    pointer.current = null;
    lastOutcome.current = { kind: 'cancel', slot: null, at: event.timeStamp };
    if (p.dragging) moveTrack(0, true);
  };

  // Taps run on the click that follows a classified tap; a click with no pointer gesture before it
  // (keyboard-less assistive technology, synthetic clicks) is routed by its own target.
  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const outcome = lastOutcome.current;
    lastOutcome.current = null;
    if (outcome !== null && event.timeStamp - outcome.at < CLICK_AFTER_POINTER_MS) {
      if (outcome.kind === 'tap') tap(outcome.slot);
      return;
    }
    tap(slotOf(event.target));
  };

  const visible = SLOTS.map((slot) => ({ slot, i: index + slot })).filter(({ i }) => i >= 0 && i < cards.length);

  return (
    <>
      <div
        className="carousel"
        data-testid="carousel"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={onClick}
      >
        <div className="carousel-track" ref={trackRef}>
          {visible.map(({ slot, i }) => (
            <Card
              key={cards[i].cardId}
              card={cards[i]}
              slot={slot}
              face={slot === 0 ? face : 'front'}
              position={i + 1}
              total={cards.length}
              layout={layout}
              measure={measure}
              flipMs={slot === 0 ? flipMs : 0}
              slideMs={resized ? 0 : slideMs}
              onActivate={flip}
            />
          ))}
        </div>
      </div>
      <div className="visually-hidden" data-testid="live-region" aria-live="polite">
        {face === 'back' ? card.word : ''}
      </div>
    </>
  );
}

function slotOf(target: EventTarget | null): number | null {
  const el = target instanceof Element ? target.closest('[data-slot]') : null;
  return el === null ? null : Number(el.getAttribute('data-slot'));
}

/** `prefers-reduced-motion: reduce`, live (UISPEC §U.9). False where `matchMedia` is missing. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia(REDUCED_MOTION);
    const update = () => setReduced(query.matches);
    update();
    // iOS Safari 13 has only the older addListener/removeListener.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);
  return reduced;
}
