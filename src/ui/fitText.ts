// FR-14 word fitting (UISPEC §U.2 constants, §U.5 rule).
export const WORD_FIT_FRAC = 0.84;
export const WORD_START_FRAC = 0.22;
export const WORD_MIN_PX = 18;
const STEP_PX = 2;

/** Single-line width in CSS px of `text` set in the word font at `px`. */
export type Measure = (text: string, px: number) => number;

export interface FitResult {
  fontPx: number;
  /** The word does not fit on one line even at `WORD_MIN_PX`; let it wrap. */
  wrap: boolean;
}

/**
 * Starts at `WORD_START_FRAC × cardHeight` and shrinks in 2 px steps until the word fits within
 * `WORD_FIT_FRAC × cardWidth`, never below `WORD_MIN_PX`; below that it signals a wrap.
 */
export function fitText(text: string, cardWidth: number, cardHeight: number, measure: Measure): FitResult {
  const maxWidth = WORD_FIT_FRAC * cardWidth;
  let fontPx = Math.max(WORD_MIN_PX, Math.floor(WORD_START_FRAC * cardHeight));
  let fits = measure(text, fontPx) <= maxWidth;
  while (!fits && fontPx > WORD_MIN_PX) {
    fontPx = Math.max(WORD_MIN_PX, fontPx - STEP_PX);
    fits = measure(text, fontPx) <= maxWidth;
  }
  return { fontPx, wrap: !fits };
}

/**
 * Canvas text metrics in the word font (Bold, `--font-family`). Without a 2D context every word
 * "fits", so it keeps the start size and CSS wrapping still keeps it inside the card.
 */
export function canvasMeasure(): Measure {
  let context: CanvasRenderingContext2D | null;
  try {
    context = document.createElement('canvas').getContext('2d');
  } catch {
    context = null;
  }
  if (!context) {
    console.warn('[flashcard] canvas text metrics unavailable; words are not shrunk to fit');
    return () => 0;
  }
  const ctx = context;
  return (text, px) => {
    ctx.font = `700 ${px}px 'Noto Sans', system-ui, sans-serif`;
    return ctx.measureText(text).width;
  };
}
