import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CUT_PRESSURES, DEFAULT_CUT_SETTINGS, readCutSettings } from '../src/lib/cut-settings';
import { DEFAULT_SETTINGS } from '../src/lib/types';
import { validateProject } from '../src/lib/project';
import {
  newStickerProject,
  validateStickerProject,
  changeStickerSettings,
  stickerGeometryKey,
} from '../src/lib/stickers';
import { registrationKey } from '../src/lib/registration';

const card = () => ({
  version: 1,
  name: 'Cut settings',
  entries: [],
  settings: { ...DEFAULT_SETTINGS },
});

test('card and sticker files round-trip pressure and pass count independently', () => {
  for (const cutPressure of CUT_PRESSURES)
    for (const cutPasses of [1, 3, 10]) {
      const cards = card(),
        stickers = newStickerProject();
      Object.assign(cards.settings, { cutPressure, cutPasses });
      Object.assign(stickers.settings, { cutPressure, cutPasses });
      assert.deepEqual(
        readCutSettings(validateProject(JSON.parse(JSON.stringify(cards))).settings),
        { cutPressure, cutPasses, cutMaterial: 'white-sticker-paper' },
      );
      assert.deepEqual(
        readCutSettings(validateStickerProject(JSON.parse(JSON.stringify(stickers))).settings),
        { cutPressure, cutPasses, cutMaterial: 'white-sticker-paper' },
      );
    }
});

test('older card and sticker projects receive Medium pressure and one pass', () => {
  for (const [project, validate] of [
    [card(), validateProject],
    [newStickerProject(), validateStickerProject],
  ] as const) {
    const legacy = JSON.parse(JSON.stringify(project));
    delete legacy.settings.cutPressure;
    delete legacy.settings.cutPasses;
    delete legacy.settings.cutMaterial;
    assert.deepEqual(readCutSettings(validate(legacy).settings), DEFAULT_CUT_SETTINGS);
  }
});

test('imported cut settings reject invalid presets and fractional, unbounded, or non-numeric passes', () => {
  for (const patch of [
    { cutPressure: 'extreme' },
    { cutPressure: null },
    ...[0, -1, 11, 1.5, '2', null, NaN, Infinity].map((cutPasses) => ({ cutPasses })),
  ]) {
    const cards = card(),
      stickers = newStickerProject();
    Object.assign(cards.settings, patch);
    Object.assign(stickers.settings, patch);
    assert.throws(() => validateProject(cards), /cut pressure|cut passes/);
    assert.throws(() => validateStickerProject(stickers), /cut pressure|cut passes/);
  }
});

test('cut settings do not invalidate print geometry or captured sticker templates', () => {
  const before = newStickerProject();
  before.capture = { key: stickerGeometryKey(before.settings), name: 'Template', pdf: 'JVBERi0=' };
  const after = changeStickerSettings(before, {
    ...before.settings,
    cutPressure: 'hard',
    cutPasses: 4,
  });
  assert.equal(after.capture, before.capture);
  assert.equal(stickerGeometryKey(after.settings), stickerGeometryKey(before.settings));
  assert.equal(
    registrationKey(DEFAULT_SETTINGS),
    registrationKey({ ...DEFAULT_SETTINGS, cutPressure: 'light', cutPasses: 2 }),
  );
});
