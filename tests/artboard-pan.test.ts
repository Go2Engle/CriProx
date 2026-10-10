import assert from 'node:assert/strict';
import test from 'node:test';
import { enableArtboardPanning } from '../src/lib/artboard-pan';

function preview() {
  const classes = new Set<string>();
  const captures = new Set<number>();
  const window = new EventTarget();
  const viewport = Object.assign(new EventTarget(), {
    scrollLeft: 200,
    scrollTop: 300,
    clientWidth: 300,
    clientHeight: 200,
    ownerDocument: { defaultView: window },
    classList: {
      add: (name: string) => classes.add(name),
      remove: (name: string) => classes.delete(name),
    },
    getBoundingClientRect: () => ({ left: 10, top: 20 }),
    setPointerCapture: (id: number) => captures.add(id),
    hasPointerCapture: (id: number) => captures.has(id),
    releasePointerCapture: (id: number) => captures.delete(id),
  });
  const dispose = enableArtboardPanning(viewport as unknown as HTMLElement);
  function send(type: string, options: Record<string, unknown> = {}, card = false) {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      pointerType: 'mouse',
      pointerId: 1,
      button: 0,
      buttons: 1,
      clientX: 100,
      clientY: 100,
      detail: 1,
      ...options,
    });
    Object.defineProperty(event, 'target', { value: { closest: () => (card ? {} : null) } });
    viewport.dispatchEvent(event);
    return event;
  }
  return { viewport, window, classes, captures, dispose, send };
}

test('dragging empty space moves the view with the mouse and suppresses the release click', () => {
  const p = preview();
  assert.equal(p.send('pointerdown').defaultPrevented, true);
  assert.equal(p.classes.has('panning'), true);
  assert.equal(p.captures.has(1), true);
  p.send('pointermove', { clientX: 140, clientY: 125 });
  assert.equal(p.viewport.scrollLeft, 160);
  assert.equal(p.viewport.scrollTop, 275);
  p.send('pointermove', { clientX: 80, clientY: 90 });
  assert.equal(p.viewport.scrollLeft, 220);
  assert.equal(p.viewport.scrollTop, 310);
  p.send('pointerup', { buttons: 0 });
  assert.equal(p.classes.has('panning'), false);
  assert.equal(p.captures.size, 0);
  assert.equal(p.send('click', {}, true).defaultPrevented, true);
  p.dispose();
});

test('right dragging over card artwork pans without opening the context menu', () => {
  const p = preview();
  assert.equal(p.send('pointerdown', { button: 2, buttons: 2 }, true).defaultPrevented, true);
  assert.equal(p.send('contextmenu', {}, true).defaultPrevented, true);
  p.send('pointermove', { buttons: 2, clientX: 65, clientY: 50 }, true);
  assert.equal(p.viewport.scrollLeft, 235);
  assert.equal(p.viewport.scrollTop, 350);
  p.send('pointerup', { button: 2, buttons: 0 });
  assert.equal(p.classes.has('panning'), false);
  p.dispose();
});

test('fractional mouse steps do not accumulate rounding drift in browser scroll positions', () => {
  const p = preview();
  let scrollLeft = p.viewport.scrollLeft;
  Object.defineProperty(p.viewport, 'scrollLeft', {
    get: () => scrollLeft,
    set: (value: number) => {
      scrollLeft = Math.round(value);
    },
  });
  p.send('pointerdown');
  for (let step = 1; step <= 6; step++) {
    p.send('pointermove', { clientX: 100 + (70 * step) / 6 });
  }
  assert.equal(p.viewport.scrollLeft, 130);
  p.dispose();
});

test('ordinary card clicks, keyboard activation, touch, middle button, and scrollbar input stay available', () => {
  const p = preview();
  for (const [options, card] of [
    [{}, true],
    [{ pointerType: 'touch' }, false],
    [{ button: 1, buttons: 4 }, false],
    [{ clientX: 311 }, false],
    [{ clientY: 221 }, false],
  ] as const) {
    assert.equal(p.send('pointerdown', options, card).defaultPrevented, false);
    assert.equal(p.classes.has('panning'), false);
  }
  assert.equal(p.send('click', {}, true).defaultPrevented, false);
  p.send('pointerdown');
  p.send('pointermove', { clientX: 110 });
  p.send('pointerup', { buttons: 0 });
  assert.equal(p.send('click', { detail: 0 }, true).defaultPrevented, false);
  p.send('pointerdown', {}, true);
  assert.equal(p.send('click', {}, true).defaultPrevented, false);
  p.dispose();
});

test('capture keeps a drag active outside the viewport and ignores other pointers', () => {
  const p = preview();
  p.send('pointerdown');
  p.send('pointermove', { pointerId: 2, clientX: 130 });
  p.send('pointerup', { pointerId: 2, buttons: 0 });
  assert.equal(p.viewport.scrollLeft, 200);
  assert.equal(p.classes.has('panning'), true);
  p.send('pointermove', { clientX: -50, clientY: -20 });
  assert.equal(p.viewport.scrollLeft, 350);
  assert.equal(p.viewport.scrollTop, 420);
  p.dispose();
});

test('cancellation, capture loss, released buttons, blur, and disposal stop panning', () => {
  for (const reason of ['pointercancel', 'lostpointercapture', 'buttons', 'blur', 'dispose']) {
    const p = preview();
    p.send('pointerdown');
    if (reason === 'buttons') p.send('pointermove', { buttons: 2 });
    else if (reason === 'blur') p.window.dispatchEvent(new Event('blur'));
    else if (reason === 'dispose') p.dispose();
    else p.send(reason);
    assert.equal(p.classes.has('panning'), false, reason);
    assert.equal(p.captures.size, 0, reason);
    p.send('pointermove', { clientX: 150, clientY: 140 });
    assert.equal(p.viewport.scrollLeft, 200, reason);
    assert.equal(p.viewport.scrollTop, 300, reason);
    p.dispose();
    assert.equal(p.send('contextmenu').defaultPrevented, false);
    assert.equal(p.send('pointerdown').defaultPrevented, false);
  }
});
