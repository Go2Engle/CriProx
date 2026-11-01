import { fitArtwork } from './export';
import type { StickerPose, StickerSettings } from './stickers';

export type ArtworkInfo = {
  width: number;
  height: number;
  trim: { x: number; y: number; width: number; height: number };
};
/** Trim only empty white/transparent margins; keep every non-white pixel, including antialiasing. */
export function artworkPixelBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): ArtworkInfo {
  let left = width,
    top = height,
    right = -1,
    bottom = -1;
  // White is artwork when the source uses transparency (for example white lettering).
  // Only an entirely opaque image can safely treat its pure-white margin as blank.
  let transparent = false;
  for (let i = 3; i < data.length; i += 4)
    if (data[i] < 255) {
      transparent = true;
      break;
    }
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i + 3] && (transparent || data[i] < 255 || data[i + 1] < 255 || data[i + 2] < 255)) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  if (right < 0) return { width, height, trim: { x: 0, y: 0, width, height } };
  // One source pixel protects edge antialiasing when resampled for printing.
  left = Math.max(0, left - 1);
  top = Math.max(0, top - 1);
  right = Math.min(width - 1, right + 1);
  bottom = Math.min(height - 1, bottom + 1);
  return {
    width,
    height,
    trim: { x: left, y: top, width: right - left + 1, height: bottom - top + 1 },
  };
}
const measurements = new Map<string, Promise<ArtworkInfo>>();
export function stickerArtworkInfo(source: string, supplied?: ImageBitmap): Promise<ArtworkInfo> {
  const cached = measurements.get(source);
  if (cached) return cached;
  const pending = (async () => {
    let bitmap = supplied;
    const canvas = document.createElement('canvas');
    try {
      if (!bitmap) {
        const [header, data] = source.split(',');
        bitmap = await createImageBitmap(
          new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], {
            type: header.slice(5, header.indexOf(';')),
          }),
        );
      }
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(bitmap, 0, 0);
      return artworkPixelBounds(
        ctx.getImageData(0, 0, canvas.width, canvas.height).data,
        canvas.width,
        canvas.height,
      );
    } finally {
      if (!supplied) bitmap?.close();
      canvas.width = canvas.height = 0;
    }
  })();
  measurements.set(source, pending);
  if (measurements.size > 128) measurements.delete(measurements.keys().next().value!);
  void pending.catch(() => measurements.delete(source));
  return pending;
}
export function stickerArtworkFrame(
  info: ArtworkInfo,
  pose: Pick<StickerPose, 'width' | 'height' | 'radius'>,
  settings: Pick<StickerSettings, 'fit' | 'borderWidth' | 'borderStrokeWidth'>,
  custom: boolean,
) {
  const source =
    settings.fit === 'cover' && !custom
      ? info.trim
      : { x: 0, y: 0, width: info.width, height: info.height };
  // Custom design contours already describe the artwork's exact coordinate system.
  const stroke = custom ? 0 : (settings.borderStrokeWidth ?? 0);
  const padding = custom
    ? 0
    : Math.max(settings.borderWidth ?? 0, pose.radius * (1 - Math.SQRT1_2)) + stroke;
  const inset = Math.min(padding, Math.min(pose.width, pose.height) / 2 - 0.01);
  const frame = fitArtwork(
    source.width,
    source.height,
    pose.width - inset * 2,
    pose.height - inset * 2,
    'contain',
  );
  return {
    source,
    x: frame.x + inset,
    y: frame.y + inset,
    width: frame.width,
    height: frame.height,
  };
}
