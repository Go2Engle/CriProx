import assert from 'node:assert/strict';
import test from 'node:test';
import { createDialogBackdropGesture } from '../src/lib/dialog-backdrop';

const dialog = {
  getBoundingClientRect: () => ({ left: 100, right: 500, top: 100, bottom: 400 }),
} as HTMLDialogElement;
const content = {} as EventTarget;

function event(clientX: number, clientY: number, target: EventTarget = dialog) {
  return {
    currentTarget: dialog,
    target,
    clientX,
    clientY,
    button: 0,
    detail: 1,
    isPrimary: true,
  };
}

test('an outside click still dismisses the dialog on every side', () => {
  for (const outside of [event(50, 200), event(550, 200), event(200, 50), event(200, 450)]) {
    const gesture = createDialogBackdropGesture();
    gesture.pointerDown(outside);
    assert.equal(gesture.isBackdropClick(outside), true);
  }
});

test('selecting text inside and releasing outside does not dismiss the dialog', () => {
  const gesture = createDialogBackdropGesture();
  gesture.pointerDown(event(200, 200, content));
  // Browsers target the common ancestor (the dialog) when press and release differ.
  assert.equal(gesture.isBackdropClick(event(50, 200)), false);

  // A later deliberate outside click must still work.
  gesture.pointerDown(event(50, 200));
  assert.equal(gesture.isBackdropClick(event(50, 200)), true);
});

test('pressing on empty dialog space or its border never starts outside dismissal', () => {
  for (const inside of [event(200, 200), event(100, 100), event(500, 400)]) {
    const gesture = createDialogBackdropGesture();
    gesture.pointerDown(inside);
    assert.equal(gesture.isBackdropClick(event(50, 200)), false);
  }
});

test('dragging from outside into the dialog does not dismiss it', () => {
  for (const inside of [event(200, 200), event(200, 200, content)]) {
    const gesture = createDialogBackdropGesture();
    gesture.pointerDown(event(50, 200));
    assert.equal(gesture.isBackdropClick(inside), false);
    assert.equal(gesture.isBackdropClick(event(50, 200)), false);
  }
});

test('content clicks and clicks without an outside press keep the dialog open', () => {
  const gesture = createDialogBackdropGesture();
  assert.equal(gesture.isBackdropClick(event(50, 200)), false);
  gesture.pointerDown(event(200, 200, content));
  assert.equal(gesture.isBackdropClick(event(200, 200, content)), false);
});

test('canceled gestures, secondary buttons, and non-primary pointers do not dismiss', () => {
  const gesture = createDialogBackdropGesture();
  gesture.pointerDown(event(50, 200));
  gesture.pointerCancel();
  assert.equal(gesture.isBackdropClick(event(50, 200)), false);

  for (const pointer of [
    { ...event(50, 200), button: 2 },
    { ...event(50, 200), isPrimary: false },
  ]) {
    gesture.pointerDown(pointer);
    assert.equal(gesture.isBackdropClick(event(50, 200)), false);
  }
});

test('an outside press cannot turn a keyboard or programmatic click into dismissal', () => {
  const gesture = createDialogBackdropGesture();
  gesture.pointerDown(event(50, 200));
  assert.equal(gesture.isBackdropClick({ ...event(50, 200), detail: 0 }), false);
  assert.equal(gesture.isBackdropClick(event(50, 200)), false);
});
