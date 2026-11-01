import { test } from 'node:test';
import assert from 'node:assert/strict';
import { historyStep, workspaceShortcut, type History } from '../src/lib/workspace-history';
import { copySticker, pasteSticker, pasteStickerDesign } from '../src/lib/sticker-clipboard';
import { newDesign, newElement } from '../src/lib/sticker-design';
import {
  newStickerProject,
  appendSticker,
  editSticker,
  removeStickers,
  stickerPoses,
  stickerGeometryKey,
  validateStickerProject,
} from '../src/lib/stickers';
import { machineGuide, outsidePlanningGuide } from '../src/lib/machine-guides';
import { availableSheetProfiles } from '../src/lib/paper-workflow';

test('workspace history restores edits, branches after undo, resets between card projects and caps memory', () => {
  let state: History<number> = { present: 0, past: [], future: [] };
  for (let i = 1; i <= 45; i++) state = historyStep(state, { type: 'set', value: i });
  assert.equal(state.past.length, 40);
  state = historyStep(state, { type: 'undo' });
  assert.equal(state.present, 44);
  state = historyStep(state, { type: 'redo' });
  assert.equal(state.present, 45);
  state = historyStep(state, { type: 'undo' });
  state = historyStep(state, { type: 'set', value: (n) => n + 10 });
  assert.equal(state.present, 54);
  assert.deepEqual(state.future, []);
  assert.equal(historyStep(state, { type: 'redo' }), state);
  assert.deepEqual(historyStep(state, { type: 'reset', value: 7 }), {
    present: 7,
    past: [],
    future: [],
  });
});
test('shortcuts accept Ctrl and Command, retain text editing and ignore Alt combinations', () => {
  const event = {
    key: 'z',
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    defaultPrevented: false,
  };
  for (const [key, action] of Object.entries({
    z: 'undo',
    y: 'redo',
    x: 'cut',
    c: 'copy',
    v: 'paste',
  }))
    assert.equal(workspaceShortcut({ ...event, key }), action);
  assert.equal(workspaceShortcut({ ...event, shiftKey: true }), 'redo');
  assert.equal(workspaceShortcut({ ...event, ctrlKey: false, metaKey: true }), 'undo');
  assert.equal(workspaceShortcut(event, true), undefined);
  assert.equal(workspaceShortcut({ ...event, altKey: true }), undefined);
  assert.equal(workspaceShortcut({ ...event, defaultPrevented: true }), undefined);
  assert.equal(workspaceShortcut({ ...event, ctrlKey: false }), undefined);
  assert.equal(workspaceShortcut({ ...event, key: 'Delete', ctrlKey: false }), 'delete');
  assert.equal(workspaceShortcut({ ...event, key: 'Delete', ctrlKey: false }, true), undefined);
  assert.equal(workspaceShortcut({ ...event, key: 'Delete' }), undefined);
});
function sample() {
  let p = newStickerProject();
  p.artwork = [{ id: 'a', name: 'Label', image: 'data:image/png;base64,AAAA' }];
  p = appendSticker(p, 'a');
  return editSticker(p, 0, {
    width: 32,
    height: 18,
    rotation: 90,
    flipX: true,
    flipY: true,
    radius: 2,
  });
}

test('library paste creates an independent design without changing sheet copies or the clipboard', () => {
  const project = sample(),
    design = newDesign();
  design.elements = [newElement('text', design)];
  project.artwork[0].design = design;
  const source = structuredClone(project.artwork[0]);
  const pasted = pasteStickerDesign(project, source, () => 'independent');
  assert.deepEqual(pasted.items, project.items);
  assert.deepEqual(pasted.poses, project.poses);
  assert.equal(pasted.artwork[1].id, 'independent');
  assert.equal(pasted.artwork[1].name, 'Label copy');
  pasted.artwork[1].design!.elements[0].text = 'Changed';
  assert.equal(source.design!.elements[0].text, 'Your text');
  assert.equal(project.artwork[0].design!.elements[0].text, 'Your text');
  const undo = historyStep({ present: pasted, past: [project], future: [] }, { type: 'undo' });
  assert.equal(undo.present, project);
  assert.equal(historyStep(undo, { type: 'redo' }).present, pasted);
  assert.throws(() => pasteStickerDesign(project, source, () => 'a'), /artwork/);
});
test('cut and paste preserve transformed sticker artwork across local projects and undo restores removal', () => {
  const original = sample(),
    clip = copySticker(original, 0)!;
  const removed = removeStickers(original, [0]);
  assert.equal(removed.items.length, 0);
  const undone = historyStep({ present: removed, past: [original], future: [] }, { type: 'undo' });
  assert.equal(undone.present, original);
  const pasted = pasteSticker(newStickerProject(), clip, 0, () => 'new-id');
  assert.equal(pasted.artwork[0].image, clip.artwork.image);
  assert.equal(pasted.items[0], 'new-id');
  assert.deepEqual(stickerPoses(pasted)[0], {
    ...clip.pose,
    x: clip.pose.x + 3,
    y: clip.pose.y + 3,
  });
  assert.equal(pasteSticker(original, clip, 0).artwork.length, 1);
  assert.equal(copySticker(original, -1), undefined);
});
test('paste enforces bounds and item limits without altering the destination', () => {
  const p = sample(),
    clip = copySticker(p, 0)!;
  assert.throws(
    () => pasteSticker(p, { ...clip, pose: { ...clip.pose, width: 500 } }, 0),
    /larger/,
  );
  const full = {
    ...p,
    items: Array(500).fill('a'),
    poses: Array.from({ length: 500 }, () => ({ ...clip.pose })),
  };
  assert.throws(() => pasteSticker(full, clip, 0), /supported/);
  assert.equal(full.items.length, 500);
});
test('machine guides use paper-specific published extents and never treat reserved corners as clear space', () => {
  for (const machine of ['explore-5', 'explore', 'maker', 'joy-xtra'] as const) {
    const letter = machineGuide(machine, 'letter'),
      a4 = machineGuide(machine, 'a4');
    assert.equal(letter.page.width, 215.9);
    assert.equal(a4.page.height, 297);
    assert.equal(letter.bounds.width, 7.44 * 25.4);
    assert.equal(a4.bounds.height, 10.62 * 25.4);
    assert.equal(outsidePlanningGuide({ ...letter.corners[0], width: 1, height: 1 }, letter), true);
    assert.equal(outsidePlanningGuide({ x: 100, y: 100, width: 20, height: 20 }, letter), false);
    assert.equal(outsidePlanningGuide({ x: 200, y: 100, width: 20, height: 20 }, letter), true);
  }
  const manual = machineGuide('manual', 'letter');
  assert.equal(manual.corners.length, 0);
  assert.equal(manual.bounds.width, manual.page.width);
  assert.deepEqual(
    availableSheetProfiles({ machine: 'explore-5', paper: 'letter' }),
    availableSheetProfiles({ machine: 'explore', paper: 'letter' }),
  );
});
test('machine choice persists and separates captured registration keys without changing sticker geometry', () => {
  const p = sample();
  for (const machine of ['explore-5', 'explore', 'maker', 'joy-xtra'] as const) {
    const next = validateStickerProject({ ...p, machine });
    assert.equal(next.machine, machine);
    assert.deepEqual(next.poses, p.poses);
  }
  const keys = new Set(
    ['explore-5', 'explore', 'maker', 'joy-xtra'].map((machine) =>
      stickerGeometryKey(p.settings, machine as typeof p.machine),
    ),
  );
  assert.equal(keys.size, 4);
  assert.equal(stickerGeometryKey(p.settings), stickerGeometryKey(p.settings, 'explore-5'));
  assert.throws(() => validateStickerProject({ ...p, machine: 'unknown' }), /supported/);
});

test('shared history groups a sticker drag into one undo and restores its captured profile', () => {
  const original = { project: { x: 5 }, profile: 'captured' as string | undefined };
  let state: History<typeof original> = { present: original, past: [], future: [] };
  state = historyStep(state, { type: 'checkpoint' });
  for (let x = 6; x <= 30; x++)
    state = historyStep(state, { type: 'replace', value: { project: { x }, profile: undefined } });
  assert.equal(state.past.length, 1);
  state = historyStep(state, { type: 'undo' });
  assert.deepEqual(state.present, original);
  state = historyStep(state, { type: 'redo' });
  assert.equal(state.present.project.x, 30);
  assert.equal(state.present.profile, undefined);
  state = historyStep(state, { type: 'undo' });
  state = historyStep(state, { type: 'checkpoint' });
  state = historyStep(state, {
    type: 'replace',
    value: (current) => ({ ...current, project: { x: 12 } }),
  });
  assert.equal(state.future.length, 0);
  assert.equal(historyStep(state, { type: 'undo' }).present.project.x, 5);
});
