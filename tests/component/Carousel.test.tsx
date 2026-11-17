import '@testing-library/jest-dom';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AudioPlayer } from '../../src/audio/audioPlayer';
import { buildPlayableCards } from '../../src/data/buildPlayableCards';
import type { PlayableCard } from '../../src/data/types';
import { validateDeck } from '../../src/data/validateDeck';
import { validateWords } from '../../src/data/validateWords';
import { DeckProvider } from '../../src/state/DeckContext';
import { Carousel } from '../../src/ui/Carousel';
import { computeLayout, SIDE_OPACITY, SIDE_SCALE } from '../../src/ui/computeLayout';
import type { Measure } from '../../src/ui/fitText';
import { FLIP_MS, SLIDE_MS } from '../../src/ui/gestures';

// CT-05…CT-08, CT-13 (FR-17…FR-22; UISPEC §U.7–U.9), and the §U.8 gesture handling in jsdom.
const ROOT = resolve(__dirname, '../..');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));
const CARDS: PlayableCard[] = buildPlayableCards(
  validateDeck(readJson(join(ROOT, 'fixtures/content/decks/animals/deck.json')), 'animals'),
  validateWords(readJson(join(ROOT, 'fixtures/content/lang/english/animals.json')), 'animals', 'english'),
);
const measure: Measure = (text, px) => text.length * 0.6 * px;
const CAT = 2;

// jsdom 20 has no PointerEvent; React only needs the event type and these fields.
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'touch';
  }
}

// jsdom stamps events with the real clock; the tests stamp them with a fake one that moves with the timers.
let now = 1_000;
const stamp = <E extends Event>(event: E): E => Object.defineProperty(event, 'timeStamp', { value: now });
function wait(ms: number) {
  now += ms;
  act(() => void jest.advanceTimersByTime(ms));
}

type PointerInit = { pointerId?: number; pointerType?: string; button?: number };
function pointer(target: Element, type: string, x: number, y: number, init: PointerInit = {}) {
  fireEvent(target, stamp(new TestPointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, ...init })));
}
/** A click as the browser sends it after `pointerup`: on the capturing carousel, or on the target without a gesture. */
function click(target: Element = carousel()) {
  fireEvent(target, stamp(new MouseEvent('click', { bubbles: true, cancelable: true })));
}

/** Press on `target`, move through `path` (offsets from the start) over `ms`, release, then the click. */
function gesture(target: Element, path: Array<[number, number]>, ms: number, init: PointerInit = {}) {
  const [x0, y0] = [200, 300];
  pointer(target, 'pointerdown', x0, y0, init);
  for (const [dx, dy] of path) {
    wait(ms / Math.max(path.length, 1));
    pointer(carousel(), 'pointermove', x0 + dx, y0 + dy, init);
  }
  if (path.length === 0) wait(ms);
  const [dx, dy] = path[path.length - 1] ?? [0, 0];
  pointer(carousel(), 'pointerup', x0 + dx, y0 + dy, init);
  click();
}
const swipe = (dx: number, ms = 200, dy = 0) => gesture(current(), [[dx / 2, dy / 2], [dx, dy]], ms);

const carousel = () => screen.getByTestId('carousel');
const track = () => carousel().querySelector('.carousel-track') as HTMLElement;
const current = () => screen.getByTestId('card-current');
const currentId = () => current().getAttribute('data-card-id');
const face = (el: HTMLElement, id: 'face-front' | 'face-back') => within(el).queryByTestId(id);
const rendered = () => Array.from(document.querySelectorAll('[data-slot]')).map((el) => el.getAttribute('data-card-id'));

function mockAudio(): jest.Mocked<AudioPlayer> {
  return { play: jest.fn(), stop: jest.fn() };
}

function renderCarousel({ cards = CARDS, index = CAT } = {}) {
  const audio = mockAudio();
  const onIndexChange = jest.fn();
  const view = render(
    <DeckProvider cards={cards} index={index} onIndexChange={onIndexChange}>
      <Carousel audio={audio} measure={measure} />
    </DeckProvider>,
  );
  return { audio, onIndexChange, ...view };
}

const VIEWPORT = { width: window.innerWidth, height: window.innerHeight };
function resize(width: number, height: number) {
  Object.assign(window, { innerWidth: width, innerHeight: height });
  act(() => void fireEvent(window, new Event('resize')));
}

/** A `matchMedia` stub; `legacy` gives only the iOS 13 `addListener` API. */
function stubReducedMotion(matches: boolean, legacy = false) {
  const listeners = new Set<() => void>();
  const query = {
    matches,
    media: '(prefers-reduced-motion: reduce)',
    addListener: (fn: () => void) => listeners.add(fn),
    removeListener: (fn: () => void) => listeners.delete(fn),
    ...(legacy
      ? {}
      : {
          addEventListener: (_: string, fn: () => void) => listeners.add(fn),
          removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
        }),
  };
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: jest.fn(() => query) });
  return {
    listeners,
    change(next: boolean) {
      query.matches = next;
      act(() => listeners.forEach((fn) => fn()));
    },
  };
}

let error: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  error = jest.spyOn(console, 'error');
});
afterEach(() => {
  jest.useRealTimers();
  expect(error).not.toHaveBeenCalled();
  error.mockRestore();
  delete (window as Partial<Window>).matchMedia;
  Object.assign(window, { innerWidth: VIEWPORT.width, innerHeight: VIEWPORT.height });
});

describe('CT-05 carousel layout (FR-18)', () => {
  it('index 2: the current card with a peek on each side and staging cards beyond', () => {
    renderCarousel();
    expect(currentId()).toBe('cat');
    expect(screen.getByTestId('card-peek-prev')).toHaveAttribute('data-card-id', 'bear');
    expect(screen.getByTestId('card-peek-next')).toHaveAttribute('data-card-id', 'dog');
    expect(screen.getAllByTestId('card-staging').map((el) => el.getAttribute('data-card-id'))).toEqual([
      'alligator',
      'elephant',
    ]);
    for (const el of screen.getAllByTestId('card-staging')) expect(el).toHaveAttribute('aria-hidden', 'true');
  });

  it('draws the peeks on their front faces at SIDE_SCALE and SIDE_OPACITY, in their §U.7 slots', () => {
    renderCarousel();
    const { card, slotX, centerY } = computeLayout(window.innerWidth, window.innerHeight);
    for (const [id, slot] of [
      ['card-peek-prev', -1],
      ['card-current', 0],
      ['card-peek-next', 1],
    ] as const) {
      const el = screen.getByTestId(id);
      const scale = slot === 0 ? 1 : SIDE_SCALE;
      expect(el.style.transform).toBe(
        `translate(${slotX[slot] - card.width / 2}px, ${centerY - card.height / 2}px) scale(${scale})`,
      );
      expect(el.style.opacity).toBe(String(slot === 0 ? 1 : SIDE_OPACITY));
      expect(el.style.width).toBe(`${card.width}px`);
      expect(face(el, 'face-front')).toBeInTheDocument();
      expect(face(el, 'face-back')).toBeNull();
    }
    expect(Number(current().style.zIndex)).toBeGreaterThan(Number(screen.getByTestId('card-peek-next').style.zIndex));
  });

  it('index 0 has no left peek and index 4 no right peek', () => {
    const { unmount } = renderCarousel({ index: 0 });
    expect(screen.queryByTestId('card-peek-prev')).toBeNull();
    expect(rendered()).toEqual(['alligator', 'bear', 'cat']);
    unmount();

    renderCarousel({ index: 4 });
    expect(screen.queryByTestId('card-peek-next')).toBeNull();
    expect(rendered()).toEqual(['cat', 'dog', 'elephant']);
  });

  it('renders no card beyond current ± 2', () => {
    const cards = [...CARDS, ...CARDS.map((c) => ({ ...c, cardId: `${c.cardId}2` }))];
    renderCarousel({ cards, index: 5 });
    expect(rendered()).toEqual(['dog', 'elephant', 'alligator2', 'bear2', 'cat2']);
  });

  it('re-lays out without animation on resize and keeps the card and face (AC-32)', () => {
    renderCarousel({ index: 3 });
    click(current());
    wait(FLIP_MS);
    resize(640, 360);

    expect(currentId()).toBe('dog');
    expect(face(current(), 'face-back')).toHaveTextContent('Dog');
    expect(current().style.width).toBe('336px');
    expect(current().style.transition).toBe('none');

    click(screen.getByTestId('card-peek-next'));
    expect(current().style.transition).toContain(`transform ${SLIDE_MS}ms`);
  });
});

describe('CT-06 peek taps (FR-19)', () => {
  it('the right peek goes forward on the front face, without a flip, stopping the audio', () => {
    const { audio, onIndexChange } = renderCarousel();
    click(screen.getByTestId('card-peek-next'));

    expect(currentId()).toBe('dog');
    expect(face(current(), 'face-front')).toBeInTheDocument();
    expect(face(current(), 'face-back')).toBeNull();
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(onIndexChange).toHaveBeenCalledTimes(1);
    expect(onIndexChange).toHaveBeenCalledWith(expect.objectContaining({ cardId: 'dog' }));
    expect(screen.getByTestId('card-peek-next')).toHaveAttribute('data-card-id', 'elephant');
  });

  it('the left peek goes back', () => {
    const { audio } = renderCarousel();
    click(screen.getByTestId('card-peek-prev'));
    expect(currentId()).toBe('bear');
    expect(audio.stop).toHaveBeenCalledTimes(1);
  });

  it('routes a pointer tap by the slot under pointerdown, not the click target', () => {
    renderCarousel();
    gesture(screen.getByTestId('card-peek-next'), [], 80);
    expect(currentId()).toBe('dog');
  });

  it('ignores taps on a staging card or the empty carousel', () => {
    const { audio } = renderCarousel();
    click(screen.getAllByTestId('card-staging')[1]);
    click(carousel());
    expect(currentId()).toBe('cat');
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.stop).not.toHaveBeenCalled();
  });
});

describe('CT-07 input lock (FR-22)', () => {
  it('ignores taps and Enter on the current card for FLIP_MS', () => {
    const { audio } = renderCarousel();
    click(current());
    wait(100);
    click(current());
    fireEvent.keyDown(current(), { key: 'Enter' });

    expect(face(current(), 'face-back')).toHaveTextContent('Cat');
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.stop).not.toHaveBeenCalled();

    wait(FLIP_MS - 100);
    click(current());
    expect(face(current(), 'face-front')).not.toHaveAttribute('aria-hidden');
    expect(audio.stop).toHaveBeenCalledTimes(1);
  });

  it('ignores all input for SLIDE_MS after a navigation', () => {
    const { audio, onIndexChange } = renderCarousel();
    click(screen.getByTestId('card-peek-next'));
    wait(100);
    click(screen.getByTestId('card-peek-next'));
    swipe(-120, 60); // 160 ms into the slide
    click(current());
    fireEvent.keyDown(current(), { key: 'Enter' });

    expect(currentId()).toBe('dog');
    expect(onIndexChange).toHaveBeenCalledTimes(1);
    expect(audio.play).not.toHaveBeenCalled();

    wait(SLIDE_MS - 160);
    click(screen.getByTestId('card-peek-next'));
    expect(currentId()).toBe('elephant');
  });

  it('ignores a gesture that started during a slide, even after the slide ends', () => {
    renderCarousel();
    click(screen.getByTestId('card-peek-next'));
    wait(100);
    pointer(current(), 'pointerdown', 200, 300);
    wait(SLIDE_MS);
    pointer(carousel(), 'pointerup', 200, 300);
    click();
    expect(currentId()).toBe('dog');
    expect(face(current(), 'face-back')).toBeNull();
  });

  it('accepts a swipe during a flip and resets the leaving card to its front instantly (AC-29)', () => {
    const { audio } = renderCarousel();
    click(current());
    wait(100);
    swipe(-120);

    expect(currentId()).toBe('dog');
    expect(face(current(), 'face-back')).toBeNull();
    const leaving = screen.getByTestId('card-peek-prev');
    expect(leaving).toHaveAttribute('data-card-id', 'cat');
    expect(face(leaving, 'face-back')).toBeNull();
    const inner = leaving.querySelector('.card-inner') as HTMLElement;
    expect(inner.style.transform).toBe('rotateY(0deg)');
    expect(inner.style.transition).toBe('none');
    expect(audio.stop).toHaveBeenCalledTimes(1);

    wait(SLIDE_MS);
    click(screen.getByTestId('card-peek-prev'));
    expect(currentId()).toBe('cat');
    expect(face(current(), 'face-front')).toBeInTheDocument();
    expect(face(current(), 'face-back')).toBeNull();
  });

  it('accepts a peek tap during a flip, and the new card flips at once', () => {
    const { audio } = renderCarousel();
    click(current());
    wait(100);
    click(screen.getByTestId('card-peek-next'));
    expect(currentId()).toBe('dog');

    wait(SLIDE_MS);
    click(current());
    expect(audio.play).toHaveBeenLastCalledWith('dog');
  });

  it('clears its timers on unmount', () => {
    const { unmount } = renderCarousel();
    click(screen.getByTestId('card-peek-next'));
    click(current());
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });
});

describe('CT-08 reduced motion (FR-22, AC-30)', () => {
  it('swaps faces instantly with no transition and honours rapid taps', () => {
    stubReducedMotion(true);
    const { audio } = renderCarousel();
    click(current());

    expect(face(current(), 'face-back')).toHaveTextContent('Cat');
    expect(face(current(), 'face-front')).toBeNull();
    expect((current().querySelector('.card-inner') as HTMLElement).style.transition).toBe('none');
    expect(current().style.transition).toBe('none');

    click(current());
    click(current());
    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.stop).toHaveBeenCalledTimes(1);

    click(screen.getByTestId('card-peek-next'));
    click(screen.getByTestId('card-peek-next'));
    expect(currentId()).toBe('elephant');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('follows a live change of the preference', () => {
    const media = stubReducedMotion(false);
    renderCarousel();
    expect(current().style.transition).toContain(`${SLIDE_MS}ms`);
    media.change(true);
    expect(current().style.transition).toBe('none');
  });

  it('uses addListener where addEventListener is missing (iOS Safari 13), and removes it on unmount', () => {
    const media = stubReducedMotion(true, true);
    const { unmount } = renderCarousel();
    expect(current().style.transition).toBe('none');
    expect(media.listeners.size).toBe(1);
    unmount();
    expect(media.listeners.size).toBe(0);
  });

  it('animates where matchMedia is missing', () => {
    renderCarousel();
    click(current());
    expect((current().querySelector('.card-inner') as HTMLElement).style.transition).toBe(
      `transform ${FLIP_MS}ms ease-in-out`,
    );
  });
});

describe('CT-16 flip animation (FR-21, AC-26)', () => {
  it('rotates the inner card and keeps the face being left, aria-hidden, until the flip ends', () => {
    renderCarousel();
    const inner = current().querySelector('.card-inner') as HTMLElement;
    expect(inner.style.transform).toBe('rotateY(0deg)');
    click(current());

    expect(inner.style.transform).toBe('rotateY(180deg)');
    expect(face(current(), 'face-front')).toHaveAttribute('aria-hidden', 'true');
    expect(face(current(), 'face-back')).not.toHaveAttribute('aria-hidden');
    expect(current()).toHaveAccessibleName('Cat. Card 3 of 5. Activate to flip back.');
    expect(screen.getByTestId('live-region')).toHaveTextContent(/^Cat$/);

    wait(FLIP_MS);
    expect(face(current(), 'face-front')).toBeNull();
  });
});

describe('CT-15 gestures (FR-20, AC-20…AC-25)', () => {
  it('a swipe left moves to the next card and right back, one card each (AC-20)', () => {
    const { audio } = renderCarousel();
    swipe(-120);
    expect(currentId()).toBe('dog');
    expect(face(current(), 'face-back')).toBeNull(); // the click after a swipe is not a tap
    expect(audio.stop).toHaveBeenCalledTimes(1);

    wait(SLIDE_MS);
    swipe(120);
    expect(currentId()).toBe('cat');
  });

  it('slides the group back to rest after a swipe', () => {
    renderCarousel();
    swipe(-120);
    expect(track().style.transform).toBe('translateX(0px)');
    expect(track().style.transition).toContain(`transform ${SLIDE_MS}ms`);
  });

  it('follows the finger 1:1, and at 30% past the ends, then snaps back (AC-21)', () => {
    renderCarousel({ index: 0 });
    pointer(current(), 'pointerdown', 200, 300);
    wait(50);
    pointer(carousel(), 'pointermove', 320, 300);
    expect(track().style.transform).toBe('translateX(36px)');
    expect(track().style.transition).toBe('none');
    pointer(carousel(), 'pointermove', 80, 300);
    expect(track().style.transform).toBe('translateX(-120px)');
    pointer(carousel(), 'pointermove', 320, 300);
    wait(50);
    pointer(carousel(), 'pointerup', 320, 300);
    click();

    expect(currentId()).toBe('alligator');
    expect(track().style.transform).toBe('translateX(0px)');
    expect(face(current(), 'face-back')).toBeNull();
  });

  it('a short slow drag cancels and snaps back (AC-22)', () => {
    renderCarousel();
    gesture(current(), [[-15, 0], [-30, 0]], 600);
    expect(currentId()).toBe('cat');
    expect(track().style.transform).toBe('translateX(0px)');
    expect(face(current(), 'face-back')).toBeNull();
  });

  it('a fast flick navigates (AC-23)', () => {
    renderCarousel();
    gesture(current(), [[-24, 0]], 40);
    expect(currentId()).toBe('dog');
  });

  it('ignores vertical-dominant gestures (AC-24)', () => {
    renderCarousel();
    gesture(current(), [[-20, 30], [-40, 60]], 300);
    expect(currentId()).toBe('cat');
  });

  it('a 12 px move is not a tap (AC-25)', () => {
    const { audio } = renderCarousel();
    gesture(current(), [[12, 0]], 100);
    expect(currentId()).toBe('cat');
    expect(face(current(), 'face-back')).toBeNull();
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('a pointer tap on the current card flips it', () => {
    const { audio } = renderCarousel();
    gesture(current(), [[3, 2]], 120);
    expect(face(current(), 'face-back')).toHaveTextContent('Cat');
    expect(audio.play).toHaveBeenCalledWith('cat');
  });

  it('a long press does nothing', () => {
    const { audio } = renderCarousel();
    gesture(current(), [], 700);
    expect(face(current(), 'face-back')).toBeNull();
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('tracks only the first pointer', () => {
    renderCarousel();
    pointer(current(), 'pointerdown', 200, 300, { pointerId: 1 });
    pointer(current(), 'pointerdown', 250, 300, { pointerId: 2 });
    wait(100);
    pointer(carousel(), 'pointermove', 100, 300, { pointerId: 2 });
    pointer(carousel(), 'pointerup', 100, 300, { pointerId: 2 });
    expect(currentId()).toBe('cat');
    expect(track().style.transform).toBe('');

    pointer(carousel(), 'pointermove', 80, 300, { pointerId: 1 });
    pointer(carousel(), 'pointerup', 80, 300, { pointerId: 1 });
    expect(currentId()).toBe('dog');
  });

  it('pointercancel snaps back without navigating, and its click is ignored', () => {
    renderCarousel();
    pointer(current(), 'pointerdown', 200, 300);
    wait(50);
    pointer(carousel(), 'pointermove', 100, 300);
    pointer(carousel(), 'pointercancel', 100, 300);
    click();
    expect(currentId()).toBe('cat');
    expect(track().style.transform).toBe('translateX(0px)');
    expect(face(current(), 'face-back')).toBeNull();
  });

  it('ignores non-primary mouse buttons', () => {
    renderCarousel();
    pointer(current(), 'pointerdown', 200, 300, { pointerType: 'mouse', button: 2 });
    wait(100);
    pointer(carousel(), 'pointerup', 80, 300, { pointerType: 'mouse', button: 2 });
    expect(currentId()).toBe('cat');
  });

  it('routes a click long after a gesture by its own target', () => {
    const { audio } = renderCarousel();
    pointer(current(), 'pointerdown', 200, 300);
    wait(50);
    pointer(carousel(), 'pointerup', 200, 340); // vertical: a cancel
    wait(1500);
    click(current());
    expect(face(current(), 'face-back')).toHaveTextContent('Cat');
    expect(audio.play).toHaveBeenCalledTimes(1);
  });
});

describe('CT-13 no arrow buttons at Great (FR-17, AC-17)', () => {
  it('renders no Previous/Next buttons and no <button> at all', () => {
    renderCarousel();
    expect(screen.queryByRole('button', { name: 'Previous card' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Next card' })).toBeNull();
    expect(screen.queryByTestId('btn-prev')).toBeNull();
    expect(screen.queryByTestId('btn-next')).toBeNull();
    expect(document.querySelector('button')).toBeNull();
    expect(screen.getAllByRole('button')).toEqual([current()]);
  });
});
