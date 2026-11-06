import { loadBinary } from './loadBinary';

// FR-06: preload with bounded concurrency; a failed asset is recorded, never thrown.
export const PRELOAD_CONCURRENCY = 4;

export type PreloadAsset =
  | { kind: 'image'; url: string }
  | { kind: 'audio'; url: string }
  | { kind: 'font'; url: string; family: string; weight: string };

export type PreloadResult =
  | { ok: true; kind: 'image' | 'font' }
  | { ok: true; kind: 'audio'; data: ArrayBuffer }
  | { ok: false; kind: PreloadAsset['kind']; error: unknown };

export interface PreloadOptions {
  concurrency?: number;
  timeoutMs?: number;
}

export async function preload(
  assets: readonly PreloadAsset[],
  options: PreloadOptions = {},
): Promise<Map<string, PreloadResult>> {
  const { concurrency = PRELOAD_CONCURRENCY, timeoutMs } = options;
  const queue = uniqueByUrl(assets);
  const results = new Map<string, PreloadResult>();
  let next = 0;

  const worker = async () => {
    while (next < queue.length) {
      const asset = queue[next++];
      results.set(asset.url, await loadAsset(asset, timeoutMs));
    }
  };
  const workerCount = Math.max(1, Math.min(concurrency, queue.length));
  await Promise.allSettled(Array.from({ length: workerCount }, worker));
  return results;
}

async function loadAsset(asset: PreloadAsset, timeoutMs: number | undefined): Promise<PreloadResult> {
  try {
    switch (asset.kind) {
      case 'image':
        await loadImage(asset.url, timeoutMs);
        return { ok: true, kind: 'image' };
      case 'audio':
        return { ok: true, kind: 'audio', data: await loadBinary(asset.url, { timeoutMs }) };
      case 'font':
        await loadFont(asset, timeoutMs);
        return { ok: true, kind: 'font' };
    }
  } catch (error) {
    console.warn(`[flashcard] preload failed for ${asset.url}`, error);
    return { ok: false, kind: asset.kind, error };
  }
}

function loadImage(url: string, timeoutMs: number | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const image = new Image();
    const timer =
      timeoutMs === undefined
        ? undefined
        : setTimeout(() => reject(new Error(`Timed out after ${timeoutMs} ms loading ${url}`)), timeoutMs);
    image.onload = () => {
      clearTimeout(timer);
      resolve();
    };
    image.onerror = () => {
      clearTimeout(timer);
      reject(new Error(`Image failed to load: ${url}`));
    };
    image.src = url;
  });
}

// Failure is non-fatal: text falls back to the system font stack (UISPEC §U.2).
async function loadFont(asset: Extract<PreloadAsset, { kind: 'font' }>, timeoutMs: number | undefined) {
  if (typeof FontFace !== 'function' || !document.fonts) throw new Error('FontFace API unavailable');
  const data = await loadBinary(asset.url, { timeoutMs });
  const face = new FontFace(asset.family, data, { weight: asset.weight });
  await face.load();
  document.fonts.add(face);
}

function uniqueByUrl(assets: readonly PreloadAsset[]): PreloadAsset[] {
  const seen = new Set<string>();
  return assets.filter((asset) => !seen.has(asset.url) && seen.add(asset.url));
}
