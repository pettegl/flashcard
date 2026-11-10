import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorScreen } from '../ui/ErrorScreen';

interface State {
  failed: boolean;
}

// DEVSPEC §II.4: an unhandled React error shows S-2 with code E9; telemetry is untouched.
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn('[flashcard] E9: unexpected render error', error, info.componentStack);
  }

  override render() {
    return this.state.failed ? <ErrorScreen code="E9" /> : this.props.children;
  }
}
