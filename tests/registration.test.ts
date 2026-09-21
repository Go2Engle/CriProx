import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PDFDocument } from 'pdf-lib';
import { DEFAULT_SETTINGS, type Entry } from '../src/lib/types';
import { buildBackAlignmentPdfs, mirroredBackSheet } from '../src/lib/registered-pdf';
import {
  alignmentArtworkDirection,
  backAlignmentCorrection,
  detectTemplate,
  fixedSheets,
  fullTemplate,
  mirrorBackPlacements,
  registrationKey,
} from '../src/lib/registration';
const entry = {
  id: 'a',
  quantity: 7,
  face: 0,
  card: { id: 'x', name: 'x', set: 'x', setName: 'x', collector: '1', faces: [] },
} satisfies Entry;
test('registration layout keeps full bounds and unused slots blank on partial pages', () => {
  const sheets = fixedSheets([entry], DEFAULT_SETTINGS);
  assert.equal(sheets.length, 2);
  assert.equal(sheets[1].placements.length, 1);
  assert.equal(sheets[1].width, sheets[0].width);
  assert.equal(sheets[1].height, sheets[0].height);
  assert.equal(sheets[1].placements[0].x, 0);
  assert.equal(sheets[1].placements[0].y, 0);
});
test('capture identity follows cutting geometry and target, not artwork output options', () => {
  const key = registrationKey(DEFAULT_SETTINGS);
  assert.equal(
    key,
    registrationKey({
      ...DEFAULT_SETTINGS,
      dpi: 600,
      proxyLabel: false,
      units: 'mm',
      bleed: 1.5,
      backBleedEnabled: false,
      backsEnabled: true,
      backPrintMode: 'duplex',
      backFlip: 'short-edge',
      backOffsetX: 1,
      backOffsetY: -1,
      manualCutCorrectionX: 0.5,
      manualCutCorrectionY: 1.75,
    }),
  );
  for (const change of [
    { gap: 4 },
    { radius: 2 },
    { width: 63.5, height: 88.9 },
    { paper: 'a4' as const },
    { machine: 'explore' as const },
    { profile: 'seven' as const, gap: 0.1, bleed: 0.05 },
    { profile: 'nine' as const },
  ])
    assert.notEqual(key, registrationKey({ ...DEFAULT_SETTINGS, ...change }));
});
test('back placements mirror only across the selected paper flip edge', () => {
  const full = fullTemplate(DEFAULT_SETTINGS),
    partial = fixedSheets([{ ...entry, quantity: 1 }], DEFAULT_SETTINGS)[0],
    placement = partial.placements[0];
  const long = mirrorBackPlacements(partial, full, 'long-edge').placements[0];
  assert.equal(long.x, full.width - placement.x - placement.width);
  assert.equal(long.y, placement.y);
  const short = mirrorBackPlacements(partial, full, 'short-edge').placements[0];
  assert.equal(short.x, placement.x);
  assert.equal(short.y, full.height - placement.y - placement.height);
  const rotated = mirrorBackPlacements(partial, full, 'long-edge', 180).placements[0];
  assert.equal(rotated.x, long.x);
  assert.equal(rotated.y, long.y);
  assert.equal(rotated.artworkRotation, 180);
});
test('back sheets use each double-sided card reverse face and shared art for other cards', () => {
  const front = {
      name: 'Delver of Secrets',
      image: 'https://cards.scryfall.io/front.png',
      preview: 'https://cards.scryfall.io/front.png',
    },
    reverse = {
      name: 'Insectile Aberration',
      image: 'https://cards.scryfall.io/reverse.png',
      preview: 'https://cards.scryfall.io/reverse.png',
      trim: 'mpc' as const,
    },
    doubleSided: Entry = {
      ...entry,
      id: 'double-sided',
      quantity: 1,
      card: {
        ...entry.card,
        id: 'delver',
        name: 'Delver of Secrets // Insectile Aberration',
        faces: [front, reverse],
      },
    },
    singleSided: Entry = {
      ...entry,
      id: 'single-sided',
      quantity: 1,
      card: { ...entry.card, id: 'island', name: 'Island', faces: [front] },
    },
    sharedBack = {
      name: 'Shared back',
      image: 'https://cdn.mpcautofill.com/images/google_drive/full/back.jpg?dpi=1200',
      preview: 'https://cdn.mpcautofill.com/images/google_drive/large/back.jpg',
      trim: 'mpc' as const,
    },
    project = {
      version: 1 as const,
      name: 'Mixed faces',
      entries: [doubleSided, singleSided],
      settings: { ...DEFAULT_SETTINGS, backsEnabled: true },
      backArtwork: sharedBack,
    },
    full = fullTemplate(project.settings),
    source = fixedSheets(project.entries, project.settings)[0],
    back = mirroredBackSheet(source, full, project);

  assert.equal(back.placements[0].entry.card.id, 'delver');
  assert.equal(back.placements[0].entry.face, 1);
  assert.equal(back.placements[0].entry.card.faces[1], reverse);
  assert.equal(back.placements[1].entry.card.faces[0], sharedBack);
  assert.equal(back.placements[0].entry.card.faces[1].trim, 'mpc');
  assert.equal(back.placements[1].entry.card.faces[0].trim, 'mpc');
  assert.equal(
    back.placements[0].x,
    full.width - source.placements[0].x - source.placements[0].width,
  );
  assert.equal(back.placements[0].y, source.placements[0].y);
});
test('alignment square measurements move backs opposite the observed error', () => {
  assert.deepEqual(backAlignmentCorrection(2, 'right', 1.5, 'down'), { x: -2, y: -1.5 });
  assert.deepEqual(backAlignmentCorrection(0.5, 'left', 3, 'up'), { x: 0.5, y: 3 });
});
test('alignment arrows follow the final sheet artwork direction', () => {
  assert.equal(alignmentArtworkDirection({ ...DEFAULT_SETTINGS, profile: 'expanded' }), 'right');
  assert.equal(
    alignmentArtworkDirection({ ...DEFAULT_SETTINGS, profile: 'expanded' }, true),
    'left',
  );
  assert.equal(
    alignmentArtworkDirection({ ...DEFAULT_SETTINGS, profile: 'expanded', backRotation: 0 }, true),
    'right',
  );
  const seven = { ...DEFAULT_SETTINGS, profile: 'seven' as const, gap: 0.1, bleed: 0.05 };
  assert.equal(alignmentArtworkDirection(seven), 'up');
  assert.equal(alignmentArtworkDirection(seven, true), 'down');
});
test('front-to-back alignment sheets are single-page, actual-size PDFs', async () => {
  const pages = await buildBackAlignmentPdfs({
      version: 1,
      name: 'Alignment test',
      entries: [],
      settings: DEFAULT_SETTINGS,
    }),
    front = await PDFDocument.load(pages.front),
    back = await PDFDocument.load(pages.back);
  assert.equal(front.getPageCount(), 1);
  assert.equal(back.getPageCount(), 1);
  assert.ok(Math.abs(front.getPage(0).getWidth() - 612) < 0.001);
  assert.ok(Math.abs(front.getPage(0).getHeight() - 792) < 0.001);
  assert.match(front.getTitle() || '', /Front$/);
  assert.match(back.getTitle() || '', /Back$/);
});
function fixture(
  scale = 1,
  missingSlot = false,
  marks = true,
  filled = false,
  settings = DEFAULT_SETTINGS,
  left = 24,
  top = 30,
) {
  const w = 864,
    h = 1118,
    sx = w / 215.9,
    sy = h / 279.4;
  const data = new Uint8ClampedArray(w * h * 4).fill(255),
    sheet = fullTemplate(settings);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const mx = ((x + 0.5) / sx - left) / scale,
        my = ((y + 0.5) / sy - top) / scale;
      let inside = filled && mx >= 0 && my >= 0 && mx <= sheet.width && my <= sheet.height;
      for (const [index, p] of sheet.placements.entries()) {
        if (missingSlot && index === 3) continue;
        const r = settings.radius,
          qx = Math.abs(mx - p.x - p.width / 2) - (p.width / 2 - r),
          qy = Math.abs(my - p.y - p.height / 2) - (p.height / 2 - r);
        if (Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r < 0)
          inside = true;
      }
      if (inside) {
        const i = (y * w + x) * 4;
        data[i] = 230;
        data[i + 1] = 0;
        data[i + 2] = 200;
      }
      if (
        marks &&
        ((x > 40 && x < 80 && y > 40 && y < 48) ||
          (x > w - 80 && x < w - 40 && y > h - 48 && y < h - 40))
      ) {
        const i = (y * w + x) * 4;
        data[i] = data[i + 1] = data[i + 2] = 0;
      }
    }
  return { data, w, h };
}
test('capture detects translated template within raster precision', () => {
  const f = fixture();
  const p = detectTemplate(f.data, f.w, f.h, 215.9, 279.4, DEFAULT_SETTINGS);
  assert.ok(Math.abs(p.leftMm - 24) < 0.15);
  assert.ok(Math.abs(p.topMm - 30) < 0.15);
});
test('capture recognizes the seven-card 2-3-2 pattern on Letter', () => {
  const settings = {
      ...DEFAULT_SETTINGS,
      profile: 'seven' as const,
      gap: 0.1,
      bleed: 0.05,
    },
    f = fixture(1, false, true, false, settings, 13, 32),
    p = detectTemplate(f.data, f.w, f.h, 215.9, 279.4, settings);
  assert.ok(Math.abs(p.leftMm - 13) < 0.15);
  assert.ok(Math.abs(p.topMm - 32) < 0.15);
});
test('capture rejects scaling, missing/rearranged slots, filled gaps and absent marks', () => {
  for (const f of [
    fixture(0.97),
    fixture(1, true),
    fixture(1, false, false),
    fixture(1, false, true, true),
  ])
    assert.throws(() => detectTemplate(f.data, f.w, f.h, 215.9, 279.4, DEFAULT_SETTINGS));
});
