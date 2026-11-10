import { cardSize } from '../../src/ui/computeLayout';

// FR-14: the single MVP/Better card is Wc × Hc (UISPEC §U.5, §U.7 worked vectors; UT-24 adds the
// carousel slots at Great).
describe('cardSize (UISPEC §U.7 Wc/Hc)', () => {
  it.each([
    [360, 640, 280, 210],
    [640, 360, 336, 252],
    [1280, 800, 720, 540],
    [360, 360, 280, 210],
    [2000, 2000, 720, 540],
  ])('%i×%i → %i×%i', (vw, vh, width, height) => {
    expect(cardSize(vw, vh)).toEqual({ width, height });
  });

  it('keeps the card within 0.7·vh·4/3 and the 4:3 aspect', () => {
    for (const [vw, vh] of [
      [1000, 300],
      [375, 667],
      [812, 375],
    ]) {
      const { width, height } = cardSize(vw, vh);
      expect(width).toBeLessThanOrEqual((0.7 * vh * 4) / 3 + 1e-6);
      expect(width).toBeLessThanOrEqual(0.78 * vw);
      expect(height).toBe(Math.floor((width * 3) / 4));
    }
  });

  it('never returns a negative size', () => {
    expect(cardSize(0, 0)).toEqual({ width: 0, height: 0 });
  });
});
