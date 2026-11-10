import { backgroundAssets, boot, criticalAssets, FONT_ASSETS } from '../../src/app/boot';
import type { PlayableCard } from '../../src/data/types';
import { validateDeck } from '../../src/data/validateDeck';
import { loadJson } from '../../src/platform/loadBinary';

jest.mock('../../src/platform/loadBinary', () => ({ loadJson: jest.fn() }));
jest.mock('../../src/data/validateDeck', () => ({ validateDeck: jest.fn() }));

// FR-10 steps (5) and (7): which assets gate the ready UI and which follow in the background.
const card = (index: number, audio = true): PlayableCard => ({
  cardId: `c${index}`,
  index,
  imageUrl: `./decks/d/images/c${index}.png`,
  word: `C${index}`,
  audioUrl: audio ? `./lang/l/audios/d_c${index}.wav` : null,
});
const urls = (assets: { url: string }[]) => assets.map((asset) => asset.url);

describe('FR-10 asset selection', () => {
  const cards = [card(0), card(1), card(2, false), card(3), card(4)];

  it('critical = current card, then fonts, then the previous and next cards (no audio entry when absent)', () => {
    expect(urls(criticalAssets(cards, 3))).toEqual([
      './decks/d/images/c3.png',
      './lang/l/audios/d_c3.wav',
      ...urls([...FONT_ASSETS]),
      './decks/d/images/c2.png',
      './decks/d/images/c4.png',
      './lang/l/audios/d_c4.wav',
    ]);
  });

  it('has no neighbour entry past either end', () => {
    expect(urls(criticalAssets([card(0)], 0))).toEqual([
      './decks/d/images/c0.png',
      './lang/l/audios/d_c0.wav',
      ...urls([...FONT_ASSETS]),
    ]);
  });

  it('background = every other card, nearest to the current one first, without the critical set', () => {
    expect(urls(backgroundAssets(cards, 3, criticalAssets(cards, 3)))).toEqual([
      './decks/d/images/c1.png',
      './lang/l/audios/d_c1.wav',
      './decks/d/images/c0.png',
      './lang/l/audios/d_c0.wav',
    ]);
  });
});

describe('FR-10 boot errors', () => {
  it('rejects (→ E9) when validation fails with something other than a DeckError', async () => {
    (loadJson as jest.Mock).mockResolvedValue({});
    (validateDeck as jest.Mock).mockImplementation(() => {
      throw new TypeError('bug');
    });
    await expect(boot('?cr_lang=english&cr_book=animals')).rejects.toThrow(TypeError);
  });
});
