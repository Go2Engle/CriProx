import { get, set } from 'idb-keyval';

// The worker and its model are constructed only after an explicit opt-in.
const MODEL_ID = 'esrgan-thick-4x-1.0.0';
let worker: Worker | undefined;
const pending = new Map<
  string,
  {
    resolve: (blob: Blob) => void;
    reject: (error: Error) => void;
    progress: (text: string) => void;
  }
>();

export function isScryfallArtwork(source: string) {
  return /^https:\/\/cards\.scryfall\.io\//.test(source);
}

function upscaleWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('../workers/upscale.worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = ({
    data,
  }: MessageEvent<
    | { id: string; type: 'progress'; text: string }
    | { id: string; type: 'complete'; blob: Blob }
    | { id: string; type: 'error'; message: string }
  >) => {
    const task = pending.get(data.id);
    if (!task) return;
    if (data.type === 'progress') task.progress(data.text);
    else {
      pending.delete(data.id);
      if (data.type === 'complete') task.resolve(data.blob);
      else task.reject(new Error(data.message));
    }
  };
  worker.onerror = (event) => {
    for (const task of pending.values())
      task.reject(new Error(event.message || 'Upscale worker failed.'));
    pending.clear();
    worker?.terminate();
    worker = undefined;
  };
  return worker;
}

export async function upscaleScryfallArtwork(
  source: string,
  original: ImageBitmap,
  progress: (text: string) => void,
  name: string,
): Promise<ImageBitmap> {
  const key = `upscaled:${MODEL_ID}:${source}`;
  const cached = await get<Blob>(key).catch(() => undefined);
  if (cached) return createImageBitmap(cached);

  progress(`Loading optional upscale model for ${name}…`);
  const id = crypto.randomUUID();
  const blob = await new Promise<Blob>((resolve, reject) => {
    pending.set(id, { resolve, reject, progress });
    try {
      upscaleWorker().postMessage({ id, original, name }, [original]);
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
  await set(key, blob).catch(() => {});
  return createImageBitmap(blob);
}
