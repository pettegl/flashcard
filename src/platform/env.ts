// FR-04: runtime environment flags, computed once at boot (CR§2.3, CR§6.3).
declare global {
  interface Window {
    ReactNativeWebView?: { postMessage?: (message: string) => void };
  }
}

export interface Env {
  isFileOrigin: boolean;
  inContainer: boolean;
}

export type EnvWindow = Pick<Window, 'location' | 'ReactNativeWebView'>;

export function detectEnv(win: EnvWindow): Env {
  return {
    isFileOrigin: win.location.protocol === 'file:',
    inContainer: typeof win.ReactNativeWebView?.postMessage === 'function',
  };
}

const bootEnv = detectEnv(window);

export const IS_FILE_ORIGIN = bootEnv.isFileOrigin;
export const IN_CONTAINER = bootEnv.inContainer;
