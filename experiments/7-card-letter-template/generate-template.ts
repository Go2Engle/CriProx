import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { withDpi } from '../../src/lib/png';

const dpi = 600;
const sheetWidthMm = 189.2;
const sheetHeightMm = 214.2;
const gapMm = 0.1;
const radiusMm = 2.5;
const mmToPx = (mm: number) => Math.round((mm * dpi) / 25.4);

const placements = [
  { x: 6.55, y: 0, width: 88, height: 63 },
  { x: 94.65, y: 0, width: 88, height: 63 },
  { x: 0, y: 63 + gapMm, width: 63, height: 88 },
  { x: 63 + gapMm, y: 63 + gapMm, width: 63, height: 88 },
  { x: 126 + gapMm * 2, y: 63 + gapMm, width: 63, height: 88 },
  { x: 6.55, y: 151 + gapMm * 2, width: 88, height: 63 },
  { x: 94.65, y: 151 + gapMm * 2, width: 88, height: 63 },
];

const canvas = createCanvas(mmToPx(sheetWidthMm), mmToPx(sheetHeightMm));
const context = canvas.getContext('2d');
context.scale(canvas.width / sheetWidthMm, canvas.height / sheetHeightMm);
context.fillStyle = '#e600c8';

for (const placement of placements) {
  context.beginPath();
  context.roundRect(placement.x, placement.y, placement.width, placement.height, radiusMm);
  context.fill();
}

const output = join(dirname(fileURLToPath(import.meta.url)), 'seven-card-letter-test-600dpi.png');
writeFileSync(output, withDpi(canvas.toBuffer('image/png'), dpi));
console.log(`${output}\n${canvas.width} × ${canvas.height} px at ${dpi} DPI`);
