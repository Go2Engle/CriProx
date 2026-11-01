import { stickerPoses, type StickerProject } from './stickers';

export function runStickerLayout(
  project: StickerProject,
  action: 'arrange' | 'fill',
  options: {
    selected?: string;
    signal: AbortSignal;
    progress: (message: string) => void;
  },
): Promise<{ project: StickerProject; limited: boolean }> {
  return new Promise((resolve, reject) => {
    if (options.signal.aborted) {
      reject(new DOMException('Layout cancelled.', 'AbortError'));
      return;
    }
    const worker = new Worker(new URL('../workers/sticker-layout.worker.ts', import.meta.url), {
      type: 'module',
    });
    let settled = false;
    const finish = (error?: Error, result?: { project: StickerProject; limited: boolean }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      options.signal.removeEventListener('abort', cancel);
      worker.terminate();
      if (error) reject(error);
      else resolve(result!);
    };
    const cancel = () => finish(new DOMException('Layout cancelled.', 'AbortError'));
    const timeout = setTimeout(
      () =>
        finish(
          Error(
            'Layout took too long. Your previous layout is unchanged. Try fewer stickers or simpler cut paths.',
          ),
        ),
      20_000,
    );
    options.signal.addEventListener('abort', cancel, { once: true });
    worker.onerror = (event) =>
      finish(Error(event.message || 'The layout worker could not start.'));
    worker.onmessage = ({ data }) => {
      if (data.type === 'progress')
        options.progress(
          `${data.phase === 'grid' ? 'Checking grid' : 'Nesting shapes'}… ${action === 'fill' ? `${data.completed} stickers` : `${data.completed} / ${data.total}`}`,
        );
      else if (data.type === 'error') finish(Error(data.message));
      else if (data.type === 'complete')
        finish(undefined, {
          project: {
            ...project,
            version: 2,
            capture: undefined,
            items: data.items,
            poses: data.poses,
          },
          limited: data.limited,
        });
    };
    // Images and printed layers are irrelevant to packing. Keep the full artwork in the UI.
    worker.postMessage({
      action,
      selected: options.selected,
      project: {
        ...project,
        capture: undefined,
        poses: stickerPoses(project),
        artwork: project.artwork.map((a) => ({
          ...a,
          image: '',
          design: a.design
            ? { ...a.design, elements: a.design.elements.filter((e) => e.operation === 'cut') }
            : undefined,
        })),
      },
    });
  });
}
