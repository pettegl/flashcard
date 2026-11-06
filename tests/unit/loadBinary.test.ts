import { TextDecoder as NodeTextDecoder, TextEncoder as NodeTextEncoder } from 'node:util';

type LoadBinaryModule = typeof import('../../src/platform/loadBinary');

class FakeXhr {
  static instances: FakeXhr[] = [];
  status = 0;
  response: unknown = null;
  responseType = '';
  method = '';
  url = '';
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  abort = jest.fn();
  send = jest.fn();

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  respond(status: number, response: unknown) {
    this.status = status;
    this.response = response;
    this.onload?.();
  }
}

function fakeResponse(body: ArrayBuffer, status = 200): Response {
  const response = {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: () => Promise.resolve(body),
    clone: () => response,
  };
  return response as unknown as Response;
}

function setGlobal(name: string, value: unknown) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

const bytes = (text: string) => new NodeTextEncoder().encode(text).slice().buffer as ArrayBuffer;
const originalXhr = globalThis.XMLHttpRequest;
let fetchMock: jest.Mock;
let cache: { match: jest.Mock; put: jest.Mock };
let cachesMock: { open: jest.Mock };

async function loadModule(isFileOrigin: boolean): Promise<LoadBinaryModule> {
  let mod!: LoadBinaryModule;
  await jest.isolateModulesAsync(async () => {
    jest.doMock('../../src/platform/env', () => ({ IS_FILE_ORIGIN: isFileOrigin, IN_CONTAINER: false }));
    mod = await import('../../src/platform/loadBinary');
  });
  return mod;
}

beforeEach(() => {
  FakeXhr.instances = [];
  setGlobal('XMLHttpRequest', FakeXhr);
  fetchMock = jest.fn();
  cache = { match: jest.fn().mockResolvedValue(undefined), put: jest.fn().mockResolvedValue(undefined) };
  cachesMock = { open: jest.fn().mockResolvedValue(cache) };
  setGlobal('fetch', fetchMock);
  setGlobal('caches', cachesMock);
  if (typeof globalThis.TextDecoder === 'undefined') setGlobal('TextDecoder', NodeTextDecoder);
});

afterEach(() => {
  jest.useRealTimers();
  setGlobal('XMLHttpRequest', originalXhr);
  delete (globalThis as { fetch?: unknown }).fetch;
  delete (globalThis as { caches?: unknown }).caches;
});

describe('UT-06 loadBinary on file: (XHR)', () => {
  it.each([0, 200])('resolves the ArrayBuffer on status %s without touching fetch or caches', async (status) => {
    const { loadBinary } = await loadModule(true);
    const body = bytes('abc');
    const pending = loadBinary('./decks/animals/images/bear.png');
    const xhr = FakeXhr.instances[0];
    expect(xhr.method).toBe('GET');
    expect(xhr.url).toBe('./decks/animals/images/bear.png');
    expect(xhr.responseType).toBe('arraybuffer');
    xhr.respond(status, body);
    await expect(pending).resolves.toBe(body);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cachesMock.open).not.toHaveBeenCalled();
  });
});

describe('UT-07 loadBinary rejections on file:', () => {
  it('rejects on HTTP-like status 404', async () => {
    const { loadBinary } = await loadModule(true);
    const pending = loadBinary('./missing.png');
    FakeXhr.instances[0].respond(404, null);
    await expect(pending).rejects.toThrow('XHR status 404 for ./missing.png');
  });

  it('rejects on status 0 with no response body', async () => {
    const { loadBinary } = await loadModule(true);
    const pending = loadBinary('./missing.png');
    FakeXhr.instances[0].respond(0, null);
    await expect(pending).rejects.toThrow('XHR status 0');
  });

  it('rejects on onerror', async () => {
    const { loadBinary } = await loadModule(true);
    const pending = loadBinary('./missing.png');
    FakeXhr.instances[0].onerror?.();
    await expect(pending).rejects.toThrow('XHR error for ./missing.png');
  });

  it('rejects on timeout and aborts the request', async () => {
    jest.useFakeTimers();
    const { loadBinary } = await loadModule(true);
    const pending = loadBinary('./slow.png', { timeoutMs: 5000 });
    const xhr = FakeXhr.instances[0];
    jest.advanceTimersByTime(4999);
    expect(xhr.abort).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await expect(pending).rejects.toThrow('Timed out after 5000 ms loading ./slow.png');
    expect(xhr.abort).toHaveBeenCalledTimes(1);
  });

  it('does not time out once loaded', async () => {
    jest.useFakeTimers();
    const { loadBinary } = await loadModule(true);
    const body = bytes('ok');
    const pending = loadBinary('./fast.png', { timeoutMs: 5000 });
    FakeXhr.instances[0].respond(0, body);
    await expect(pending).resolves.toBe(body);
    jest.advanceTimersByTime(10000);
    expect(FakeXhr.instances[0].abort).not.toHaveBeenCalled();
  });

  it('reports the load error, not a timeout, when it fails before timeoutMs', async () => {
    jest.useFakeTimers();
    const { loadBinary } = await loadModule(true);
    const pending = loadBinary('./missing.png', { timeoutMs: 5000 });
    FakeXhr.instances[0].respond(404, null);
    await expect(pending).rejects.toThrow('XHR status 404');
    jest.advanceTimersByTime(10000);
    expect(FakeXhr.instances[0].abort).not.toHaveBeenCalled();
  });
});

describe('UT-08 loadBinary on https: (fetch + Cache Storage)', () => {
  it('fetches on a cache miss and stores the response', async () => {
    const { loadBinary } = await loadModule(false);
    const body = bytes('net');
    fetchMock.mockResolvedValue(fakeResponse(body));
    await expect(loadBinary('./a.png')).resolves.toBe(body);
    expect(cachesMock.open).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('./a.png', expect.objectContaining({ signal: expect.anything() }));
    expect(cache.put).toHaveBeenCalledWith('./a.png', expect.anything());
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('serves a cache hit without fetching', async () => {
    const { loadBinary } = await loadModule(false);
    const body = bytes('cached');
    cache.match.mockResolvedValue(fakeResponse(body));
    await expect(loadBinary('./a.png')).resolves.toBe(body);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects on a non-ok response and caches nothing', async () => {
    const { loadBinary } = await loadModule(false);
    fetchMock.mockResolvedValue(fakeResponse(bytes(''), 404));
    await expect(loadBinary('./a.png')).rejects.toThrow('HTTP status 404 for ./a.png');
    expect(cache.put).not.toHaveBeenCalled();
  });

  it('still loads when Cache Storage is unavailable, fails to open, or fails to read/write', async () => {
    const { loadBinary } = await loadModule(false);
    const body = bytes('net');
    fetchMock.mockResolvedValue(fakeResponse(body));

    delete (globalThis as { caches?: unknown }).caches;
    await expect(loadBinary('./a.png')).resolves.toBe(body);

    setGlobal('caches', { open: jest.fn().mockRejectedValue(new Error('denied')) });
    await expect(loadBinary('./a.png')).resolves.toBe(body);

    cache.match.mockRejectedValue(new Error('read'));
    cache.put.mockRejectedValue(new Error('write'));
    setGlobal('caches', cachesMock);
    await expect(loadBinary('./a.png')).resolves.toBe(body);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('rejects on timeout and aborts the fetch', async () => {
    jest.useFakeTimers();
    const { loadBinary } = await loadModule(false);
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation((_url: string, init: RequestInit) => {
      signal = init.signal ?? undefined;
      return new Promise(() => undefined);
    });
    const pending = loadBinary('./slow.png', { timeoutMs: 100 });
    const rejection = expect(pending).rejects.toThrow('Timed out after 100 ms');
    await jest.advanceTimersByTimeAsync(100);
    await rejection;
    expect(signal?.aborted).toBe(true);
  });
});

describe('FR-05 loadJson', () => {
  it('decodes UTF-8 (BOM stripped) and parses JSON', async () => {
    const { loadJson } = await loadModule(true);
    const pending = loadJson('./lang/spanish/animals.json', { timeoutMs: 5000 });
    FakeXhr.instances[0].respond(0, bytes('\uFEFF{"target_word":"Caimán"}'));
    await expect(pending).resolves.toEqual({ target_word: 'Caimán' });
  });

  it('rejects on invalid JSON', async () => {
    const { loadJson } = await loadModule(true);
    const pending = loadJson('./corrupt.json');
    FakeXhr.instances[0].respond(0, bytes('{not json'));
    await expect(pending).rejects.toThrow(SyntaxError);
  });

  it('rejects when the file cannot be loaded', async () => {
    const { loadJson } = await loadModule(true);
    const pending = loadJson('./missing.json');
    FakeXhr.instances[0].onerror?.();
    await expect(pending).rejects.toThrow('XHR error');
  });
});
