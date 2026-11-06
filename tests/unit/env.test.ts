import { detectEnv, type EnvWindow } from '../../src/platform/env';

function fakeWindow(protocol: string, reactNativeWebView?: EnvWindow['ReactNativeWebView']): EnvWindow {
  return { location: { protocol } as Location, ReactNativeWebView: reactNativeWebView };
}

describe('UT-05 environment flags', () => {
  it.each([
    ['file:', true],
    ['https:', false],
    ['http:', false],
  ])('location.protocol %s → isFileOrigin %s', (protocol, expected) => {
    expect(detectEnv(fakeWindow(protocol)).isFileOrigin).toBe(expected);
  });

  it('inContainer is true only when ReactNativeWebView.postMessage is a function', () => {
    expect(detectEnv(fakeWindow('file:', { postMessage: () => undefined })).inContainer).toBe(true);
    expect(detectEnv(fakeWindow('file:')).inContainer).toBe(false);
    expect(detectEnv(fakeWindow('file:', {})).inContainer).toBe(false);
    expect(
      detectEnv(fakeWindow('file:', { postMessage: 'nope' } as unknown as EnvWindow['ReactNativeWebView'])).inContainer,
    ).toBe(false);
  });

  describe('IS_FILE_ORIGIN / IN_CONTAINER are computed once at module load', () => {
    afterEach(() => {
      delete window.ReactNativeWebView;
    });

    async function loadEnv(): Promise<typeof import('../../src/platform/env')> {
      let env!: typeof import('../../src/platform/env');
      await jest.isolateModulesAsync(async () => {
        env = await import('../../src/platform/env');
      });
      return env;
    }

    it('outside the container on http(s) (jsdom default)', async () => {
      const env = await loadEnv();
      expect(env.IS_FILE_ORIGIN).toBe(false);
      expect(env.IN_CONTAINER).toBe(false);
    });

    it('inside the container, and not re-evaluated after boot', async () => {
      window.ReactNativeWebView = { postMessage: () => undefined };
      const env = await loadEnv();
      expect(env.IN_CONTAINER).toBe(true);
      delete window.ReactNativeWebView;
      expect(env.IN_CONTAINER).toBe(true);
    });
  });
});
