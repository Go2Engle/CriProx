import assert from 'node:assert/strict';
import test from 'node:test';
import { enableProjectDragging } from '../src/lib/project-drag';

class ElementFixture extends EventTarget {
  dataset: Record<string, string> = {};
  children: ElementFixture[] = [];
  parent: ElementFixture | null = null;
  classes = new Set<string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
  };
  captures = new Set<number>();
  style = { transform: '' };
  className = '';
  textContent = 'Deck';
  offsetWidth = 120;
  offsetHeight = 30;
  clientHeight = 300;
  scrollHeight = 1500;
  scrollTop = 500;
  overflowY = 'auto';
  rect = { left: 0, right: 400, top: 100, bottom: 400 };
  ownerDocument: unknown;
  interactive = false;
  closest(selector: string): ElementFixture | null {
    if (selector === '[data-project-id]') return this.dataset.projectId ? this : null;
    if (selector === '[data-project-folder]')
      return this.dataset.projectFolder !== undefined ? this : null;
    return this.interactive && selector.includes('button') ? this : null;
  }
  contains(element: ElementFixture): boolean {
    return this === element || this.children.some((child) => child.contains(element));
  }
  append(element: ElementFixture) {
    this.children.push(element);
    element.parent = this;
  }
  remove() {
    if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this);
  }
  setAttribute() {}
  querySelector(selector: string) {
    return selector === 'strong' ? { textContent: this.textContent } : null;
  }
  getBoundingClientRect() {
    return this.rect;
  }
  setPointerCapture(id: number) {
    this.captures.add(id);
  }
  hasPointerCapture(id: number) {
    return this.captures.has(id);
  }
  releasePointerCapture(id: number) {
    this.captures.delete(id);
  }
}

function explorer() {
  let time = 0;
  let frameId = 0;
  let allowed = true;
  let dropAllowed = true;
  const frames = new Map<number, FrameRequestCallback>();
  const window = Object.assign(new EventTarget(), {
    innerWidth: 500,
    innerHeight: 600,
    getComputedStyle: (element: ElementFixture) => ({ overflowY: element.overflowY }),
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    },
    cancelAnimationFrame: (id: number) => frames.delete(id),
  });
  const content = new ElementFixture();
  const list = new ElementFixture();
  const source = new ElementFixture();
  source.dataset.projectId = 'deck';
  const folder = new ElementFixture();
  folder.dataset.projectFolder = 'Commander';
  content.append(list);
  list.append(source);
  list.append(folder);
  let hit: ElementFixture | null = folder;
  const document = Object.assign(new EventTarget(), {
    defaultView: window,
    elementFromPoint: () => hit,
    createElement: () => new ElementFixture(),
  });
  content.ownerDocument = document;
  const starts: string[] = [];
  const hovers: (string | null)[] = [];
  const drops: { id: string; folder: string }[] = [];
  let finishes = 0;
  const dispose = enableProjectDragging(
    content as unknown as HTMLElement,
    list as unknown as HTMLElement,
    {
      canDrag: () => allowed,
      canDrop: () => dropAllowed,
      start: (id) => starts.push(id),
      hover: (folder) => hovers.push(folder),
      finish: () => finishes++,
      drop: (id, folder) => drops.push({ id, folder }),
    },
  );
  function send(type: string, options: Record<string, unknown> = {}, target = source) {
    const event = Object.assign(new Event(type, { cancelable: true }), {
      pointerType: 'mouse',
      pointerId: 1,
      button: 0,
      buttons: 1,
      clientX: 150,
      clientY: 250,
      deltaY: 0,
      deltaMode: 0,
      ctrlKey: false,
      detail: 1,
      ...options,
    });
    if (type === 'pointerdown') Object.defineProperty(event, 'target', { value: target });
    (type === 'pointerdown' ? content : document).dispatchEvent(event);
    return event;
  }
  function tick(ms = 16) {
    time += ms;
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(time));
  }
  function start(y = 250) {
    send('pointerdown');
    send('pointermove', { clientX: 160, clientY: y });
  }
  return {
    content,
    list,
    source,
    folder,
    frames,
    starts,
    hovers,
    drops,
    window,
    send,
    tick,
    start,
    dispose,
    finishes: () => finishes,
    setHit: (next: ElementFixture | null) => {
      hit = next;
    },
    allowDrag: (value: boolean) => {
      allowed = value;
    },
    allowDrop: (value: boolean) => {
      dropAllowed = value;
    },
  };
}

test('wheel input remains available during deck dragging and honors pixel, line and page units', () => {
  const e = explorer();
  assert.equal(e.send('wheel', { deltaY: 20 }).defaultPrevented, false);
  e.start();
  for (const [deltaY, deltaMode, expected] of [
    [-120, 0, 380],
    [2, 1, 412],
    [1, 2, 712],
  ]) {
    assert.equal(e.send('wheel', { deltaY, deltaMode }).defaultPrevented, true);
    assert.equal(e.list.scrollTop, expected);
  }
  assert.equal(e.send('wheel', { deltaY: 20, ctrlKey: true }).defaultPrevented, false);
  assert.equal(e.send('wheel', { deltaY: 20, clientX: 500 }).defaultPrevented, false);
  e.send('wheel', { deltaY: 10000 });
  assert.equal(e.list.scrollTop, 1200);
  e.send('wheel', { deltaY: -10000 });
  assert.equal(e.list.scrollTop, 0);
  e.dispose();
});

test('stationary holds scroll both edges gently, retain fractional movement and stop in the center', () => {
  const e = explorer();
  e.start(101);
  for (let n = 0; n < 30; n++) e.tick();
  assert.ok(e.list.scrollTop < 420 && e.list.scrollTop > 390);
  e.send('pointermove', { clientY: 250 });
  const stopped = e.list.scrollTop;
  for (let n = 0; n < 20; n++) e.tick();
  assert.equal(e.list.scrollTop, stopped);
  e.send('pointermove', { clientY: 399 });
  for (let n = 0; n < 30; n++) e.tick();
  assert.ok(e.list.scrollTop > stopped + 80);
  e.send('pointermove', { clientY: 147 });
  const slow = e.list.scrollTop;
  for (let n = 0; n < 60; n++) e.tick();
  assert.ok(e.list.scrollTop < slow, 'Slow scrolling must survive subpixel steps');
  e.send('pointermove', { clientY: 90 });
  assert.equal(e.frames.size, 0);
  e.dispose();
});

test('scrolling uses the outer explorer on narrow layouts and caps delayed frame jumps', () => {
  const e = explorer();
  e.list.overflowY = 'visible';
  e.list.rect = { left: 0, right: 400, top: 50, bottom: 1500 };
  e.start(399);
  e.tick();
  const before = e.content.scrollTop;
  e.tick(5000);
  assert.ok(e.content.scrollTop - before <= 10);
  assert.equal(e.list.scrollTop, 500);
  const afterHold = e.content.scrollTop;
  e.send('wheel', { deltaY: 100, clientY: 250 });
  assert.equal(e.content.scrollTop, afterHold + 100);
  e.dispose();
});

test('dropping resolves the folder under the pointer after scrolling and refuses invalid destinations', () => {
  const e = explorer();
  e.start();
  e.send('wheel', { deltaY: 100 });
  assert.equal(e.hovers.at(-1), 'Commander');
  e.send('pointerup');
  assert.deepEqual(e.drops, [{ id: 'deck', folder: 'Commander' }]);
  assert.equal(e.finishes(), 1);
  assert.equal(e.source.captures.size, 0);
  assert.equal(e.frames.size, 0);
  e.start();
  e.allowDrop(false);
  e.send('pointerup');
  assert.equal(e.drops.length, 1);
  e.start();
  e.setHit(null);
  e.send('pointerup');
  assert.equal(e.drops.length, 1);
  e.dispose();
});

test('Escape, pointer cancellation, capture loss, blur, revoked availability and disposal stop scrolling without a move', () => {
  for (const reason of [
    'Escape',
    'pointercancel',
    'lostpointercapture',
    'blur',
    'busy',
    'dispose',
  ]) {
    const e = explorer();
    e.start(101);
    e.tick();
    if (reason === 'Escape')
      assert.equal(e.send('keydown', { key: 'Escape' }).defaultPrevented, true);
    else if (reason === 'blur') e.window.dispatchEvent(new Event('blur'));
    else if (reason === 'busy') {
      e.allowDrag(false);
      e.tick();
    } else if (reason === 'dispose') e.dispose();
    else e.send(reason);
    const stopped = e.list.scrollTop;
    for (let n = 0; n < 10; n++) e.tick();
    assert.equal(e.list.scrollTop, stopped, reason);
    assert.equal(e.frames.size, 0, reason);
    assert.equal(e.source.captures.size, 0, reason);
    assert.deepEqual(e.drops, [], reason);
    e.dispose();
    assert.equal(e.send('pointerdown').defaultPrevented, false);
  }
});

test('touch scrolling, row controls, secondary buttons and clicks below the drag threshold remain available', () => {
  const e = explorer();
  e.source.interactive = true;
  assert.equal(e.send('pointerdown').defaultPrevented, false);
  e.source.interactive = false;
  assert.equal(e.send('pointerdown', { pointerType: 'touch' }).defaultPrevented, false);
  assert.equal(e.send('pointerdown', { button: 2 }).defaultPrevented, false);
  e.send('pointerdown');
  e.send('pointermove', { clientX: 151 });
  e.send('pointerup');
  assert.deepEqual(e.starts, []);
  assert.deepEqual(e.drops, []);
  assert.equal(e.send('click').defaultPrevented, false);
  e.start();
  e.send('pointerup');
  assert.equal(e.send('click').defaultPrevented, true);
  e.source.interactive = true;
  e.send('pointerdown');
  assert.equal(e.send('click').defaultPrevented, false);
  e.dispose();
});
