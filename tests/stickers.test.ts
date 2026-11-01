import { TAPERED_SETTINGS } from './fixtures/tapered-settings';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { PDFDocument, rgb } from 'pdf-lib';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { validateStickerSvg } from '../src/lib/sticker-svg';
import { grid } from '../src/lib/layout';
import { detectTemplate, fullTemplate } from '../src/lib/registration';
import {
  newStickerProject,
  fillStickerSheet,
  changeStickerSettings,
  parseStickerProject,
  stickerSheets,
  stickerGeometryKey,
  stickerLayoutSettings,
  stickerTemplate,
  validateStickerProject,
  appendSticker,
  arrangeStickers,
  duplicateSticker,
  editSticker,
  removeStickers,
  stickerBounds,
  stickerPoses,
  hasStickerOverlap,
} from '../src/lib/stickers';
import {
  buildStickerHandoff,
  buildStickerPdf,
  bytesToBase64,
  renderStickerSheet,
  stickerCutSvg,
} from '../src/lib/sticker-output';

Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: {
    createElement: () => {
      const canvas = createCanvas(1, 1);
      Object.assign(canvas, {
        toBlob: (callback: (blob: Blob) => void) =>
          callback(
            new Blob([Uint8Array.from(canvas.toBuffer('image/png')).buffer], { type: 'image/png' }),
          ),
      });
      return canvas;
    },
  },
});
Object.defineProperty(globalThis, 'createImageBitmap', {
  configurable: true,
  value: async (blob: Blob) => {
    const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
    return Object.assign(image, { close() {} });
  },
});
function fixture() {
  const canvas = createCanvas(100, 50),
    ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f00';
  ctx.fillRect(0, 0, 50, 50);
  const p = newStickerProject();
  p.artwork = [
    { id: 'red', name: 'Red sticker', image: canvas.toDataURL('image/png') },
    { id: 'blue', name: 'Another sticker', image: canvas.toDataURL('image/png') },
  ];
  p.items = ['red'];
  return p;
}
test('individual sticker edits round-trip locally and do not change other copies', () => {
  let p = appendSticker(fixture(), 'red', { width: 30, height: 20 });
  const first = { ...stickerPoses(p)[0] };
  p = editSticker(p, 1, {
    x: 60,
    y: 70,
    width: 32,
    height: 15,
    rotation: -90,
    flipX: true,
    flipY: true,
    radius: 2,
  });
  const saved = parseStickerProject(JSON.stringify(p));
  assert.deepEqual(saved, JSON.parse(JSON.stringify(p)));
  assert.deepEqual(saved.poses![0], first);
  assert.equal(saved.poses![1].rotation, 270);
  assert.equal(saved.capture, undefined);
  assert.throws(() => editSticker(saved, 1, { x: 179 }), /fit inside/);
  assert.throws(() => editSticker(saved, 1, { rotation: NaN }), /finite/);
  assert.throws(() => validateStickerProject({ ...saved, poses: [] }), /placements/);
  assert.throws(() => validateStickerProject({ ...saved, capture: {} }), /new Design Space/);
});
test('54 individual mixed designs auto arrange without overlap or loss of sizes and transforms', () => {
  let p = fixture();
  p.items = [];
  for (let i = 0; i < 54; i++)
    p = appendSticker(p, i % 2 ? 'blue' : 'red', { width: 42.5, height: 14.5 });
  p = editSticker(p, 1, { rotation: 30, flipX: true });
  const arranged = arrangeStickers(p);
  assert.equal(arranged.items.length, 54);
  assert.deepEqual(arranged.items, p.items);
  assert.equal(hasStickerOverlap(arranged), false);
  assert.equal(arranged.poses![1].flipX, true);
  assert.equal(arranged.poses![1].rotation, 30);
  assert.equal(arranged.poses![1].width, 42.5);
  for (const pose of arranged.poses!) {
    const b = stickerBounds(pose);
    assert.ok(pose.x + b.width <= p.settings.areaWidth + 1e-7);
    assert.ok(pose.y + b.height <= p.settings.areaHeight + 1e-7);
  }
  const duplicate = duplicateSticker(arranged, 0);
  assert.equal(duplicate.items.length, 55);
  assert.equal(hasStickerOverlap(duplicate), true);
});
test('fill respects existing free positions and size, and deleting a page compacts remaining pages', () => {
  let p = editSticker(fixture(), 0, { x: 10, y: 10, width: 40, height: 20 });
  const original = { ...p.poses![0] };
  p = fillStickerSheet(p, 'red');
  assert.ok(p.items.length > 1);
  assert.deepEqual(p.poses![0], original);
  assert.equal(hasStickerOverlap(p), false);
  assert.deepEqual(fillStickerSheet(p, 'red'), p);
  p = editSticker(p, 1, { sheet: 2 });
  p = removeStickers(
    p,
    p.items.flatMap((_, i) => (i === 1 ? [] : [i])),
  );
  assert.equal(stickerSheets(p).length, 1);
  assert.equal(p.poses![0].sheet, 0);
  assert.equal(stickerSheets(removeStickers(p, [0])).length, 0);
});
test('rendered free stickers preserve rotation and mirror transforms in PNG, SVG, and CSV', async () => {
  const p = editSticker(fixture(), 0, {
    x: 10,
    y: 20,
    width: 40,
    height: 20,
    rotation: 90,
    flipX: true,
    radius: 0,
  });
  const sheet = stickerSheets(p)[0],
    image = await loadImage(Buffer.from(await renderStickerSheet(sheet, p)));
  const canvas = createCanvas(image.width, image.height),
    ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const sample = (x: number, y: number) => [
    ...ctx.getImageData(
      Math.round((x * p.settings.dpi) / 25.4),
      Math.round((y * p.settings.dpi) / 25.4),
      1,
      1,
    ).data,
  ];
  assert.deepEqual(sample(20, 30), [255, 255, 255, 255]);
  assert.deepEqual(sample(20, 50), [255, 0, 0, 255]);
  assert.equal(sample(5, 30)[3], 0);
  const svg = stickerCutSvg(sheet);
  assert.match(svg, /rotate\(90\)/);
  assert.match(svg, /width="40" height="20"/);
  const zip = await JSZip.loadAsync(await buildStickerHandoff(p, () => {}));
  assert.match(await zip.file('label-positions-mm.csv')!.async('string'), /false,90,true,false/);
  await assert.rejects(buildStickerPdf(p, {} as any), /freely arranged/);
});
test('legacy tapered projects retain their saved positions and distinct artwork', () => {
  const template = stickerTemplate(TAPERED_SETTINGS);
  assert.equal(template.placements.length, 54);
  assert.equal(template.width, 176);
  assert.equal(template.height, 245.5);
  const rows = readFileSync(new URL('./fixtures/sticker-54-positions.csv', import.meta.url), 'utf8')
    .trim()
    .split(/\r?\n/)
    .slice(1);
  assert.equal(rows.length, 54);
  rows.forEach((row, index) => {
    const [, x, y, width, height] = row
      .split(',')
      .map((value) => Number(value.replaceAll('"', '')));
    const placement = template.placements[index];
    for (const [actual, expected] of [
      [placement.x, x],
      [placement.y, y],
      [placement.width, width],
      [placement.height, height],
    ])
      assert.ok(Math.abs(actual - expected) < 1e-8, `label ${index + 1}: ${actual} vs ${expected}`);
  });
  const p = fixture();
  p.settings = { ...TAPERED_SETTINGS };
  p.artwork = Array.from({ length: 54 }, (_, i) => ({
    ...p.artwork[0],
    id: `label-${i}`,
    name: `Label ${i + 1}`,
  }));
  p.items = p.artwork.map((a) => a.id);
  assert.equal(stickerSheets(validateStickerProject(p)).length, 1);
  assert.deepEqual(parseStickerProject(JSON.stringify(p)).items, p.items);
});
test('plain SVG accepts accessible paths and internal gradients but rejects scripts and outside resources', () => {
  validateStickerSvg(
    '<svg xmlns="http://www.w3.org/2000/svg" width="42.5mm" height="14.5mm"><g aria-label="Label"><path style="fill:#fff;stroke-width:1" d="M0 0H10V10Z"/></g></svg>',
  );
  validateStickerSvg(
    '<svg><defs><linearGradient id="paint"><stop offset="0" stop-color="red"/></linearGradient></defs><rect fill="url(#paint)" width="10" height="10"/></svg>',
  );
  for (const source of [
    '<svg><script>alert(1)</script></svg>',
    '<svg onload="bad()"/>',
    '<svg><image href="https://example.com/a.png"/></svg>',
    '<svg><foreignObject/></svg>',
    '<svg><path style="fill:url(https://example.com/a)"/></svg>',
    '<svg><path style="fill:u&#114;l(https://example.com/a)"/></svg>',
    '<!DOCTYPE svg><svg/>',
    '<svg><path style="background:red"/></svg>',
  ])
    assert.throws(() => validateStickerSvg(source));
});
test('fill preserves order, repeats selection, and does not append a sheet when full', () => {
  const p = fixture(),
    capacity = grid(stickerLayoutSettings(p.settings)).capacity;
  const filled = fillStickerSheet(p, 'blue');
  assert.equal(filled.items.length, capacity);
  assert.equal(filled.items[0], 'red');
  assert.ok(filled.items.slice(1).every((id) => id === 'blue'));
  assert.equal(fillStickerSheet(filled), filled);
  const empty = { ...p, items: [] };
  assert.deepEqual(fillStickerSheet(empty).items.slice(0, 4), ['red', 'blue', 'red', 'blue']);
  assert.throws(() => fillStickerSheet(p, 'unknown'), /select/);
  const limited = fillStickerSheet({ ...p, items: Array(499).fill('red') });
  assert.equal(limited.items.length, 500);
  assert.equal(fillStickerSheet(limited), limited);
});
test('captured templates retain fixed slots and their original pagination', () => {
  for (const [width, height] of [
    [10, 10],
    [70, 40],
    [180, 220],
    [30, 100],
  ]) {
    const p = fixture();
    p.settings = { ...p.settings, width, height };
    p.capture = { key: stickerGeometryKey(p.settings), name: 'fixture.pdf', pdf: btoa('%PDF-1.7') };
    const full = fillStickerSheet(p),
      sheets = stickerSheets({ ...full, items: [...full.items, 'blue'] });
    assert.equal(sheets.length, 2);
    assert.equal(sheets[0].width, sheets[1].width);
    assert.equal(sheets[0].height, sheets[1].height);
    assert.equal(sheets[1].placements[0].x, 0);
    assert.equal(sheets[1].placements[0].y, 0);
    for (const a of sheets[0].placements) {
      assert.ok(
        a.x >= 0 &&
          a.y >= 0 &&
          a.x + a.width <= sheets[0].width + 1e-8 &&
          a.y + a.height <= sheets[0].height + 1e-8,
      );
      for (const b of sheets[0].placements)
        if (a !== b)
          assert.ok(
            a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y,
          );
    }
  }
});
test('portable sticker files retain embedded art, item order and the original capture PDF', () => {
  let p = fixture();
  p.capture = {
    key: stickerGeometryKey(p.settings),
    name: 'template.pdf',
    pdf: btoa('%PDF-1.7\nfixture'),
  };
  p = fillStickerSheet(p);
  assert.deepEqual(parseStickerProject(JSON.stringify(p)), p);
  for (const key of ['width', 'height', 'gap', 'radius'] as const)
    assert.equal(
      changeStickerSettings(p, { ...p.settings, [key]: p.settings[key] + 1 }).capture,
      undefined,
    );
  assert.equal(changeStickerSettings(p, { ...p.settings, paper: 'a4' }).capture, undefined);
  assert.equal(
    changeStickerSettings(p, { ...p.settings, fit: 'cover', dpi: 600 }).capture,
    p.capture,
  );
});
test('reject malformed projects, remote art, missing IDs, nonfinite geometry, and foreign captures', () => {
  const p = fixture();
  for (const value of [
    null,
    {},
    { ...p, kind: 'cards' },
    { ...p, items: ['missing'] },
    { ...p, artwork: [...p.artwork, p.artwork[0]] },
    { ...p, items: Array(501).fill('red') },
    { ...p, artwork: [{ ...p.artwork[0], image: 'https://example.com/image.png' }] },
    ...[NaN, Infinity, -1, 0, 999].map((width) => ({ ...p, settings: { ...p.settings, width } })),
    { ...p, settings: { ...p.settings, radius: 21 } },
    { ...p, capture: { key: 'foreign', name: 'x', pdf: btoa('%PDF-1.7') } },
  ])
    assert.throws(() => validateStickerProject(value));
});
test('render keeps transparent gaps and corners, white interiors, and complete contained artwork', async () => {
  const p = fixture(),
    sheet = stickerSheets(p)[0],
    png = await renderStickerSheet(sheet, p),
    image = await loadImage(png);
  const canvas = createCanvas(image.width, image.height),
    ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const pixel = (x: number, y: number) =>
    Array.from(
      ctx.getImageData(Math.round((x * 300) / 25.4), Math.round((y * 300) / 25.4), 1, 1).data,
    );
  assert.equal(pixel(0, 0)[3], 0);
  assert.deepEqual(pixel(20, 5), [255, 255, 255, 255]);
  assert.deepEqual(pixel(5, 20), [255, 0, 0, 255]);
  assert.deepEqual(pixel(30, 20), [255, 255, 255, 255]);
  assert.equal(pixel(41, 20)[3], 0);
});
test('capture detector recognizes a sticker grid and rejects changed spacing or missing surrounding marks', () => {
  const p = fixture(),
    settings = stickerLayoutSettings(p.settings),
    full = fullTemplate(settings);
  const scale = 5,
    canvas = createCanvas(1080, 1400),
    ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1080, 1400);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#000';
  for (const [x, y] of [
    [10, 10],
    [200, 10],
    [10, 260],
    [200, 260],
  ])
    ctx.fillRect(x, y, 3, 3);
  ctx.fillStyle = '#e600c8';
  for (const s of full.placements) {
    ctx.beginPath();
    ctx.roundRect(20 + s.x, 25 + s.y, s.width, s.height, settings.radius);
    ctx.fill();
  }
  const data = () => ctx.getImageData(0, 0, 1080, 1400).data;
  const result = detectTemplate(data(), 1080, 1400, 216, 280, settings);
  assert.ok(Math.abs(result.leftMm - 20) < 0.2);
  assert.ok(Math.abs(result.topMm - 25) < 0.2);
  assert.throws(
    () => detectTemplate(data(), 1080, 1400, 216, 280, { ...settings, gap: 3 }),
    /measures|pattern/,
  );
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 216, 15);
  assert.throws(() => detectTemplate(data(), 1080, 1400, 216, 280, settings), /marks/);
});
test('registered output retains source page, exact artwork position, and partial-sheet dimensions', async () => {
  const p = fixture(),
    source = await PDFDocument.create(),
    page = source.addPage([612, 792]);
  page.drawRectangle({ x: 10, y: 10, width: 10, height: 10, color: rgb(0, 0, 0) });
  const profile = {
    version: 1 as const,
    key: stickerGeometryKey(p.settings),
    name: 'test.pdf',
    capturedAt: '',
    pdf: await source.save(),
    pageWidthPt: 612,
    pageHeightPt: 792,
    leftMm: 20,
    topMm: 25,
    preview: '',
  };
  const bytes = await buildStickerPdf(p, profile),
    pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 1);
  assert.deepEqual(pdf.getPage(0).getSize(), { width: 612, height: 792 });
  assert.equal(pdf.catalog.getOrCreateViewerPreferences().getPrintScaling(), 'None');
  assert.ok(pdf.getPage(0).node.Resources()?.toString().includes('XObject'));
  await assert.rejects(buildStickerPdf(p, { ...profile, key: 'wrong' }), /matching/);
  const restored = parseStickerProject(
    JSON.stringify({
      ...p,
      capture: {
        key: stickerGeometryKey(p.settings),
        name: 'test.pdf',
        pdf: bytesToBase64(profile.pdf),
      },
    }),
  );
  assert.equal(restored.capture?.pdf, bytesToBase64(profile.pdf));
});
test('tapered captures retain corner marks and clear unused slots in a rendered PDF', async () => {
  const p = fixture();
  p.settings = { ...TAPERED_SETTINGS, dpi: 300 };
  const full = stickerTemplate(p.settings),
    scale = 5,
    canvas = createCanvas(1080, 1400),
    ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 1080, 1400);
  ctx.scale(scale, scale);
  ctx.fillStyle = '#e600c8';
  for (const s of full.placements) {
    ctx.beginPath();
    ctx.roundRect(20 + s.x, 15 + s.y, s.width, s.height, 1);
    ctx.fill();
  }
  ctx.fillStyle = '#000';
  for (const [x, y] of [
    [22, 17],
    [188, 17],
    [22, 253],
    [188, 253],
  ])
    ctx.fillRect(x, y, 3, 3);
  const measured = detectTemplate(
    ctx.getImageData(0, 0, 1080, 1400).data,
    1080,
    1400,
    216,
    280,
    stickerLayoutSettings(p.settings),
    full,
  );
  assert.ok(Math.abs(measured.leftMm - 20) < 0.2);
  // Render at the same source millimeter scale, without rounding it to Letter in this fixture.
  const exactSource = await PDFDocument.create(),
    exactPage = exactSource.addPage([(216 * 72) / 25.4, (280 * 72) / 25.4]);
  exactPage.drawImage(await exactSource.embedPng(canvas.toBuffer('image/png')), {
    x: 0,
    y: 0,
    width: exactPage.getWidth(),
    height: exactPage.getHeight(),
  });
  const bytes = await buildStickerPdf(p, {
    version: 1,
    key: stickerGeometryKey(p.settings),
    name: 'synthetic',
    capturedAt: '',
    pdf: await exactSource.save(),
    pageWidthPt: exactPage.getWidth(),
    pageHeightPt: exactPage.getHeight(),
    leftMm: 20,
    topMm: 15,
    preview: '',
  });
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data: bytes });
  try {
    const doc = await task.promise,
      rendered = await doc.getPage(1),
      viewport = rendered.getViewport({ scale: 2 });
    const output = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
    await rendered.render({
      canvas: output as unknown as HTMLCanvasElement,
      canvasContext: output.getContext('2d') as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;
    const pixel = (x: number, y: number) =>
      Array.from(
        output
          .getContext('2d')
          .getImageData(Math.round(((x * 72) / 25.4) * 2), Math.round(((y * 72) / 25.4) * 2), 1, 1)
          .data,
      );
    for (const [x, y] of [
      [23, 18],
      [189, 18],
      [23, 254],
      [189, 254],
    ])
      assert.deepEqual(pixel(x, y), [0, 0, 0, 255]);
    assert.deepEqual(pixel(129, 22), [255, 255, 255, 255], 'unused magenta slot must be cleared');
  } finally {
    await task.destroy();
  }
});
test('handoff explains alpha-cropped partial dimensions and does not claim machine commands', async () => {
  const p = fixture(),
    zip = await JSZip.loadAsync(await buildStickerHandoff(p, () => {}));
  const instructions = await zip.file('READ-ME.txt')!.async('string');
  assert.match(instructions, /occupied artwork 40\.000 x 40\.000 mm/);
  assert.match(
    instructions,
    /Registration scanning, cutting, pause, and cancel still use Design Space/,
  );
  assert.ok(zip.file('sheet-01.png'));
  assert.ok(zip.file('sheet-01-cut-reference.svg'));
});
test('handoff dimensions match the rounded alpha silhouette after arbitrary rotation', async () => {
  const p = editSticker(fixture(), 0, { width: 40, height: 20, radius: 3, rotation: 45 });
  const zip = await JSZip.loadAsync(await buildStickerHandoff(p, () => {}));
  const dimension = ((40 + 20 - 12) * Math.SQRT1_2 + 6).toFixed(3);
  assert.ok(
    (await zip.file('READ-ME.txt')!.async('string')).includes(
      `occupied artwork ${dimension} x ${dimension} mm`,
    ),
  );
});
