import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { EventEmitter } from 'node:events';
const { createPrintPreview, previewOptions } = createRequire(import.meta.url)(
  '../electron/print-preview.cjs',
);
const settings = { widthMm: 215.9, heightMm: 279.4, pageCount: 4, duplex: 'longEdge' };
const printers = [{ name: 'system-printer', displayName: 'Office printer' }];
const choice = {
  printer: 'system-printer',
  copies: 2,
  color: false,
  duplex: 'shortEdge',
  first: 2,
  last: 3,
  systemDialog: false,
};
test('preview submissions use the named printer and preserve actual size, copies, color, duplex, and page range', () => {
  const result = previewOptions(settings, printers, choice);
  assert.equal(result.silent, true);
  assert.equal(result.deviceName, 'system-printer');
  assert.equal(result.scaleFactor, 100);
  assert.deepEqual(result.margins, { marginType: 'none' });
  assert.deepEqual(result.pageSize, { width: 215900, height: 279400 });
  assert.equal(result.copies, 2);
  assert.equal(result.color, false);
  assert.equal(result.duplexMode, 'shortEdge');
  assert.deepEqual(result.pageRanges, [{ from: 1, to: 2 }]);
  assert.equal(previewOptions(settings, printers, { ...choice, systemDialog: true }).silent, false);
  for (const patch of [
    { printer: 'unknown' },
    { copies: 0 },
    { copies: 100 },
    { copies: 1.5 },
    { color: 'true' },
    { first: 0 },
    { last: 5 },
    { first: 3, last: 2 },
    { systemDialog: 'yes' },
    { duplex: 'bad' },
  ])
    assert.throws(() => previewOptions(settings, printers, { ...choice, ...patch }), /Choose/);
});
function fixture() {
  let handler: any,
    window: any,
    callback: any,
    prints = 0;
  class Window extends EventEmitter {
    static fromWebContents() {
      return undefined;
    }
    destroyed = false;
    contents = Object.assign(new EventEmitter(), {
      mainFrame: {},
      setWindowOpenHandler: () => {},
    });
    get webContents() {
      if (this.destroyed) throw Error('Object has been destroyed');
      return this.contents;
    }
    constructor() {
      super();
      window = this;
    }
    async loadFile() {}
    show() {}
    isDestroyed() {
      return this.destroyed;
    }
    destroy() {
      this.destroyed = true;
      this.emit('closed');
    }
  }
  const source = Object.assign(new EventEmitter(), {
    getPrintersAsync: async () => printers,
    isDestroyed: () => false,
    print: (_options: any, cb: any) => {
      prints++;
      callback = cb;
    },
  });
  const preview = createPrintPreview({
    BrowserWindow: Window,
    ipcMain: {
      handle: (_: string, h: any) => {
        handler = h;
      },
    },
  });
  return {
    source,
    start: () => preview({}, 'C:/temporary/print-job', settings, source),
    ready: () => new Promise((resolve) => setImmediate(resolve)),
    window: () => window,
    prints: () => prints,
    reply: (success = true, reason = '') => callback(success, reason),
    invoke: (action: string, value?: any) =>
      handler(
        { sender: window.webContents, senderFrame: window.webContents.mainFrame },
        action,
        value,
      ),
    foreign: () => handler({ sender: {}, senderFrame: {} }, 'state'),
  };
}
test('opening and closing a preview never prints; only its own frame can request its job', async () => {
  const f = fixture(),
    done = f.start();
  await f.ready();
  const state = await f.invoke('state');
  assert.equal(state.pages.length, 4);
  assert.match(state.pages[2], /page-2.png$/);
  assert.equal(state.printers[0].label, 'Office printer');
  await assert.rejects(f.foreign(), /no longer/);
  assert.equal(f.prints(), 0);
  f.window().destroy();
  assert.deepEqual(await done, { status: 'cancelled' });
  assert.equal(f.prints(), 0);
});
test('explicit submit prints once and waits for printer acceptance; duplicate clicks are rejected', async () => {
  const f = fixture(),
    done = f.start();
  await f.ready();
  const submission = f.invoke('submit', choice);
  await f.ready();
  await assert.rejects(f.invoke('submit', choice), /in progress/);
  assert.equal(f.prints(), 1);
  f.reply();
  await submission;
  assert.deepEqual(await done, { status: 'submitted' });
  assert.ok(f.window().isDestroyed());
});
test('printer failure and system-dialog cancellation keep the preview open for review or cancellation', async () => {
  for (const reason of ['Print job failed', 'Print job canceled']) {
    const f = fixture(),
      done = f.start();
    await f.ready();
    const submission = f.invoke('submit', { ...choice, systemDialog: true });
    await f.ready();
    f.reply(false, reason);
    if (reason.endsWith('failed')) await assert.rejects(submission, /failed/);
    else assert.deepEqual(await submission, { status: 'cancelled' });
    assert.equal(f.window().isDestroyed(), false);
    await f.invoke('cancel');
    assert.deepEqual(await done, { status: 'cancelled' });
  }
});
