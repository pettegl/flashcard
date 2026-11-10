import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { App } from '../../src/app/App';
import { boot } from '../../src/app/boot';
import { ErrorBoundary } from '../../src/app/ErrorBoundary';
import { ErrorScreen, type ErrorCode } from '../../src/ui/ErrorScreen';

jest.mock('../../src/app/boot', () => ({ boot: jest.fn() }));

const bootMock = boot as jest.MockedFunction<typeof boot>;
let warn: jest.SpyInstance;

beforeEach(() => {
  bootMock.mockReset();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => warn.mockRestore());

// CT-09 (error part) / AC-02…04, DEVSPEC §II.4: S-2 shows only the code, as an alert.
describe('CT-09 Error screen', () => {
  it.each<ErrorCode>(['E1', 'E2', 'E3', 'E9'])('shows %s with role="alert" and its accessible name', (code) => {
    render(<ErrorScreen code={code} />);
    const alert = screen.getByRole('alert', { name: `Content unavailable, code ${code}` });
    expect(screen.getByTestId('error-code')).toHaveTextContent(new RegExp(`^${code}$`));
    expect(alert.querySelector('.error-icon')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('App screens', () => {
  it('shows the loading screen while boot is pending', () => {
    bootMock.mockReturnValue(new Promise(() => undefined));
    render(<App search="?cr_lang=english&cr_book=animals" />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
    expect(bootMock).toHaveBeenCalledWith('?cr_lang=english&cr_book=animals');
  });

  it('shows E9 when boot rejects unexpectedly', async () => {
    bootMock.mockRejectedValue(new TypeError('bug'));
    render(<App search="" />);
    expect(await screen.findByTestId('error-code')).toHaveTextContent(/^E9$/);
    expect(warn).toHaveBeenCalledWith('[flashcard] E9: unexpected boot failure', expect.any(TypeError));
  });
});

describe('ErrorBoundary (E9)', () => {
  function Broken(): never {
    throw new Error('render bug');
  }

  it('replaces a crashing tree with the E9 screen', () => {
    // React reports caught render errors through console.error; that is expected on this unhappy path.
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    render(
      <ErrorBoundary>
        <Broken />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('error-code')).toHaveTextContent(/^E9$/);
    expect(warn).toHaveBeenCalledWith('[flashcard] E9: unexpected render error', expect.any(Error), expect.any(String));
    error.mockRestore();
  });

  it('renders its children when nothing throws', () => {
    render(
      <ErrorBoundary>
        <p>fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText('fine')).toBeInTheDocument();
  });
});
