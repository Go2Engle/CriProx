import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { decodePDFRawStream, PDFArray, PDFDocument, PDFRawStream, rgb } from 'pdf-lib';
import { renderSheet } from '../src/lib/export';
import { buildManualCutCalibrationPdf, buildManualCutPdf } from '../src/lib/manual-cut';
import { buildRegisteredPdf } from '../src/lib/registered-pdf';
import { PT_PER_MM, registrationKey, type RegistrationProfile } from '../src/lib/registration';
import { DEFAULT_SETTINGS, type Entry } from '../src/lib/types';
import { mmToPx, type Sheet } from '../src/lib/layout';
import { repairTransparentCorners, replicateBorder } from '../src/lib/bleed';

test('corner repair blends a varying border without an abrupt arc or changes to opaque artwork', () => {
  const width = 200,
    height = 280;
  const canvas = createCanvas(width, height),
    ctx = canvas.getContext('2d');
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 14);
  ctx.clip();
  const gradient = ctx.createLinearGradient(0, 0, 40, 50);
  gradient.addColorStop(0, '#e6b879');
  gradient.addColorStop(1, '#63384f');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const image = ctx.getImageData(0, 0, width, height);
  const original = image.data.slice();
  // An interior transparency feature must not be interpreted as a missing corner.
  image.data[(50 * width + 50) * 4 + 3] = 0;
  repairTransparentCorners(image.data, width, height);
  assert.equal(image.data[(50 * width + 50) * 4 + 3], 0);
  for (let i = 0; i < original.length; i += 4) {
    if (original[i + 3] === 255 && i !== (50 * width + 50) * 4)
      assert.deepEqual(image.data.slice(i, i + 4), original.slice(i, i + 4));
  }
  let maximumStep = 0;
  for (let y = 0; y < 20; y++)
    for (let x = 0; x < 20; x++) {
      const at = (y * width + x) * 4;
      assert.equal(image.data[at + 3], 255);
      for (const neighbor of [x ? at - 4 : at, y ? at - width * 4 : at])
        for (let c = 0; c < 3; c++)
          maximumStep = Math.max(
            maximumStep,
            Math.abs(image.data[at + c] - image.data[neighbor + c]),
          );
    }
  assert.ok(maximumStep <= 4, `Visible color step in corner: ${maximumStep}`);
});

test('corner repair is a no-op for opaque artwork and preserves a uniform border in every corner', () => {
  const width = 200,
    height = 280,
    canvas = createCanvas(width, height),
    ctx = canvas.getContext('2d');
  ctx.fillStyle = '#e5ad72';
  ctx.fillRect(0, 0, width, height);
  const opaque = ctx.getImageData(0, 0, width, height),
    expected = opaque.data.slice();
  repairTransparentCorners(opaque.data, width, height);
  assert.deepEqual(opaque.data, expected);
  ctx.clearRect(0, 0, width, height);
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, 14);
  ctx.clip();
  ctx.fillRect(0, 0, width, height);
  const rounded = ctx.getImageData(0, 0, width, height);
  repairTransparentCorners(rounded.data, width, height);
  for (let i = 0; i < rounded.data.length; i += 4) {
    assert.equal(rounded.data[i + 3], 255);
    for (let c = 0; c < 3; c++) assert.ok(Math.abs(rounded.data[i + c] - expected[i + c]) <= 1);
  }
});

test('padding preserves every original pixel and exactly continues all four edges and corners', () => {
  const width = 9,
    height = 13,
    pad = 4;
  const source = Uint8ClampedArray.from({ length: width * height * 4 }, (_, i) => (i * 37) % 256);
  const original = source.slice();
  const padded = replicateBorder(source, width, height, pad);
  for (let y = 0; y < height + 2 * pad; y++)
    for (let x = 0; x < width + 2 * pad; x++) {
      const fromX = Math.max(0, Math.min(width - 1, x - pad));
      const fromY = Math.max(0, Math.min(height - 1, y - pad));
      const from = (fromY * width + fromX) * 4,
        to = (y * (width + 2 * pad) + x) * 4;
      assert.deepEqual(padded.slice(to, to + 4), source.slice(from, from + 4));
    }
  assert.deepEqual(source, original);
});

// Run the production canvas renderer, including PNG encoding and sheet transforms.
Object.defineProperty(globalThis, 'document', {
  configurable: true,
  value: { createElement: () => createCanvas(1, 1) },
});
Object.defineProperty(globalThis, 'createImageBitmap', {
  configurable: true,
  value: async (blob: Blob) => {
    const image = await loadImage(Buffer.from(await blob.arrayBuffer()));
    return Object.assign(image, { close() {} });
  },
});

test('manual cut calibration sheet uses the production raster path on an actual-size page', async () => {
  const bytes = await buildManualCutCalibrationPdf({
      version: 1,
      name: 'Calibration test',
      entries: [],
      settings: { ...DEFAULT_SETTINGS, profile: 'nine' },
    }),
    document = await PDFDocument.load(bytes),
    page = document.getPage(0);
  assert.equal(document.getPageCount(), 1);
  assert.ok(Math.abs(page.getWidth() - 612) < 0.001);
  assert.ok(Math.abs(page.getHeight() - 792) < 0.001);
  assert.match(document.getTitle() || '', /Manual cut calibration - X \+0\.00 mm, Y \+0\.00 mm$/);
});

function artwork(color: string, detailed = false, rounded = false): Entry {
  const canvas = createCanvas(630, 880),
    ctx = canvas.getContext('2d');
  if (rounded) {
    ctx.beginPath();
    ctx.roundRect(0, 0, 630, 880, 30);
    ctx.clip();
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 630, 880);
  if (detailed) {
    // Detail close enough to the edge to be picked up by mirrored bleed.
    ctx.fillStyle = '#ff0033';
    ctx.fillRect(3, 3, 624, 874);
  }
  const image = canvas.toDataURL('image/png');
  return {
    id: 'qa',
    quantity: 1,
    face: 0,
    card: {
      id: 'qa',
      name: 'Bleed QA',
      set: 'qa',
      setName: 'QA',
      collector: '1',
      faces: [{ name: 'Bleed QA', image, preview: image }],
    },
  };
}

test('manual front PDF prints paper-edge vector guides while backs stay unmarked', async () => {
  const entry = artwork('#111111');
  const project = {
    version: 1 as const,
    name: 'Manual guide test',
    entries: [entry],
    settings: {
      ...DEFAULT_SETTINGS,
      machine: 'manual' as const,
      profile: 'nine' as const,
      manualGuideColor: '#ff0000',
    },
    backArtwork: entry.card.faces[0],
  };
  const operators = async (bytes: Uint8Array) => {
    const document = await PDFDocument.load(bytes),
      contents = document.getPage(0).node.Contents();
    assert.ok(contents instanceof PDFArray);
    return Array.from({ length: contents.size() }, (_, index) => {
      const stream = contents.lookup(index, PDFRawStream);
      return new TextDecoder().decode(decodePDFRawStream(stream).decode());
    }).join('\n');
  };
  const front = await operators(await buildManualCutPdf(project, () => {})),
    back = await operators(await buildManualCutPdf(project, () => {}, true));
  assert.equal(front.match(/\nS\n/g)?.length, 8);
  assert.match(front, /1 0 0 RG/);
  assert.doesNotMatch(back, /1 0 0 RG/);
  const customized = await operators(
    await buildManualCutPdf(
      {
        ...project,
        settings: {
          ...project.settings,
          manualGuidePageStyle: 'none',
          manualGuideCardStyle: 'full',
          manualGuideLineStyle: 'dashed',
        },
      },
      () => {},
    ),
  );
  assert.equal(customized.match(/\nS\n/g)?.length, 4);
  assert.match(customized, /\[[\d.]+ [\d.]+\] 0 d/);
});

async function decode(bytes: Uint8Array) {
  const image = await loadImage(bytes),
    canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
}

function mpcArtworkWithNativeBleed(): Entry {
  const canvas = createCanvas(816, 1110),
    ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0033';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#2457e6';
  ctx.fillRect(36, 36, 744, 1038);
  const image = canvas.toDataURL('image/png');
  return {
    id: 'mpc-back',
    quantity: 1,
    face: 0,
    card: {
      id: 'mpc-back',
      name: 'MPC card back',
      set: 'back',
      setName: 'Project card back',
      collector: '',
      faces: [{ name: 'MPC card back', image, preview: image, trim: 'mpc' }],
    },
  };
}

function colorAtMm(
  image: Awaited<ReturnType<typeof decode>>,
  widthMm: number,
  heightMm: number,
  xMm: number,
  yMm: number,
) {
  const x = Math.max(0, Math.min(image.width - 1, Math.floor((xMm / widthMm) * image.width))),
    y = Math.max(0, Math.min(image.height - 1, Math.floor((yMm / heightMm) * image.height))),
    offset = (y * image.width + x) * 4;
  return Array.from(image.data.slice(offset, offset + 4));
}

test('MPC fronts and card backs crop native source bleed from the finished card', async () => {
  const entry = mpcArtworkWithNativeBleed(),
    sheet: Sheet = {
      index: 0,
      width: 63,
      height: 88,
      placements: [{ entry, copy: 0, x: 0, y: 0, width: 63, height: 88, rotated: false }],
    },
    image = await decode(
      await renderSheet(sheet, { ...DEFAULT_SETTINGS, proxyLabel: false }, false, 0),
    );

  for (const [x, y] of [
    [1, 1],
    [31.5, 44],
    [62, 87],
  ])
    assert.deepEqual(colorAtMm(image, 63, 88, x, y), [36, 87, 230, 255]);
});

test('MPC fronts and card backs reuse native artwork outside the trim for output bleed', async () => {
  const entry = mpcArtworkWithNativeBleed(),
    sheet: Sheet = {
      index: 0,
      width: 64,
      height: 89,
      placements: [{ entry, copy: 0, x: 0.5, y: 0.5, width: 63, height: 88, rotated: false }],
    },
    image = await decode(
      await renderSheet(sheet, { ...DEFAULT_SETTINGS, proxyLabel: false }, false, 0.5),
    );

  assert.deepEqual(colorAtMm(image, 64, 89, 0.1, 44.5), [255, 0, 51, 255]);
  assert.deepEqual(colorAtMm(image, 64, 89, 32, 44.5), [36, 87, 230, 255]);
  assert.deepEqual(colorAtMm(image, 64, 89, 63.9, 44.5), [255, 0, 51, 255]);
});

test('Silhouette four- and eight-card PDFs extend artwork without moving saved cuts', async () => {
  const source = await PDFDocument.create();
  source
    .addPage([612, 792])
    .drawRectangle({ x: 25, y: 750, width: 12, height: 12, color: rgb(0, 0, 0) });
  const capturedPdf = await source.save();
  const entry = artwork('#2457e6');
  for (const layoutProfile of ['expanded', 'eight'] as const) {
    const baseSettings = {
      ...DEFAULT_SETTINGS,
      machine: 'silhouette' as const,
      profile: layoutProfile,
    };
    const profile: RegistrationProfile = {
      version: 1,
      key: registrationKey(baseSettings),
      name: 'Studio marks',
      capturedAt: '2026-09-29T00:00:00.000Z',
      pdf: capturedPdf,
      pageWidthPt: 612,
      pageHeightPt: 792,
      leftMm: layoutProfile === 'eight' ? 19.45 : 30,
      topMm: layoutProfile === 'eight' ? 12.2 : 32,
      preview: '',
    };
    const bounds = async (bleed: number) => {
      const settings = { ...baseSettings, bleed };
      assert.equal(registrationKey(settings), profile.key);
      const output = await buildRegisteredPdf(
        { version: 1, name: 'Bleed check', entries: [entry], settings },
        profile,
        () => {},
      );
      const page = (await PDFDocument.load(output)).getPage(0);
      const contents = page.node.Contents();
      assert.ok(contents instanceof PDFArray);
      const operators = Array.from({ length: contents.size() }, (_, index) =>
        new TextDecoder().decode(decodePDFRawStream(contents.lookup(index, PDFRawStream)).decode()),
      ).join('\n');
      const image = operators.match(
        /q\s+1 0 0 1 ([\d.]+) ([\d.]+) cm\s+1 0 0 1 0 0 cm\s+([\d.]+) 0 0 ([\d.]+) 0 0 cm\s+1 0 0 1 0 0 cm\s+\/Image-[\d]+ Do/,
      );
      assert.ok(image, 'Expected a positioned artwork PNG in the registered PDF');
      return {
        width: Number(image[3]),
        height: Number(image[4]),
        x: Number(image[1]),
        y: Number(image[2]),
      };
    };
    const off = await bounds(0);
    const on = await bounds(0.5);
    assert.ok(Math.abs(on.width - off.width - PT_PER_MM) < 0.01);
    assert.ok(Math.abs(on.height - off.height - PT_PER_MM) < 0.01);
    assert.ok(Math.abs(off.x - on.x - 0.5 * PT_PER_MM) < 0.01);
    assert.ok(Math.abs(off.y - on.y - 0.5 * PT_PER_MM) < 0.01);
  }
});

function pngPixelsPerMeter(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 8; offset < bytes.length;) {
    const length = view.getUint32(offset),
      type = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8));
    if (type === 'pHYs') return view.getUint32(offset + 8);
    offset += length + 12;
  }
  return undefined;
}

test('production renderer emits the selected dimensions and PNG density at 900 and 1200 DPI', async () => {
  const width = 6.3,
    height = 8.8,
    entry = artwork('#7c5cff'),
    sheet: Sheet = {
      index: 0,
      width,
      height,
      placements: [{ entry, copy: 0, x: 0, y: 0, width, height, rotated: false }],
    };
  for (const dpi of [900, 1200] as const) {
    const bytes = await renderSheet(sheet, {
        ...DEFAULT_SETTINGS,
        width,
        height,
        dpi,
        proxyLabel: false,
      }),
      image = await decode(bytes);
    assert.equal(image.width, mmToPx(width, dpi));
    assert.equal(image.height, mmToPx(height, dpi));
    assert.equal(pngPixelsPerMeter(bytes), Math.round(dpi / 0.0254));
  }
});

test('size-check renderer does not require artwork on template placements', async () => {
  const width = 6.3,
    height = 8.8,
    templateEntry: Entry = {
      id: 'template-slot',
      quantity: 1,
      face: 0,
      card: {
        id: 'template-slot',
        name: 'Template slot',
        set: 'local',
        setName: 'Template',
        collector: '',
        faces: [],
      },
    },
    sheet: Sheet = {
      index: 0,
      width,
      height,
      placements: [
        {
          entry: templateEntry,
          copy: 0,
          x: 0,
          y: 0,
          width,
          height,
          rotated: false,
        },
      ],
    },
    bytes = await renderSheet(
      sheet,
      { ...DEFAULT_SETTINGS, width, height, dpi: 300, proxyLabel: false },
      true,
    ),
    image = await decode(bytes);

  assert.equal(image.width, mmToPx(width, 300));
  assert.equal(image.height, mmToPx(height, 300));
});

test('white bleed copies the white edge without reflecting nearby colored artwork', async () => {
  const sheet: Sheet = {
    index: 0,
    width: 66,
    height: 91,
    placements: [
      {
        entry: artwork('#ffffff', true),
        copy: 0,
        x: 1.5,
        y: 1.5,
        width: 63,
        height: 88,
        rotated: false,
      },
    ],
  };
  const image = await decode(
    await renderSheet(sheet, { ...DEFAULT_SETTINGS, gap: 3, proxyLabel: false }, false, 1.5),
  );
  for (let y = 1; y < image.height - 1; y++)
    for (let x = 1; x < image.width - 1; x++) {
      const mmX = ((x + 0.5) * 66) / image.width,
        mmY = ((y + 0.5) * 91) / image.height;
      if (mmX > 1.3 && mmX < 64.7 && mmY > 1.3 && mmY < 89.7) continue;
      const i = (y * image.width + x) * 4;
      assert.deepEqual(
        Array.from(image.data.slice(i, i + 4)),
        [255, 255, 255, 255],
        `Non-white bleed at ${x}, ${y}`,
      );
    }
});

test('touching black bleed tiles have no translucent seams, including rotated backs', async () => {
  const entry = artwork('#000000');
  for (const dpi of [300, 600] as const)
    for (const rotated of [false, true]) {
      const bleed = 0.75,
        width = rotated ? 88 : 63,
        height = rotated ? 63 : 88;
      const sheet: Sheet = {
        index: 0,
        width: 2 * (width + 2 * bleed),
        height: 2 * (height + 2 * bleed),
        placements: [0, 1, 2, 3].map((i) => ({
          entry,
          copy: i,
          x: bleed + (i % 2) * (width + 2 * bleed),
          y: bleed + Math.floor(i / 2) * (height + 2 * bleed),
          width,
          height,
          rotated,
          artworkRotation: 180,
        })),
      };
      const image = await decode(
        await renderSheet(
          sheet,
          { ...DEFAULT_SETTINGS, dpi, gap: 1.5, proxyLabel: false },
          false,
          bleed,
        ),
      );
      for (let i = 0; i < image.data.length; i += 4) {
        assert.equal(
          image.data[i + 3],
          255,
          `Alpha seam: ${dpi} DPI, rotated=${rotated}, pixel=${i / 4}`,
        );
        assert.equal(
          image.data[i] + image.data[i + 1] + image.data[i + 2],
          0,
          `Non-black pixel ${i / 4}`,
        );
      }
    }
});

test('back sheets extend exterior bleed without widening the bleed between cards', async () => {
  const red = artwork('#d71920'),
    blue = artwork('#1647c8'),
    outer = 1.5,
    gap = 1,
    sheet: Sheet = {
      index: 0,
      width: 63 * 2 + gap + outer * 2,
      height: 88 + outer * 2,
      placements: [
        { entry: red, copy: 0, x: outer, y: outer, width: 63, height: 88, rotated: false },
        {
          entry: blue,
          copy: 0,
          x: outer + 63 + gap,
          y: outer,
          width: 63,
          height: 88,
          rotated: false,
        },
      ],
    },
    image = await decode(
      await renderSheet(
        sheet,
        { ...DEFAULT_SETTINGS, gap, proxyLabel: false },
        false,
        gap / 2,
        outer,
      ),
    );

  assert.deepEqual(colorAtMm(image, sheet.width, sheet.height, 0.1, 45.5), [215, 25, 32, 255]);
  assert.deepEqual(colorAtMm(image, sheet.width, sheet.height, 64.9, 45.5), [215, 25, 32, 255]);
  assert.deepEqual(colorAtMm(image, sheet.width, sheet.height, 65.1, 45.5), [22, 71, 200, 255]);
  assert.deepEqual(colorAtMm(image, sheet.width, sheet.height, 129.9, 45.5), [22, 71, 200, 255]);
});

test('transparent rounded white source corners remain white through the bleed', async () => {
  const sheet: Sheet = {
    index: 0,
    width: 66,
    height: 91,
    placements: [
      {
        entry: artwork('#ffffff', false, true),
        copy: 0,
        x: 1.5,
        y: 1.5,
        width: 63,
        height: 88,
        rotated: false,
      },
    ],
  };
  const image = await decode(
    await renderSheet(sheet, { ...DEFAULT_SETTINGS, gap: 3, proxyLabel: false }, false, 1.5),
  );
  for (let i = 0; i < image.data.length; i++)
    assert.equal(image.data[i], 255, `White/alpha defect at channel ${i}`);
});
