import type { StickerDesign } from './sticker-design';
import { fitArtwork } from './export';
import type { StickerPose } from './stickers';
import { designCutPaths, designOutputBounds, type StickerCutPath } from './sticker-contours';
export * from './sticker-contours';
/** Local, unrotated sticker coordinates, including the same contain/cover and flips as its artwork. */
export function stickerLocalCuts(
  design: StickerDesign,
  pose: StickerPose,
  _fit: 'contain' | 'cover',
  strict = true,
): StickerCutPath[] {
  const bounds = designOutputBounds(design);
  const scale = Math.min(600 / 25.4, Math.sqrt(24_000_000 / (bounds.width * bounds.height)));
  const frame = fitArtwork(
    Math.ceil(bounds.width * scale),
    Math.ceil(bounds.height * scale),
    pose.width,
    pose.height,
    'contain',
  );
  return designCutPaths(design).map((path) => ({
    ...path,
    points: path.points.map((p) => {
      const x = frame.x + ((p.x - bounds.x) / bounds.width) * frame.width,
        y = frame.y + ((p.y - bounds.y) / bounds.height) * frame.height;
      if (strict && (x < -1e-5 || y < -1e-5 || x > pose.width + 1e-5 || y > pose.height + 1e-5))
        throw Error(
          'Crop to fill would crop a cut path. Use Entire image on white or adjust the sticker proportions.',
        );
      return { x: pose.flipX ? pose.width - x : x, y: pose.flipY ? pose.height - y : y };
    }),
  }));
}
