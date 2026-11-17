// UISPEC §U.2 geometry and the §U.7 carousel layout (FR-14, FR-18). Pure, so it is unit-tested with vectors.
export const CENTER_VW_FRAC = 0.78;
export const CENTER_VH_FRAC = 0.7;
export const CENTER_MAX_PX = 720;
export const SIDE_SCALE = 0.8;
export const SIDE_OPACITY = 0.6;
export const SIDE_GAP_PX = 12;
export const MIN_SLIVER_PX = 24;

export interface CardSize {
  width: number;
  height: number;
}

// Absorbs float error such as 0.7 × 360 × 4/3 = 335.99999999999994, which must floor to 336.
const floorPx = (value: number) => Math.floor(value + 1e-6);

/** `Wc = floor(min(0.78·vw, 0.7·vh·4/3, 720))`, `Hc = floor(Wc·3/4)` (4:3 card, computed in JS — NFR-07). */
export function cardSize(viewportWidth: number, viewportHeight: number): CardSize {
  const width = floorPx(
    Math.max(0, Math.min(CENTER_VW_FRAC * viewportWidth, (CENTER_VH_FRAC * viewportHeight * 4) / 3, CENTER_MAX_PX)),
  );
  return { width, height: floorPx((width * 3) / 4) };
}

/** `0` current, `±1` peeks, `±2` off-screen staging slots. */
export type Slot = -2 | -1 | 0 | 1 | 2;
export const SLOTS: readonly Slot[] = [-2, -1, 0, 1, 2];

export interface CarouselLayout {
  /** Wc × Hc. */
  card: CardSize;
  /** Ws × Hs = floor(Wc·SIDE_SCALE) × floor(Hc·SIDE_SCALE). */
  side: CardSize;
  /** Center x of each slot. */
  slotX: Record<Slot, number>;
  /** Center y of every card. */
  centerY: number;
  /** Visible width of each peek: vw − (cx0 + Wc/2 + SIDE_GAP_PX). */
  sliver: number;
}

/** UISPEC §U.7 normative geometry. */
export function computeLayout(viewportWidth: number, viewportHeight: number): CarouselLayout {
  const card = cardSize(viewportWidth, viewportHeight);
  const side = { width: floorPx(card.width * SIDE_SCALE), height: floorPx(card.height * SIDE_SCALE) };
  const cx0 = viewportWidth / 2;
  const step1 = card.width / 2 + SIDE_GAP_PX + side.width / 2;
  const step2 = side.width + SIDE_GAP_PX;
  return {
    card,
    side,
    slotX: {
      [-2]: cx0 - step1 - step2,
      [-1]: cx0 - step1,
      0: cx0,
      1: cx0 + step1,
      2: cx0 + step1 + step2,
    },
    centerY: viewportHeight / 2,
    sliver: viewportWidth - (cx0 + card.width / 2 + SIDE_GAP_PX),
  };
}
