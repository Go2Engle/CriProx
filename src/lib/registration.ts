import { grid, layout, type Sheet } from './layout';
import type { Entry, Settings } from './types';
export const CAPTURE_COLOR = '#e600c8';
export const PT_PER_MM = 72 / 25.4;
export const BACK_ALIGNMENT_SQUARE_MM = 1;
export type RegistrationProfile = {
  version: 1;
  key: string;
  name: string;
  capturedAt: string;
  pdf: Uint8Array;
  pageWidthPt: number;
  pageHeightPt: number;
  leftMm: number;
  topMm: number;
  preview: string;
};
const placeholder: Entry = {
  id: 'registration-slot',
  quantity: 1,
  face: 0,
  card: {
    id: 'registration-slot',
    name: 'Template slot',
    set: 'local',
    setName: 'Template',
    collector: '',
    faces: [],
  },
};
export function fullTemplate(settings: Settings): Sheet {
  return layout([{ ...placeholder, quantity: grid(settings).capacity }], settings)[0];
}
export function registrationKey(s: Settings): string {
  // Deliberately omit artwork, DPI, labels, display units, bleed, manual-cut
  // calibration, and all card-back options; none changes the cut geometry.
  return JSON.stringify([
    'capture-v1',
    s.machine,
    s.paper,
    s.profile,
    s.width,
    s.height,
    s.gap,
    s.radius,
  ]);
}
export function templateId(s: Settings): string {
  let hash = 2166136261;
  for (const c of registrationKey(s)) hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return `CP-${(hash >>> 0).toString(16).toUpperCase().padStart(8, '0')}`;
}
export function fixedSheets(entries: Entry[], settings: Settings): Sheet[] {
  const full = fullTemplate(settings);
  return layout(entries, settings).map((s) => ({ ...s, width: full.width, height: full.height }));
}
export function mirrorBackPlacements(
  sheet: Sheet,
  full: Sheet,
  flip: Settings['backFlip'],
  artworkRotation: Settings['backRotation'] = 0,
): Sheet {
  return {
    ...sheet,
    width: full.width,
    height: full.height,
    placements: sheet.placements.map((placement) => ({
      ...placement,
      x: flip === 'long-edge' ? full.width - placement.x - placement.width : placement.x,
      y: flip === 'short-edge' ? full.height - placement.y - placement.height : placement.y,
      artworkRotation,
    })),
  };
}
export function backAlignmentCorrection(
  horizontalSquares: number,
  horizontalDirection: 'left' | 'right',
  verticalSquares: number,
  verticalDirection: 'up' | 'down',
) {
  if (
    !Number.isFinite(horizontalSquares) ||
    !Number.isFinite(verticalSquares) ||
    horizontalSquares < 0 ||
    verticalSquares < 0
  )
    throw new Error('Alignment measurements must be positive numbers.');
  return {
    x: horizontalSquares * BACK_ALIGNMENT_SQUARE_MM * (horizontalDirection === 'left' ? 1 : -1),
    y: verticalSquares * BACK_ALIGNMENT_SQUARE_MM * (verticalDirection === 'up' ? 1 : -1),
  };
}
export function alignmentArtworkDirection(
  settings: Settings,
  back = false,
): 'up' | 'right' | 'down' | 'left' {
  const direction = grid(settings).rotated ? 'right' : 'up';
  if (!back || settings.backRotation === 0) return direction;
  return direction === 'right' ? 'left' : 'down';
}
export function detectTemplate(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  pageWidthMm: number,
  pageHeightMm: number,
  settings: Settings,
): { leftMm: number; topMm: number } {
  const sheet = fullTemplate(settings);
  const sx = width / pageWidthMm,
    sy = height / pageHeightMm;
  const isMarker = (i: number) =>
    data[i] > 145 &&
    data[i + 1] < 105 &&
    data[i + 2] > 125 &&
    data[i] > data[i + 1] * 1.7 &&
    data[i + 2] > data[i + 1] * 1.5;
  let minX = width,
    minY = height,
    maxX = -1,
    maxY = -1;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (isMarker((y * width + x) * 4)) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  if (maxX < 0)
    throw new Error(
      'No magenta template found. Capture the setup PNG from step 1 in Design Space, in color, with bleed off.',
    );
  const measuredW = (maxX - minX + 1) / sx,
    measuredH = (maxY - minY + 1) / sy;
  if (Math.abs(measuredW - sheet.width) > 0.3 || Math.abs(measuredH - sheet.height) > 0.3) {
    throw new Error(
      `The captured template measures ${measuredW.toFixed(2)} × ${measuredH.toFixed(2)} mm; expected ${sheet.width} × ${sheet.height} mm. Correct the Canvas dimensions, disable bleed and printer scaling, and capture again.`,
    );
  }
  const leftMm = (minX + maxX + 1) / (2 * sx) - sheet.width / 2;
  const topMm = (minY + maxY + 1) / (2 * sy) - sheet.height / 2;
  // Verify the complete pattern, including spaces and rounded corners. This rejects
  // rearranged cards and filled page backgrounds even when the outer bounds match.
  let bad = 0,
    samples = 0;
  for (let y = 0.3; y < sheet.height; y += 0.6)
    for (let x = 0.3; x < sheet.width; x += 0.6) {
      let distance = Infinity;
      for (const p of sheet.placements) {
        const r = settings.radius;
        const qx = Math.abs(x - p.x - p.width / 2) - (p.width / 2 - r);
        const qy = Math.abs(y - p.y - p.height / 2) - (p.height / 2 - r);
        const d = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
        distance = Math.min(distance, d);
      }
      if (Math.abs(distance) < 0.22) continue; // Exclude antialiased raster boundary.
      const px = Math.round((leftMm + x) * sx),
        py = Math.round((topMm + y) * sy);
      const observed = isMarker((py * width + px) * 4);
      if (observed !== distance < 0) bad++;
      samples++;
    }
  if (bad / samples > 0.001)
    throw new Error(
      'The slot pattern does not match this layout. Keep the template as one flat image; do not rearrange, rotate, or resize its cards in Design Space.',
    );
  // A blank setup PDF is not enough. Require dark printed content outside the art
  // rectangle on all four sides, while leaving a clear guard around the replacement.
  // This is a plausibility check, not authentication of Cricut sensor marks.
  const sides = [0, 0, 0, 0];
  const guard = 0.4;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      if (data[i] > 80 || data[i + 1] > 80 || data[i + 2] > 80) continue;
      const mx = x / sx,
        my = y / sy;
      if (
        mx > leftMm - guard &&
        mx < leftMm + sheet.width + guard &&
        my > topMm - guard &&
        my < topMm + sheet.height + guard
      )
        throw new Error(
          'Dark content touches the artwork replacement area. Recapture with bleed off and no extra shapes or labels.',
        );
      if (mx < leftMm) sides[0]++;
      if (mx > leftMm + sheet.width) sides[1]++;
      if (my < topMm) sides[2]++;
      if (my > topMm + sheet.height) sides[3]++;
    }
  if (sides.some((n) => n < 20))
    throw new Error(
      'The page does not appear to contain marks surrounding the template. Import the complete one-page Design Space print PDF, not the original PNG or a cropped page.',
    );
  return { leftMm, topMm };
}
