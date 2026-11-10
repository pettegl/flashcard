import { strings } from './strings';

/** DEVSPEC §II.4 / UISPEC §U.4 error codes. */
export type ErrorCode = 'E1' | 'E2' | 'E3' | 'E9';

// UISPEC §U.4 (S-2): icon + code only, no buttons (the container controls relaunch).
export function ErrorScreen({ code }: { code: ErrorCode }) {
  return (
    <div className="screen screen--error" role="alert" aria-label={strings.contentUnavailable(code)}>
      <div className="error-icon" aria-hidden="true">
        !
      </div>
      <p className="error-code" data-testid="error-code">
        {code}
      </p>
    </div>
  );
}
