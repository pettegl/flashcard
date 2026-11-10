import { canvasMeasure, fitText, WORD_MIN_PX, type Measure } from '../../src/ui/fitText';

// UT-26 (FR-14, AC-08): deterministic word fitting with a stub measure.
// Stub: every character is 0.6 em wide, so width = length × 0.6 × px.
const measure: Measure = (text, px) => text.length * 0.6 * px;

describe('UT-26 fitText', () => {
  // 360×640 viewport → card 280×210: start = floor(0.22 × 210) = 46 px; max width = 0.84 × 280 = 235.2 px.
  const W = 280;
  const H = 210;

  it('keeps the start size when the word already fits', () => {
    expect(fitText('Cat', W, H, measure)).toEqual({ fontPx: 46, wrap: false });
  });

  it('never exceeds the start size', () => {
    expect(fitText('', W, H, measure).fontPx).toBe(46);
  });

  it('shrinks in 2 px steps to the first size that fits', () => {
    // "Elephant": 8 × 0.6 × px ≤ 235.2 → px ≤ 49 already; "Alligatorsss" (12): px ≤ 32.67 → 46, 44, …, 32.
    const sizes: number[] = [];
    const recording: Measure = (text, px) => {
      sizes.push(px);
      return measure(text, px);
    };
    expect(fitText('Alligatorsss', W, H, recording)).toEqual({ fontPx: 32, wrap: false });
    expect(sizes).toEqual([46, 44, 42, 40, 38, 36, 34, 32]);
  });

  it('floors at WORD_MIN_PX and then signals a wrap', () => {
    const word = 'Supercalifragilisticexpialidociousgators'; // 40 characters: 40 × 0.6 × 18 = 432 > 235.2
    expect(fitText(word, W, H, measure)).toEqual({ fontPx: WORD_MIN_PX, wrap: true });
  });

  it('fits exactly at WORD_MIN_PX without wrapping', () => {
    // 21 × 0.6 × 18 = 226.8 ≤ 235.2, but 21 × 0.6 × 20 = 252 > 235.2.
    expect(fitText('x'.repeat(21), W, H, measure)).toEqual({ fontPx: WORD_MIN_PX, wrap: false });
  });

  it('clamps the last step to WORD_MIN_PX when the 2 px steps would skip it', () => {
    // An odd start size steps 19 → 18, not 19 → 17.
    const sizes: number[] = [];
    const recording: Measure = (text, px) => {
      sizes.push(px);
      return measure(text, px);
    };
    fitText('x'.repeat(100), 300, 87, recording); // start floor(19.14) = 19
    expect(sizes).toEqual([19, 18]);
  });

  it('never starts below WORD_MIN_PX on a tiny card', () => {
    expect(fitText('Cat', 100, 40, measure)).toEqual({ fontPx: WORD_MIN_PX, wrap: false });
  });
});

describe('canvasMeasure', () => {
  afterEach(() => jest.restoreAllMocks());

  it('measures in the bold word font at the requested size', () => {
    const ctx = { font: '', measureText: jest.fn((text: string) => ({ width: text.length * 10 })) };
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    const measureText = canvasMeasure();
    expect(measureText('Cat', 46)).toBe(30);
    expect(ctx.font).toBe("700 46px 'Noto Sans', system-ui, sans-serif");
  });

  it.each([
    ['returns no context', () => null],
    [
      'throws',
      () => {
        throw new Error('no canvas');
      },
    ],
  ])('falls back to "everything fits" with one warning when canvas %s', (_label, impl) => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(impl as never);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const measureText = canvasMeasure();
    expect(measureText('Supercalifragilisticexpialidociousgators', 46)).toBe(0);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/^\[flashcard\] /);
  });
});
