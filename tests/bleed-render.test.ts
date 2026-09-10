import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { renderSheet } from '../src/lib/export';
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

async function decode(bytes: Uint8Array) {
  const image = await loadImage(bytes),
    canvas = createCanvas(image.width, image.height);
  canvas.getContext('2d').drawImage(image, 0, 0);
  return canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
}

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
