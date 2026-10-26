import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import { DEFAULT_SETTINGS, type Project } from '../src/lib/types';
import {
  detectTemplate,
  fitTabloidCaptureToPaper,
  registrationKey,
  type RegistrationProfile,
} from '../src/lib/registration';

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: { createElement: () => createCanvas(1, 1) },
});
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const { buildRegisteredPdf } = await import('../src/lib/registered-pdf');
const settings = { ...DEFAULT_SETTINGS, profile: 'eight' as const, gap: 1, bleed: 0.5 };
// Public magenta setup capture attached by the reporter to issue #134:
// https://github.com/user-attachments/files/33916125/Tabloid1.pdf
const sourcePdf = new Uint8Array(
  await readFile(new URL('./fixtures/windows-eight-card-tabloid.pdf', import.meta.url)),
);

async function raster(pdf: Uint8Array, scale = 1) {
  const task = pdfjs.getDocument({ data: pdf.slice() });
  try {
    const doc = await task.promise,
      page = await doc.getPage(1),
      viewport = page.getViewport({ scale: 300 / 72 }),
      canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height)),
      ctx = canvas.getContext('2d');
    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      transform: [scale, 0, 0, scale, 0, 0],
      background: '#ffffff',
    }).promise;
    return {
      data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      width: canvas.width,
      height: canvas.height,
      pageWidthMm: (viewport.width / 300) * 25.4,
      pageHeightMm: (viewport.height / 300) * 25.4,
    };
  } finally {
    await task.destroy();
  }
}

test('Windows JPEG capture imports, fits Letter and replaces all magenta in the size-check PDF', async () => {
  const image = await raster(sourcePdf),
    detected = detectTemplate(
      image.data,
      image.width,
      image.height,
      image.pageWidthMm,
      image.pageHeightMm,
      settings,
    ),
    frame = fitTabloidCaptureToPaper(
      'letter',
      792,
      1224,
      detected.leftMm,
      detected.topMm,
      detected.contentBoundsMm,
    ),
    profile: RegistrationProfile = {
      version: 1,
      key: registrationKey(settings),
      name: 'Windows eight-card capture',
      capturedAt: '2026-10-25T00:00:00.000Z',
      pdf: sourcePdf,
      pageWidthPt: 792,
      pageHeightPt: 1224,
      leftMm: detected.leftMm,
      topMm: detected.topMm,
      outputFrame: frame,
      preview: '',
    },
    project: Project = {
      version: 1,
      name: 'Windows size check',
      settings,
      entries: [
        {
          id: 'size-check',
          quantity: 8,
          face: 0,
          card: { id: 'test', name: 'Test', set: '', setName: '', collector: '', faces: [] },
        },
      ],
    };
  assert.ok(frame.marginMm >= 1);
  const output = await buildRegisteredPdf(project, profile, () => {}, true),
    outputDoc = await PDFDocument.load(output);
  assert.equal(outputDoc.getPageCount(), 1);
  assert.ok(Math.abs(outputDoc.getPage(0).getWidth() - 612) < 0.001);
  assert.ok(Math.abs(outputDoc.getPage(0).getHeight() - 792) < 0.001);
  const rendered = await raster(output);
  let magentaPixels = 0;
  for (let i = 0; i < rendered.data.length; i += 4) {
    const [r, g, b] = rendered.data.subarray(i, i + 3);
    if (r > 145 && g < 105 && b > 125 && r > g * 1.7 && b > g * 1.5) magentaPixels++;
  }
  assert.equal(magentaPixels, 0, 'the captured magenta must be completely covered');
});

test('Windows JPEG capture still rejects enlarged and shrunken artwork', async () => {
  for (const scale of [0.995, 1.005]) {
    const image = await raster(sourcePdf, scale);
    assert.throws(
      () =>
        detectTemplate(
          image.data,
          image.width,
          image.height,
          image.pageWidthMm,
          image.pageHeightMm,
          settings,
        ),
      /captured template measures/,
      `a ${scale * 100}% print must be rejected`,
    );
  }
});
