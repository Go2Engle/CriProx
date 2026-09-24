import type { Entry, Settings } from './types';
export type Placement = {
  entry: Entry;
  copy: number;
  x: number;
  y: number;
  width: number;
  height: number;
  rotated: boolean;
  artworkRotation?: 0 | 180;
};
export type Sheet = { index: number; width: number; height: number; placements: Placement[] };
const sevenCardGeometry = (settings: Settings) => ({
  width: settings.width * 3 + settings.gap * 2,
  height: settings.width * 2 + settings.height + settings.gap * 2,
});
const eightCardGeometry = (settings: Settings) => ({
  width: settings.height * 2 + settings.gap,
  height: settings.width * 4 + settings.gap * 3,
});
const nineCardGeometry = (settings: Settings) => ({
  width: settings.width * 3 + settings.gap * 2,
  height: settings.height * 3 + settings.gap * 2,
});
export function envelope(settings: Settings) {
  if (settings.profile === 'seven') return sevenCardGeometry(settings);
  if (settings.profile === 'eight') return eightCardGeometry(settings);
  if (settings.profile === 'nine') return nineCardGeometry(settings);
  // This is an unvalidated candidate, not the product of multiplying Cricut's
  // nonrectangular maximum extents.
  return { width: 180, height: 220 };
}
export function grid(settings: Settings) {
  if (settings.profile === 'seven')
    return {
      width: settings.width,
      height: settings.height,
      columns: 3,
      rows: 3,
      rotated: false,
      capacity: 7,
    };
  if (settings.profile === 'eight')
    return {
      width: settings.height,
      height: settings.width,
      columns: 2,
      rows: 4,
      rotated: true,
      capacity: 8,
    };
  if (settings.profile === 'nine')
    return {
      width: settings.width,
      height: settings.height,
      columns: 3,
      rows: 3,
      rotated: false,
      capacity: 9,
    };
  const area = envelope(settings);
  const options = [false, true].map((rotated) => {
    const width = rotated ? settings.height : settings.width;
    const height = rotated ? settings.width : settings.height;
    const columns = Math.floor((area.width + settings.gap) / (width + settings.gap));
    const rows = Math.floor((area.height + settings.gap) / (height + settings.gap));
    return { width, height, columns, rows, rotated, capacity: columns * rows };
  });
  return options.sort((a, b) => b.capacity - a.capacity)[0];
}
export function layout(entries: Entry[], settings: Settings): Sheet[] {
  const g = grid(settings);
  if (!g.capacity) throw new Error('These cards do not fit the selected sheet area.');
  const copies = entries.flatMap((entry) =>
    Array.from({ length: entry.quantity }, (_, copy) => ({ entry, copy })),
  );
  const sheets: Sheet[] = [];
  if (settings.profile === 'seven') {
    const bounds = sevenCardGeometry(settings),
      rotatedWidth = settings.height,
      rotatedHeight = settings.width,
      topOffset = (bounds.width - (rotatedWidth * 2 + settings.gap)) / 2,
      slots = [
        { x: topOffset, y: 0, rotated: true },
        { x: topOffset + rotatedWidth + settings.gap, y: 0, rotated: true },
        { x: 0, y: rotatedHeight + settings.gap, rotated: false },
        { x: settings.width + settings.gap, y: rotatedHeight + settings.gap, rotated: false },
        { x: (settings.width + settings.gap) * 2, y: rotatedHeight + settings.gap, rotated: false },
        {
          x: topOffset,
          y: rotatedHeight + settings.gap + settings.height + settings.gap,
          rotated: true,
        },
        {
          x: topOffset + rotatedWidth + settings.gap,
          y: rotatedHeight + settings.gap + settings.height + settings.gap,
          rotated: true,
        },
      ];
    for (let start = 0; start < copies.length; start += g.capacity) {
      const page = copies.slice(start, start + g.capacity);
      sheets.push({
        index: sheets.length,
        ...bounds,
        placements: page.map((copy, i) => {
          const slot = slots[i];
          return {
            ...copy,
            ...slot,
            width: slot.rotated ? settings.height : settings.width,
            height: slot.rotated ? settings.width : settings.height,
          };
        }),
      });
    }
    return sheets;
  }
  if (settings.profile === 'nine') {
    const bounds = nineCardGeometry(settings);
    for (let start = 0; start < copies.length; start += g.capacity) {
      const page = copies.slice(start, start + g.capacity);
      sheets.push({
        index: sheets.length,
        ...bounds,
        placements: page.map((copy, i) => ({
          ...copy,
          x: (i % 3) * (settings.width + settings.gap),
          y: Math.floor(i / 3) * (settings.height + settings.gap),
          width: settings.width,
          height: settings.height,
          rotated: false,
        })),
      });
    }
    return sheets;
  }
  for (let start = 0; start < copies.length; start += g.capacity) {
    const page = copies.slice(start, start + g.capacity);
    const columns = Math.min(g.columns, page.length);
    const rows = Math.ceil(page.length / g.columns);
    sheets.push({
      index: sheets.length,
      width: columns * g.width + (columns - 1) * settings.gap,
      height: rows * g.height + (rows - 1) * settings.gap,
      placements: page.map((copy, i) => ({
        ...copy,
        x: (i % g.columns) * (g.width + settings.gap),
        y: Math.floor(i / g.columns) * (g.height + settings.gap),
        width: g.width,
        height: g.height,
        rotated: g.rotated,
      })),
    });
  }
  return sheets;
}
export function templateSvg(sheet: Sheet, settings: Settings): string {
  // Filled, vector-only silhouettes: no strokes, embedded raster art, or clipping paths.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sheet.width}mm" height="${sheet.height}mm" viewBox="0 0 ${sheet.width} ${sheet.height}">\n<g fill="#000000">\n${sheet.placements.map((p) => `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" rx="${settings.radius}" ry="${settings.radius}"/>`).join('\n')}\n</g>\n</svg>`;
}
export const mmToPx = (mm: number, dpi: number) => Math.round((mm * dpi) / 25.4);
export const inches = (mm: number) => (mm / 25.4).toFixed(4);
