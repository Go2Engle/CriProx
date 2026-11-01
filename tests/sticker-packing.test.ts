import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newStickerProject,
  appendSticker,
  arrangeStickers,
  fillStickerSheet,
  stickerPoses,
  stickerBounds,
  hasStickerOverlap,
  parseStickerProject,
  type StickerProject,
} from '../src/lib/stickers';
import { machineGuide, outsidePlanningGuide } from '../src/lib/machine-guides';

function check(p: StickerProject) {
  const guide = machineGuide(p.machine, p.settings.paper);
  const left = (guide.page.width - p.settings.areaWidth) / 2,
    top = (guide.page.height - p.settings.areaHeight) / 2;
  for (const pose of stickerPoses(p)) {
    assert.equal(
      outsidePlanningGuide({ x: pose.x + left, y: pose.y + top, ...stickerBounds(pose) }, guide),
      false,
    );
  }
  assert.equal(hasStickerOverlap(p), false);
  assert.equal(parseStickerProject(JSON.stringify(p)).items.length, p.items.length);
}
test('import and autofill respect machine limits and reserved corners on Letter and A4', () => {
  for (const machine of ['explore-5', 'explore', 'maker', 'joy-xtra'] as const)
    for (const paper of ['letter', 'a4'] as const) {
      let p = newStickerProject();
      p.machine = machine;
      p.settings = {
        ...p.settings,
        paper,
        areaWidth: 190,
        areaHeight: paper === 'letter' ? 250 : 265,
        width: 42.5,
        height: 14.5,
        radius: 1,
      };
      p.artwork = [{ id: 'label', name: 'Label', image: 'data:image/png;base64,AAAA' }];
      p = appendSticker(p, 'label');
      const original = { ...p.poses![0] };
      p = fillStickerSheet(p, 'label');
      assert.ok(p.items.length > 30);
      assert.deepEqual(p.poses![0], original);
      check(p);
      assert.equal(fillStickerSheet(p, 'label'), p);
      const next = appendSticker(p, 'label');
      assert.equal(next.poses!.at(-1)!.sheet, 1);
      check(next);
    }
});
test('auto arrange repairs old corner collisions while retaining sizes, artwork and transforms', () => {
  const p = newStickerProject();
  p.settings = { ...p.settings, areaHeight: 250, width: 42.5, height: 14.5 };
  p.artwork = [{ id: 'label', name: 'Label', image: 'data:image/png;base64,AAAA' }];
  p.items = Array(65).fill('label');
  const poses = stickerPoses(p).map((pose, i) => ({
    ...pose,
    rotation: i === 1 ? 30 : pose.rotation,
    flipX: i === 1,
    flipY: i === 2,
  }));
  const arranged = arrangeStickers({ ...p, version: 2, poses });
  assert.deepEqual(arranged.items, p.items);
  for (let i = 0; i < poses.length; i++)
    for (const key of ['width', 'height', 'rotation', 'radius', 'flipX', 'flipY'] as const)
      assert.equal(arranged.poses![i][key], poses[i][key]);
  check(arranged);
});
test('packing rejects stickers that fit the rectangle but cannot clear the machine guides', () => {
  const p = newStickerProject();
  p.settings = { ...p.settings, areaWidth: 190, areaHeight: 250, width: 190, height: 250 };
  p.artwork = [{ id: 'large', name: 'Large', image: 'data:image/png;base64,AAAA' }];
  assert.throws(() => appendSticker(p, 'large'), /machine guides/);
  assert.throws(() => arrangeStickers({ ...p, items: ['large'] }), /machine guides/);
});
