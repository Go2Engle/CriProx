import type { CardFace } from './types';

const MPC_CDN_ARTWORK = /^https:\/\/cdn\.mpcautofill\.com\/images\/google_drive\/(?:full|large)\//;

// MPC Autofill's 63 x 88 mm source template is 816 x 1110 px at 300 DPI.
// MakePlayingCards consumes the outer 36 px on every edge as print bleed.
const MPC_TEMPLATE_WIDTH = 816;
const MPC_TEMPLATE_HEIGHT = 1110;
const MPC_BLEED_PX = 36;
const EMBEDDED_ARTWORK = /^data:image\/(?:png|jpeg|webp);base64,/;

// Community print-ready files commonly use either the 63 x 88 mm
// (816 x 1110) or traditional poker (822 x 1122) MPC canvas. Accept minor
// contributor/template variations, but keep this well clear of the finished
// 63:88 card ratio (about 0.716).
const MPC_CANVAS_ASPECT_MIN = 0.731;
const MPC_CANVAS_ASPECT_MAX = 0.739;

export type SourceRect = { x: number; y: number; width: number; height: number };

export function looksLikeMpcPrintCanvas(width: number, height: number) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return false;
  const aspect = width / height;
  return aspect >= MPC_CANVAS_ASPECT_MIN && aspect <= MPC_CANVAS_ASPECT_MAX;
}

export function isEmbeddedArtwork(face: Pick<CardFace, 'image'>) {
  return EMBEDDED_ARTWORK.test(face.image);
}

export function withMpcTrim(face: CardFace, enabled: boolean): CardFace {
  const { trim: _trim, ...plain } = face;
  return enabled ? { ...plain, trim: 'mpc' } : plain;
}

export function usesMpcTrim(face: Pick<CardFace, 'image' | 'preview' | 'trim'>) {
  return (
    face.trim === 'mpc' || MPC_CDN_ARTWORK.test(face.image) || MPC_CDN_ARTWORK.test(face.preview)
  );
}

/** Return the finished-card portion of a source bitmap. Expansion ratios add
 * some of the source's native bleed back around that trim box. For example,
 * 0.5 / 63 expands the horizontal crop by 0.5 mm on both sides of a 63 mm card.
 */
export function artworkSourceRect(
  face: Pick<CardFace, 'image' | 'preview' | 'trim'>,
  width: number,
  height: number,
  expansion: { x: number; y: number } = { x: 0, y: 0 },
): SourceRect {
  if (!usesMpcTrim(face)) return { x: 0, y: 0, width, height };

  const insetX = (width * MPC_BLEED_PX) / MPC_TEMPLATE_WIDTH,
    insetY = (height * MPC_BLEED_PX) / MPC_TEMPLATE_HEIGHT,
    trimWidth = width - insetX * 2,
    trimHeight = height - insetY * 2,
    expandX = Math.max(0, trimWidth * expansion.x),
    expandY = Math.max(0, trimHeight * expansion.y),
    x = Math.max(0, insetX - expandX),
    y = Math.max(0, insetY - expandY),
    right = Math.min(width, width - insetX + expandX),
    bottom = Math.min(height, height - insetY + expandY);
  return { x, y, width: right - x, height: bottom - y };
}
