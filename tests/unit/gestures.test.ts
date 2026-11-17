import { classifyGesture, dragOffset, RUBBER_BAND, swipeAction } from '../../src/ui/gestures';

// UT-25 (FR-20; UISPEC §U.8). Tuples are (dx, dy, dt ms, maxMove px).
const classify = (dx: number, dy: number, dt: number, maxMove: number) => classifyGesture({ dx, dy, dt, maxMove });

describe('UT-25 classifyGesture', () => {
  it.each([
    [0, 0, 100, 0],
    [5, 5, 499, 7],
  ])('tap: (%i, %i, %i, %i)', (dx, dy, dt, maxMove) => {
    expect(classify(dx, dy, dt, maxMove)).toBe('tap');
  });

  it('is not a tap at dt = TAP_MAX_MS or maxMove = TAP_MAX_MOVE_PX', () => {
    expect(classify(0, 0, 500, 0)).not.toBe('tap');
    expect(classify(0, 0, 100, 10)).not.toBe('tap');
  });

  it.each([
    [-120, 10, 200, 120],
    [48, 0, 500, 48],
    [24, 0, 40, 24], // v = 0.6 px/ms
  ])('swipe: (%i, %i, %i, %i)', (dx, dy, dt, maxMove) => {
    expect(classify(dx, dy, dt, maxMove)).toBe('swipe');
  });

  it.each([
    [30, 0, 600, 30], // slow and short
    [-40, 60, 300, 72], // |dy| > |dx|
    [12, 0, 100, 12], // slow and short
    [15, 0, 10, 15], // fast but under SWIPE_VELOCITY_MIN_DX_PX
    [0, 0, 600, 0], // long press
  ])('cancel: (%i, %i, %i, %i)', (dx, dy, dt, maxMove) => {
    expect(classify(dx, dy, dt, maxMove)).toBe('cancel');
  });

  it('survives a zero duration', () => {
    expect(classify(20, 0, 0, 20)).toBe('swipe');
  });
});

describe('UT-25 swipe direction and drag', () => {
  it('dx < 0 → NEXT, dx > 0 → PREV', () => {
    expect(swipeAction(-120)).toBe('NEXT');
    expect(swipeAction(48)).toBe('PREV');
  });

  it('follows the finger 1:1, or by RUBBER_BAND with no neighbour', () => {
    expect(dragOffset(-100, true)).toBe(-100);
    expect(dragOffset(-100, false)).toBeCloseTo(-100 * RUBBER_BAND);
    expect(RUBBER_BAND).toBe(0.3);
  });
});
