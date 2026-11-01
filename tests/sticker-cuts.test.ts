import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  newDesign,
  newElement,
  designSvg,
  validateStickerDesign,
  SHAPES,
} from '../src/lib/sticker-design';
import { designCutPaths, stickerLocalCuts, pathSvg } from '../src/lib/sticker-cuts';
import { newStickerProject, appendSticker, parseStickerProject } from '../src/lib/stickers';
const require = createRequire(import.meta.url),
  { prepareSheetJob } = require('../electron/cutter/sheet-job.cjs'),
  fixture = require('./fixtures/sheet-job.cjs');
test('cut layers stay editable in local files and never become printed ink', () => {
  const d = newDesign();
  d.elements = [{ ...newElement('shape', d), operation: 'cut', shape: 'ellipse' }];
  assert.equal(designCutPaths(d)[0].closed, true);
  assert.equal(designCutPaths(d)[0].points.length, 128);
  assert.ok(!designSvg(d).includes('<path'));
  let p = newStickerProject();
  p.artwork = [{ id: 'a', name: 'Oval', image: 'data:image/png;base64,AAAA', design: d }];
  p = appendSticker(p, 'a');
  assert.deepEqual(parseStickerProject(JSON.stringify(p)).artwork[0].design, d);
  for (const shape of SHAPES)
    assert.ok(
      designCutPaths({ ...d, elements: [{ ...d.elements[0], shape }] })[0].points.length >= 3,
    );
});
test('custom path transforms share artwork fit, mirrors, flips and reject cropped or out-of-bounds cuts', () => {
  const d = newDesign(40, 20);
  d.elements = [
    {
      ...newElement('draw', d),
      operation: 'cut',
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      closed: false,
    },
  ];
  const pose = {
    sheet: 0,
    x: 0,
    y: 0,
    width: 80,
    height: 40,
    rotation: 0,
    radius: 3,
    flipX: true,
    flipY: true,
  };
  const path = stickerLocalCuts(d, pose, 'contain')[0];
  assert.ok(Math.abs(path.points[0].x - 80) < 0.1 && Math.abs(path.points[0].y - 40) < 0.1);
  assert.ok(Math.abs(path.points[1].x) < 0.1 && Math.abs(path.points[1].y) < 0.1);
  assert.ok(!pathSvg(path).endsWith('Z'));
  assert.deepEqual(
    stickerLocalCuts(d, { ...pose, width: 20, height: 80 }, 'cover'),
    stickerLocalCuts(d, { ...pose, width: 20, height: 80 }, 'contain'),
    'legacy cover preserves the complete custom outline',
  );
  assert.throws(() => designCutPaths({ ...d, elements: [{ ...d.elements[0], x: -1 }] }), /inside/);
  assert.throws(
    () => designCutPaths({ ...d, elements: [{ ...d.elements[0], closed: true }] }),
    /three/,
  );
  assert.throws(
    () =>
      validateStickerDesign({ ...d, elements: [{ ...newElement('text', d), operation: 'cut' }] }),
    /shape/,
  );
});
test('native registered jobs accept closed outlines and open cuts with the same scan origin', () => {
  const j = fixture();
  j.version = 2;
  j.contourPosition = 'page-points';
  j.contourShape = 'paths';
  j.sheets[0].contours = [
    {
      closed: true,
      points: [
        { x: 70, y: 90 },
        { x: 90, y: 90 },
        { x: 80, y: 110 },
      ],
    },
    {
      closed: false,
      points: [
        { x: 75, y: 95 },
        { x: 85, y: 95 },
      ],
    },
  ];
  const prepared = prepareSheetJob(JSON.stringify(j), 0);
  assert.equal(prepared.contourCount, 2);
  assert.ok(prepared.paths[0].endsWith(' Z'));
  assert.ok(!prepared.paths[1].endsWith(' Z'));
  assert.deepEqual(prepared.scan.frame, j.sheets[0].registration.frame);
  for (const invalid of [
    {
      closed: true,
      points: [
        { x: 70, y: 90 },
        { x: 80, y: 90 },
      ],
    },
    {
      closed: false,
      points: [
        { x: 12.7, y: 12.7 },
        { x: 50, y: 50 },
      ],
    },
    {
      closed: false,
      points: [
        { x: -1, y: 90 },
        { x: 80, y: 90 },
      ],
    },
    {
      closed: false,
      points: [
        { x: 70, y: 90 },
        { x: 70, y: 90 },
      ],
    },
    {
      closed: false,
      points: [
        { x: '70', y: 90 },
        { x: 80, y: 90 },
      ],
    },
  ]) {
    j.sheets[0].contours = [invalid];
    assert.throws(() => prepareSheetJob(JSON.stringify(j), 0));
  }
});
