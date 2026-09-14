import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { withDpi } from '../../src/lib/png';

const dpi = 600;
const sheetWidthMm = 176.1;
const sheetHeightMm = 252.3;
const cardWidthMm = 88;
const cardHeightMm = 63;
const gapMm = 0.1;
const radiusMm = 3;
const mmToPx = (mm: number) => Math.round((mm * dpi) / 25.4);

const canvas = createCanvas(mmToPx(sheetWidthMm), mmToPx(sheetHeightMm));
const context = canvas.getContext('2d');
context.scale(canvas.width / sheetWidthMm, canvas.height / sheetHeightMm);
context.fillStyle = '#e600c8';

for (let row = 0; row < 4; row++) {
  for (let column = 0; column < 2; column++) {
    context.beginPath();
    context.roundRect(
      column * (cardWidthMm + gapMm),
      row * (cardHeightMm + gapMm),
      cardWidthMm,
      cardHeightMm,
      radiusMm,
    );
    context.fill();
  }
}

const output = join(dirname(fileURLToPath(import.meta.url)), 'eight-card-letter-test-600dpi.png');
writeFileSync(output, withDpi(canvas.toBuffer('image/png'), dpi));
console.log(`${output}\n${canvas.width} × ${canvas.height} px at ${dpi} DPI`);
