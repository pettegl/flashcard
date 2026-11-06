import { IS_FILE_ORIGIN } from './env';

// FR-05 / CR§2.3: XHR on file:// (fetch and Cache Storage fail there); fetch + Cache Storage on http(s).
export interface LoadOptions {
  timeoutMs?: number;
}

const CACHE_NAME = 'flashcard-assets';

export function loadBinary(url: string, options: LoadOptions = {}): Promise<ArrayBuffer> {
  return IS_FILE_ORIGIN ? loadViaXhr(url, options.timeoutMs) : loadViaFetch(url, options.timeoutMs);
}

export async function loadJson(url: string, options: LoadOptions = {}): Promise<unknown> {
  const data = await loadBinary(url, options);
  return JSON.parse(new TextDecoder('utf-8').decode(data));
}

function loadViaXhr(url: string, timeoutMs: number | undefined): Promise<ArrayBuffer> {
  const xhr = new XMLHttpRequest();
  const request = new Promise<ArrayBuffer>((resolve, reject) => {
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = () => {
      // file:// success reports status 0 (no HTTP layer).
      if ((xhr.status === 0 || xhr.status === 200) && xhr.response != null) resolve(xhr.response as ArrayBuffer);
      else reject(new Error(`XHR status ${xhr.status} for ${url}`));
    };
    xhr.onerror = () => reject(new Error(`XHR error for ${url}`));
    xhr.send();
  });
  return withTimeout(request, timeoutMs, url, () => xhr.abort());
}

function loadViaFetch(url: string, timeoutMs: number | undefined): Promise<ArrayBuffer> {
  const controller = typeof AbortController === 'function' ? new AbortController() : undefined;
  return withTimeout(fetchWithCache(url, controller?.signal), timeoutMs, url, () => controller?.abort());
}

async function fetchWithCache(url: string, signal: AbortSignal | undefined): Promise<ArrayBuffer> {
  const cache = await openCache();
  const cached = cache ? await cache.match(url).catch(() => undefined) : undefined;
  if (cached) return cached.arrayBuffer();

  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`HTTP status ${response.status} for ${url}`);
  // The cache is an optimisation: a failed write never fails the load.
  if (cache) cache.put(url, response.clone()).catch(() => undefined);
  return response.arrayBuffer();
}

// Cache Storage is missing on insecure http origins (e.g. a LAN dev server); fall back to plain fetch.
async function openCache(): Promise<Cache | null> {
  if (typeof caches === 'undefined') return null;
  try {
    return await caches.open(CACHE_NAME);
  } catch {
    return null;
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number | undefined,
  url: string,
  onTimeout: () => void,
): Promise<T> {
  if (timeoutMs === undefined) return promise;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error(`Timed out after ${timeoutMs} ms loading ${url}`));
    }, timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
