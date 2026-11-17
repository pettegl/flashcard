import { cardSize, computeLayout, MIN_SLIVER_PX, SIDE_GAP_PX } from '../../src/ui/computeLayout';

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

// UT-24 (FR-18): the Great carousel geometry.
describe('UT-24 computeLayout (UISPEC §U.7)', () => {
  it.each([
    [360, 640, 280, 210, 28],
    [640, 360, 336, 252, 140],
    [1280, 800, 720, 540, 268],
    [360, 360, 280, 210, 28],
    [2000, 2000, 720, 540, 628],
  ])('%i×%i → Wc %i, Hc %i, sliver %i', (vw, vh, width, height, sliver) => {
    const layout = computeLayout(vw, vh);
    expect(layout.card).toEqual({ width, height });
    expect(layout.card.width).toBeLessThanOrEqual((0.7 * vh * 4) / 3 + 1e-6);
    expect(layout.sliver).toBe(sliver);
  });

  it('places the slots per the worked 360×640 vector', () => {
    // Ws = floor(280·0.8) = 224, Hs = 168; cx±1 = 180 ± (140 + 12 + 112); cx±2 = cx±1 ± (224 + 12).
    const layout = computeLayout(360, 640);
    expect(layout.side).toEqual({ width: 224, height: 168 });
    expect(layout.slotX).toEqual({ [-2]: -320, [-1]: -84, 0: 180, 1: 444, 2: 680 });
    expect(layout.centerY).toBe(320);
  });

  it('keeps every peek a visible sliver, the gap clear of the current card, and staging off-screen', () => {
    for (let vw = 360; vw <= 2400; vw += 7) {
      for (const vh of [360, 640, 800, 1400]) {
        const { card, side, slotX, sliver } = computeLayout(vw, vh);
        expect(sliver).toBeGreaterThanOrEqual(MIN_SLIVER_PX);
        // The next peek's left edge sits SIDE_GAP_PX right of the current card and shows `sliver` px.
        expect(slotX[1] - side.width / 2).toBeCloseTo(slotX[0] + card.width / 2 + SIDE_GAP_PX);
        expect(vw - (slotX[1] - side.width / 2)).toBeCloseTo(sliver);
        expect(slotX[0] - slotX[-1]).toBeCloseTo(slotX[1] - slotX[0]);
        expect(slotX[2] - slotX[1]).toBeCloseTo(side.width + SIDE_GAP_PX);
      }
    }
  });

  // Staging slots are off-screen on device viewports; past 1920 px wide (or ~2.5:1) they come into view (OQ-15).
  it.each([
    [360, 640],
    [640, 360],
    [812, 375],
    [768, 1024],
    [1024, 768],
    [1280, 800],
    [1920, 1080],
  ])('keeps the staging slots off-screen at %i×%i', (vw, vh) => {
    const { side, slotX } = computeLayout(vw, vh);
    expect(slotX[2] - side.width / 2).toBeGreaterThanOrEqual(vw);
    expect(slotX[-2] + side.width / 2).toBeLessThanOrEqual(0);
  });
});
