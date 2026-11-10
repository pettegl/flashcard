// UISPEC §U.2 geometry and §U.7 card size. The MVP/Better single card uses Wc × Hc; the Great
// carousel slots (FR-18) extend this module.
export const CENTER_VW_FRAC = 0.78;
export const CENTER_VH_FRAC = 0.7;
export const CENTER_MAX_PX = 720;

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
