import { arrangeStickers, fillStickerSheet, type StickerProject } from '../lib/stickers';

self.onmessage = ({
  data,
}: MessageEvent<{ project: StickerProject; action: 'arrange' | 'fill'; selected?: string }>) => {
  try {
    let limited = false,
      lastUpdate = 0;
    const options = {
      limited: () => {
        limited = true;
      },
      progress: (completed: number, total: number, phase: 'grid' | 'nesting') => {
        const now = performance.now();
        if (completed === 0 || now - lastUpdate > 100) {
          lastUpdate = now;
          self.postMessage({ type: 'progress', completed, total, phase });
        }
      },
    };
    const result =
      data.action === 'arrange'
        ? arrangeStickers(data.project, options)
        : fillStickerSheet(data.project, data.selected, options);
    self.postMessage({ type: 'complete', items: result.items, poses: result.poses, limited });
  } catch (error) {
    self.postMessage({
      type: 'error',
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
