import type { AudioPlayer } from '../audio/audioPlayer';
import { useDeck } from '../state/DeckContext';
import { strings } from './strings';

export interface NavArrowsProps {
  audio: AudioPlayer;
}

/**
 * S-4 arrow buttons (FR-17; UISPEC §U.6). Better only: deleted with its styles and tests when the
 * carousel (FR-18) ships. Progress is saved by DeckProvider's onIndexChange (FR-12), not here.
 */
export function NavArrows({ audio }: NavArrowsProps) {
  const { state, dispatch } = useDeck();
  const atFirst = state.index === 0;
  const atLast = state.index === state.cards.length - 1;

  // `aria-disabled` rather than `disabled`, so focus stays on a button that becomes disabled at an end.
  const go = (type: 'PREV' | 'NEXT', disabled: boolean) => {
    if (disabled) return;
    dispatch({ type });
    audio.stop();
  };

  return (
    <div className="nav-arrows">
      <ArrowButton
        direction="prev"
        label={strings.previousCard}
        disabled={atFirst}
        onPress={() => go('PREV', atFirst)}
      />
      <ArrowButton direction="next" label={strings.nextCard} disabled={atLast} onPress={() => go('NEXT', atLast)} />
    </div>
  );
}

interface ArrowButtonProps {
  direction: 'prev' | 'next';
  label: string;
  disabled: boolean;
  onPress: () => void;
}

function ArrowButton({ direction, label, disabled, onPress }: ArrowButtonProps) {
  return (
    <button
      type="button"
      className="nav-arrow"
      data-testid={direction === 'prev' ? 'btn-prev' : 'btn-next'}
      aria-label={label}
      aria-disabled={disabled}
      onClick={onPress}
    >
      <svg className="nav-arrow__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d={direction === 'prev' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'}
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
