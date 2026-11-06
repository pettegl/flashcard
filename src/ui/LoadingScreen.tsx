import { strings } from './strings';

// UISPEC §U.3 (S-1): spinner only, no visible text.
export function LoadingScreen() {
  return (
    <div className="screen screen--loading" role="status" aria-label={strings.loading} data-testid="loading">
      <div className="spinner" aria-hidden="true" />
    </div>
  );
}
