import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { App } from '../../src/app/App';
import { LoadingScreen } from '../../src/ui/LoadingScreen';

// CT-09 (loading part) / AC-01: S-1 is a status region with a spinner and no visible text.
describe('CT-09 Loading screen', () => {
  it('has role="status", the accessible name "Loading" and no text', () => {
    render(<LoadingScreen />);
    const loading = screen.getByTestId('loading');
    expect(loading).toHaveAttribute('role', 'status');
    expect(screen.getByRole('status', { name: 'Loading' })).toBe(loading);
    expect(loading).toHaveTextContent(/^$/);
    expect(loading.querySelector('.spinner')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is what the Module 0 app shell renders', () => {
    render(<App />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });
});
