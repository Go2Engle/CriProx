import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cutPressureGrams, readCutSettings } from '../src/lib/cut-settings';
const require = createRequire(import.meta.url);
const { resolveCutSettings, startPressureTest } = require('../electron/cutter/pressure-test.cjs');
const settings = {
  cutMaterial: 'white-sticker-paper',
  cutPressure: 'medium',
  cutPasses: 3,
  materialReady: true,
};

test('renderer and native pressure mapping agree for both materials and enforce pass bounds', () => {
  for (const cutMaterial of ['white-sticker-paper', 'medium-cardstock'])
    for (const cutPressure of ['light', 'medium', 'hard']) {
      const value = readCutSettings({ ...settings, cutMaterial, cutPressure });
      assert.equal(resolveCutSettings(value).pressureGrams, cutPressureGrams(value));
    }
  assert.equal(resolveCutSettings(settings).pressureGrams, 80);
  for (const patch of [
    { cutMaterial: '__proto__' },
    { cutMaterial: 'other' },
    { cutPressure: 'extreme' },
    ...[0, 11, 1.5, '3', NaN, Infinity].map((cutPasses) => ({ cutPasses })),
  ])
    assert.throws(() => resolveCutSettings({ ...settings, ...patch }), /Invalid/);
});

function fixture() {
  const names = [
    'PrintThenCutFiducialScanStarted',
    'PrintThenCutFiducialScanCompleted',
    'WaitingForPrintThenCutRestart',
    'PlotResume',
    'PlotCompleted',
    'Finished',
    'WaitingForMaterialLoad',
    'WaitingForMaterialMeasurement',
    'WaitingForPlotStart',
    'MaterialMeasurementStarted',
    'PlotStarted',
    'PlotPaused',
    'WaitingForMaterialUnload',
    'WaitingForUserAction',
  ];
  const E = Object.fromEntries(
    names.map((n) => [
      n,
      class {
        error: any;
        result: any;
        constructor(error?: any) {
          this.error = error;
          this.result = error;
        }
      },
    ]),
  );
  let callback: any,
    finish: any,
    started = 0,
    removed = 0,
    cancelled = 0,
    resumed = 0;
  const config = { tools: new Map(), builder: {}, initialTools: new Set() };
  const done = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const device = {
    moveSkill: { getCarriageStatus: async () => ({ carriageState: 'idle', queuedMovesCount: 0 }) },
    toolSkill: { getInitialTools: async () => new Set(['fine-point']) },
    plotJob: {
      registerEventsCallback: async (cb: any) => {
        callback = cb;
        return {
          unregister() {
            removed++;
          },
        };
      },
      start: async (c: any) => {
        assert.equal(c, config);
        started++;
        await done;
      },
      cancel: async () => {
        cancelled++;
      },
      pause: async () => {},
      cancelAndWaitForFinish: async () => {
        cancelled++;
        finish();
      },
      abortAndWaitForFinish: async () => finish(),
      resume: async () => {
        resumed++;
      },
    },
  };
  return {
    device,
    api: { Bifrost: { PressureMachinesPlotJobEvent: E } },
    build: async () => ({ config, resolved: resolveCutSettings(settings) }),
    emit(name: string, error?: any) {
      const result = callback(new E[name](error));
      assert.ok(result instanceof Promise, 'Native event callbacks must return a Promise');
      return result;
    },
    finish: () => finish(),
    counts: () => ({ started, removed, cancelled, resumed }),
  };
}
test('test cut passes verified config to native start and requires completion and idle acknowledgement', async () => {
  const f = fixture(),
    messages: string[] = [];
  const test = await startPressureTest({
    ...f,
    settings,
    onUpdate: (m: string) => messages.push(m),
  });
  assert.equal(f.counts().started, 1);
  await assert.rejects(test.startCut(), /not waiting/);
  await f.emit('WaitingForMaterialMeasurement');
  assert.equal(f.counts().resumed, 1);
  await f.emit('WaitingForPlotStart');
  assert.match(messages.at(-1)!, /Cut test square/);
  assert.equal(f.counts().resumed, 1, 'Cut must wait for the app start command');
  await test.startCut();
  assert.equal(f.counts().resumed, 2);
  await f.emit('WaitingForPlotStart');
  await assert.rejects(test.startCut(), /not waiting/);
  assert.equal(f.counts().resumed, 2, 'Repeated events or clicks must not start another cut');
  await f.emit('PlotCompleted');
  await f.emit('Finished');
  f.finish();
  assert.deepEqual(await test.done, { cancelled: false });
  assert.equal(f.counts().removed, 1);
});
test('test cut rejects busy devices, missing readiness, and missing tools before native motion', async () => {
  const f = fixture();
  await assert.rejects(
    startPressureTest({ ...f, settings: { ...settings, materialReady: false } }),
    /requires prepared/,
  );
  f.device.moveSkill.getCarriageStatus = async () => ({
    carriageState: 'moving',
    queuedMovesCount: 1,
  });
  await assert.rejects(startPressureTest({ ...f, settings }), /must be idle/);
  f.device.moveSkill.getCarriageStatus = async () => ({
    carriageState: 'idle',
    queuedMovesCount: 0,
  });
  f.device.toolSkill.getInitialTools = async () => new Set();
  await assert.rejects(startPressureTest({ ...f, settings }), /resolve/);
  assert.equal(f.counts().started, 0);
});
test('cancellation is acknowledged and an incomplete or failed plot never reports success', async () => {
  const f = fixture(),
    test = await startPressureTest({ ...f, settings });
  await test.cancel();
  await f.emit('WaitingForMaterialMeasurement');
  assert.equal(f.counts().resumed, 0, 'Cancellation must not resume measurement');
  assert.deepEqual(await test.done, { cancelled: true });
  assert.equal(f.counts().cancelled, 1);
  for (const error of [undefined, Error('test failure')]) {
    const g = fixture(),
      failed = await startPressureTest({ ...g, settings });
    await g.emit('Finished', error);
    g.finish();
    await assert.rejects(failed.done, /did not confirm/);
    assert.equal(g.counts().removed, 1);
  }
});

test('registered sheets start once after measurement and require successful optical registration', async () => {
  for (const scan of [true, false, undefined]) {
    const f = fixture();
    const job = await startPressureTest({ ...f, settings, requireScan: true, autoStart: true });
    await f.emit('WaitingForMaterialMeasurement');
    await f.emit('WaitingForPlotStart');
    await f.emit('WaitingForPlotStart');
    assert.equal(f.counts().resumed, 2);
    if (scan !== undefined) {
      await f.emit('PrintThenCutFiducialScanStarted');
      await f.emit('PrintThenCutFiducialScanCompleted', { isSuccess: () => scan });
    }
    if (scan === false) {
      await f.emit('WaitingForPrintThenCutRestart');
      await f.emit('WaitingForMaterialMeasurement');
      assert.equal(f.counts().cancelled, 1);
      assert.equal(f.counts().resumed, 2);
      await assert.rejects(job.resume(), /not ready/);
    }
    await f.emit('PlotCompleted');
    f.finish();
    if (scan) assert.deepEqual(await job.done, { cancelled: false });
    else await assert.rejects(job.done, /did not confirm/);
  }
});

test('paused registered jobs resume only after a pause event and never after cancellation', async () => {
  const f = fixture(),
    job = await startPressureTest({ ...f, settings, requireScan: true });
  await assert.rejects(job.resume(), /not ready/);
  await f.emit('PlotPaused');
  await job.resume();
  await assert.rejects(job.resume(), /not ready/);
  await job.cancel();
  await f.emit('PlotPaused');
  await assert.rejects(job.resume(), /not ready/);
  await job.done;
});
