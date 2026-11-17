// UISPEC §U.2 timing and gesture thresholds, and the §U.8 gesture classification (FR-20, FR-21).
export const FLIP_MS = 400;
export const SLIDE_MS = 300;
export const FLIP_EASING = 'ease-in-out';
export const SLIDE_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';
export const PERSPECTIVE_PX = 1000;

export const TAP_MAX_MOVE_PX = 10;
export const TAP_MAX_MS = 500;
export const SWIPE_MIN_DX_PX = 48;
/** px/ms, averaged over the gesture. */
export const SWIPE_MIN_VX = 0.4;
export const SWIPE_VELOCITY_MIN_DX_PX = 16;
export const RUBBER_BAND = 0.3;

export type GestureKind = 'tap' | 'swipe' | 'cancel';

export interface GestureSample {
  /** End minus start, in CSS px. */
  dx: number;
  dy: number;
  /** Duration in ms. */
  dt: number;
  /** Largest distance from the start during the gesture, in CSS px. */
  maxMove: number;
}

/** UISPEC §U.8, evaluated in order: tap, then swipe, else cancel. */
export function classifyGesture({ dx, dy, dt, maxMove }: GestureSample): GestureKind {
  if (maxMove < TAP_MAX_MOVE_PX && dt < TAP_MAX_MS) return 'tap';
  const adx = Math.abs(dx);
  if (adx > Math.abs(dy)) {
    const fast = adx / Math.max(dt, 1e-3) >= SWIPE_MIN_VX && adx >= SWIPE_VELOCITY_MIN_DX_PX;
    if (adx >= SWIPE_MIN_DX_PX || fast) return 'swipe';
  }
  return 'cancel';
}

/** Swipe direction: `dx < 0` → next card, `dx > 0` → previous card (exactly one card, RD-10). */
export function swipeAction(dx: number): 'NEXT' | 'PREV' {
  return dx < 0 ? 'NEXT' : 'PREV';
}

/** Drag displacement of the card group: 1:1, or `RUBBER_BAND` when no neighbour lies in the drag direction. */
export function dragOffset(dx: number, hasNeighbour: boolean): number {
  return hasNeighbour ? dx : dx * RUBBER_BAND;
}
