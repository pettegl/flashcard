import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AudioPlayer } from '../../src/audio/audioPlayer';
import { buildPlayableCards } from '../../src/data/buildPlayableCards';
import type { PlayableCard } from '../../src/data/types';
import { validateDeck } from '../../src/data/validateDeck';
import { validateWords } from '../../src/data/validateWords';
import { DeckProvider } from '../../src/state/DeckContext';
import { CurrentCard } from '../../src/ui/Card';
import type { Measure } from '../../src/ui/fitText';
import { NavArrows } from '../../src/ui/NavArrows';

// CT-04 (FR-17, AC-13, AC-14; UISPEC §U.6, §U.10). Better only: delete this file when FR-18 ships (CT-13 replaces it).
const ROOT = resolve(__dirname, '../..');
const FIXTURES = join(ROOT, 'fixtures/content');
const readJson = (path: string): unknown => JSON.parse(readFileSync(path, 'utf8'));

const CARDS: PlayableCard[] = buildPlayableCards(
  validateDeck(readJson(join(FIXTURES, 'decks/animals/deck.json')), 'animals'),
  validateWords(readJson(join(FIXTURES, 'lang/english/animals.json')), 'animals', 'english'),
);
const measure: Measure = (text, px) => text.length * 0.6 * px;

function renderDeck({ index = 0, onIndexChange = jest.fn() } = {}) {
  const audio: jest.Mocked<AudioPlayer> = { play: jest.fn(), stop: jest.fn() };
  render(
    <DeckProvider cards={CARDS} index={index} onIndexChange={onIndexChange}>
      <CurrentCard audio={audio} measure={measure} />
      <NavArrows audio={audio} />
    </DeckProvider>,
  );
  return {
    audio,
    onIndexChange,
    card: () => screen.getByTestId('card-current'),
    prev: screen.getByTestId('btn-prev'),
    next: screen.getByTestId('btn-next'),
  };
}

let error: jest.SpyInstance;
beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = ['tokens.css', 'app.css'].map((f) => readFileSync(join(ROOT, 'src/ui', f), 'utf8')).join('\n');
  document.head.appendChild(style);
});
beforeEach(() => {
  error = jest.spyOn(console, 'error');
});
afterEach(() => error.mockRestore());

describe('CT-04 NavArrows (AC-13: arrows move and reset the face)', () => {
  it('Next from the revealed first card shows card 2 on its front and stops the audio', () => {
    const { audio, card, next } = renderDeck();
    fireEvent.click(card());
    expect(screen.getByTestId('face-back')).toHaveTextContent('Alligator');

    fireEvent.click(next);

    expect(card()).toHaveAttribute('data-card-id', 'bear');
    expect(screen.getByTestId('face-front').querySelector('img')).toHaveAttribute(
      'src',
      './decks/animals/images/bear.png',
    );
    expect(screen.queryByTestId('face-back')).not.toBeInTheDocument();
    expect(card()).toHaveAccessibleName('Card 2 of 5. Activate to reveal the word.');
    expect(screen.getByTestId('live-region')).toBeEmptyDOMElement();
    expect(audio.stop).toHaveBeenCalledTimes(1);
    expect(audio.stop.mock.invocationCallOrder[0]).toBeGreaterThan(audio.play.mock.invocationCallOrder[0]);
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
  });

  it('Previous from the back of card 2 shows card 1 on its front and stops the audio', () => {
    const { audio, card, prev } = renderDeck({ index: 1 });
    fireEvent.click(card());
    fireEvent.click(prev);

    expect(card()).toHaveAttribute('data-card-id', 'alligator');
    expect(screen.getByTestId('face-front')).toBeInTheDocument();
    expect(audio.stop).toHaveBeenCalledTimes(1);
  });

  it('are native buttons named per UISPEC §U.6, with a decorative icon', () => {
    const { prev, next } = renderDeck({ index: 2 });
    expect(prev.tagName).toBe('BUTTON');
    expect(prev).toHaveAttribute('type', 'button');
    expect(screen.getByRole('button', { name: 'Previous card' })).toBe(prev);
    expect(screen.getByRole('button', { name: 'Next card' })).toBe(next);
    expect(prev.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(prev).toHaveAttribute('aria-disabled', 'false');
    expect(next).toHaveAttribute('aria-disabled', 'false');
  });

  it('report each real index change once through onIndexChange (progress is saved there, FR-12)', () => {
    const { onIndexChange, prev, next } = renderDeck();
    fireEvent.click(prev); // disabled: no change
    fireEvent.click(next);
    fireEvent.click(next);
    fireEvent.click(prev);

    expect(onIndexChange.mock.calls.map(([c]: [PlayableCard]) => c.cardId)).toEqual(['bear', 'cat', 'bear']);
  });
});

describe('CT-04 NavArrows (AC-14: disabled at the ends)', () => {
  it('Previous is disabled on the first card and does nothing when pressed', () => {
    const { audio, onIndexChange, card, prev, next } = renderDeck();
    expect(prev).toHaveAttribute('aria-disabled', 'true');
    expect(next).toHaveAttribute('aria-disabled', 'false');

    fireEvent.click(card());
    fireEvent.click(prev);

    expect(card()).toHaveAttribute('data-card-id', 'alligator');
    expect(screen.getByTestId('face-back')).toBeInTheDocument(); // the face is kept, too
    expect(audio.stop).not.toHaveBeenCalled();
    expect(onIndexChange).not.toHaveBeenCalled();
  });

  it('Next becomes disabled on the last card, does nothing there, and keeps focus', () => {
    const { audio, card, prev, next } = renderDeck();
    next.focus();
    for (let i = 0; i < 4; i++) fireEvent.click(next);

    expect(card()).toHaveAttribute('data-card-id', 'elephant');
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(prev).toHaveAttribute('aria-disabled', 'false');
    expect(next).not.toBeDisabled(); // aria-disabled only, so it stays focusable
    expect(next).toHaveFocus();
    expect(audio.stop).toHaveBeenCalledTimes(4);

    fireEvent.click(next);
    expect(card()).toHaveAttribute('data-card-id', 'elephant');
    expect(audio.stop).toHaveBeenCalledTimes(4);
  });

  it('a one-card deck disables both arrows', () => {
    const audio: AudioPlayer = { play: jest.fn(), stop: jest.fn() };
    render(
      <DeckProvider cards={CARDS.slice(0, 1)} index={0}>
        <NavArrows audio={audio} />
      </DeckProvider>,
    );
    expect(screen.getByTestId('btn-prev')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('btn-next')).toHaveAttribute('aria-disabled', 'true');
  });

  it('are 56 px circles, at 30% opacity when disabled (UISPEC §U.2, §U.6)', () => {
    const { prev, next } = renderDeck();
    const style = getComputedStyle(next);
    expect(style.width).toBe('56px');
    expect(style.height).toBe('56px');
    expect(style.borderRadius).toBe('50%');
    expect(getComputedStyle(prev).opacity).toBe('0.3');
    expect(style.opacity).not.toBe('0.3');
  });
});
