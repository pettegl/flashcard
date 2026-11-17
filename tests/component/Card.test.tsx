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
import type { Measure } from '../../src/ui/fitText';
import { FLIP_MS } from '../../src/ui/gestures';

// CT-01, CT-02, CT-03, CT-10, CT-12 (FR-14…FR-16, NFR-06; UISPEC §U.5), on the Great carousel. FR-21 keeps the
// face being left rendered, aria-hidden, until the flip ends, so activation lets FLIP_MS pass.
const ROOT = resolve(__dirname, '../..');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

function fixtureCards(tree: string): PlayableCard[] {
  return buildPlayableCards(
    validateDeck(readJson(join(tree, 'decks/animals/deck.json')), 'animals'),
    validateWords(readJson(join(tree, 'lang/english/animals.json')), 'animals', 'english'),
  );
}

const CARDS = fixtureCards(join(ROOT, 'fixtures/content'));
const measure: Measure = (text, px) => text.length * 0.6 * px;

function mockAudio(): jest.Mocked<AudioPlayer> {
  return { play: jest.fn(), stop: jest.fn() };
}

function renderCard({ cards = CARDS, index = 0, audio = mockAudio() } = {}) {
  render(
    <DeckProvider cards={cards} index={index}>
      <Carousel audio={audio} measure={measure} />
    </DeckProvider>,
  );
  return { audio, card: screen.getByTestId('card-current') };
}

/** A face of the current card (the peeks render front faces too). */
const face = (id: 'face-front' | 'face-back') => within(screen.getByTestId('card-current')).queryByTestId(id);
const settle = () => act(() => void jest.advanceTimersByTime(FLIP_MS));
function activate(card: HTMLElement) {
  fireEvent.click(card);
  settle();
}
function press(card: HTMLElement, key: string) {
  const event = fireEvent.keyDown(card, { key });
  settle();
  return event;
}

let error: jest.SpyInstance;
beforeAll(() => {
  // The real stylesheets, so computed styles reflect app.css (jsdom does not resolve var()).
  const style = document.createElement('style');
  style.textContent = ['tokens.css', 'app.css'].map((f) => readFileSync(join(ROOT, 'src/ui', f), 'utf8')).join('\n');
  document.head.appendChild(style);
});
beforeEach(() => {
  jest.useFakeTimers();
  error = jest.spyOn(console, 'error');
});
afterEach(() => {
  jest.useRealTimers();
  error.mockRestore();
});

describe('CT-01 card front', () => {
  it('shows only the first card image in a bordered card, contained and decorative', () => {
    const { card } = renderCard();

    expect(card).toHaveClass('card');
    expect(card).toHaveAttribute('data-card-id', 'alligator');
    const img = (face('face-front') as HTMLElement).querySelector('img');
    expect(img).toHaveAttribute('src', './decks/animals/images/alligator.png');
    expect(img).toHaveAttribute('alt', '');
    expect(img).toHaveAttribute('draggable', 'false');
    expect(getComputedStyle(img as HTMLImageElement).objectFit).toBe('contain');
    expect(face('face-back')).not.toBeInTheDocument();
    expect(screen.queryByText('Alligator')).not.toBeInTheDocument();
    expect(screen.getByTestId('live-region')).toBeEmptyDOMElement();
  });

  it('is a focusable button named per UISPEC §U.10 and sized Wc × Hc from the viewport', () => {
    // jsdom viewport 1024×768 → Wc = floor(min(798.72, 716.8, 720)) = 716, Hc = 537.
    const { card } = renderCard();
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('tabindex', '0');
    expect(card).toHaveAccessibleName('Card 1 of 5. Activate to reveal the word.');
    expect(card.style.width).toBe('716px');
    expect(card.style.height).toBe('537px');
  });

  it('follows viewport resizes', () => {
    const { card } = renderCard();
    const original = { width: window.innerWidth, height: window.innerHeight };
    try {
      Object.assign(window, { innerWidth: 360, innerHeight: 640 });
      fireEvent(window, new Event('resize'));
      expect(card.style.width).toBe('280px');
      expect(card.style.height).toBe('210px');
    } finally {
      Object.assign(window, { innerWidth: original.width, innerHeight: original.height });
    }
  });
});

describe('CT-02 activating the card', () => {
  it('click reveals the word without the image and plays its audio once', () => {
    const { audio, card } = renderCard();
    activate(card);

    expect((face('face-back') as HTMLElement)).toHaveTextContent(/^Alligator$/);
    expect(face('face-front')).not.toBeInTheDocument();
    expect(card.querySelector('img')).toBeNull();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.play).toHaveBeenCalledWith('alligator');
    expect(card).toHaveAccessibleName('Alligator. Card 1 of 5. Activate to flip back.');
    expect(screen.getByTestId('live-region')).toHaveTextContent(/^Alligator$/);
    expect(error).not.toHaveBeenCalled();
  });

  it.each([
    ['Enter', 'Enter'],
    ['Space', ' '],
  ])('%s on the focused card reveals it', (_name, key) => {
    const { audio, card } = renderCard();
    card.focus();
    const event = press(card, key);

    expect(event).toBe(false); // default prevented (no page scroll on Space)
    expect((face('face-back') as HTMLElement)).toHaveTextContent('Alligator');
    expect(audio.play).toHaveBeenCalledTimes(1);
  });

  it('ignores other keys and auto-repeat', () => {
    const { audio, card } = renderCard();
    fireEvent.keyDown(card, { key: 'a' });
    fireEvent.keyDown(card, { key: 'Enter', repeat: true });

    expect(face('face-back')).not.toBeInTheDocument();
    expect(audio.play).not.toHaveBeenCalled();
  });
});

describe('CT-03 flipping back and forth (Better, FR-16)', () => {
  it('clicking the back returns to the front, stops the audio and plays nothing', () => {
    const { audio, card } = renderCard();
    activate(card);
    activate(card);

    expect(face('face-back')).not.toBeInTheDocument();
    expect((face('face-front') as HTMLElement).querySelector('img')).toHaveAttribute(
      'src',
      './decks/animals/images/alligator.png',
    );
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(audio.stop.mock.invocationCallOrder[0]).toBeGreaterThan(audio.play.mock.invocationCallOrder[0]);
    expect(card).toHaveAccessibleName('Card 1 of 5. Activate to reveal the word.');
    expect(screen.getByTestId('live-region')).toBeEmptyDOMElement();
  });

  it('10 clicks alternate the faces and play the audio on each of the 5 reveals', () => {
    const { audio, card } = renderCard();
    for (let i = 1; i <= 10; i++) {
      activate(card);
      expect(face(i % 2 === 1 ? 'face-back' : 'face-front')).toBeInTheDocument();
    }

    expect(audio.play).toHaveBeenCalledTimes(5);
    expect(audio.play.mock.calls.every(([id]) => id === 'alligator')).toBe(true);
    expect(audio.stop).toHaveBeenCalledTimes(5);
    expect(error).not.toHaveBeenCalled();
  });

  it('Enter on the back flips back too', () => {
    const { audio, card } = renderCard();
    press(card, 'Enter');
    press(card, 'Enter');

    expect((face('face-front') as HTMLElement)).toBeInTheDocument();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.stop).toHaveBeenCalledTimes(1);
  });
});

describe('word fitting (FR-14, AC-08)', () => {
  const wordEl = () => (face('face-back') as HTMLElement).querySelector('.card-word') as HTMLElement;

  it('keeps the start size when the word fits', () => {
    // jsdom viewport → card 716×537: start = floor(0.22 × 537) = 118 px; "Cat" = 3 × 0.6 × 118 ≤ 0.84 × 716.
    const { card } = renderCard({ index: 2 });
    activate(card);
    expect(wordEl()).toHaveTextContent(/^Cat$/);
    expect(wordEl().style.fontSize).toBe('118px');
  });

  it('shrinks in 2 px steps until the word fits', () => {
    // "Alligator" = 9 × 0.6 × px ≤ 601.44 → 118 → … → 110 px.
    const { card } = renderCard();
    activate(card);
    expect(wordEl().style.fontSize).toBe('110px');
  });

  it('floors the font at WORD_MIN_PX and caps the line at WORD_FIT_FRAC × Wc', () => {
    // 360×640 → card 280×210; 40 × 0.6 × 18 = 432 > 0.84 × 280 = 235.2.
    const original = { innerWidth: window.innerWidth, innerHeight: window.innerHeight };
    Object.assign(window, { innerWidth: 360, innerHeight: 640 });
    try {
      const word = 'Supercalifragilisticexpialidociousgators';
      const cards = CARDS.map((c, i) => (i === 0 ? { ...c, word } : c));
      const { card } = renderCard({ cards });
      activate(card);

      expect(wordEl()).toHaveTextContent(word);
      expect(wordEl().style.fontSize).toBe('18px');
      expect(parseFloat(wordEl().style.maxWidth)).toBeCloseTo(0.84 * 280);
    } finally {
      Object.assign(window, original);
    }
  });
});

describe('CT-10 image failure', () => {
  it('shows the placeholder on an image error and the card still flips', () => {
    const { audio, card } = renderCard();
    fireEvent.error(card.querySelector('img') as HTMLImageElement);

    expect(screen.getByTestId('image-placeholder')).toBeInTheDocument();
    expect(card.querySelector('img')).toBeNull();
    expect(card.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');

    activate(card);
    expect((face('face-back') as HTMLElement)).toHaveTextContent('Alligator');
    expect(audio.play).toHaveBeenCalledWith('alligator');
    expect(error).not.toHaveBeenCalled();
  });
});

describe('CT-12 html-word variant', () => {
  it('renders the word as literal text, creating no element from it', () => {
    const cards = fixtureCards(join(ROOT, 'fixtures/variants/html-word'));
    const dog = cards.findIndex((c) => c.cardId === 'dog');
    const word = '<b>Dog</b><img src=x onerror=alert(1)>';
    expect(cards[dog].word).toBe(word);

    const { card } = renderCard({ cards, index: dog });
    activate(card);

    const back = (face('face-back') as HTMLElement);
    expect(back).toHaveTextContent(word, { normalizeWhitespace: false });
    expect(back.querySelector('b, img, script')).toBeNull();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(screen.getByTestId('live-region').childElementCount).toBe(0);
  });
});
