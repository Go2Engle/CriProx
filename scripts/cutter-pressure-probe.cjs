// Offline only: builds real native plots; never enumerates or connects to hardware.
const assert = require('node:assert/strict');
const { loadInstalledRuntime } = require('../electron/cutter/runtime.cjs');
const { buildPressureTest, startPressureTest } = require('../electron/cutter/pressure-test.cjs');
(async () => {
  const { api } = await loadInstalledRuntime();
  let checked = 0;
  for (const [cutMaterial, grams] of [
    ['white-sticker-paper', [76, 80, 84]],
    ['medium-cardstock', [171, 180, 189]],
  ])
    for (const [index, cutPressure] of ['light', 'medium', 'hard'].entries())
      for (const cutPasses of [1, 2, 3, 10]) {
        const { plot, config } = await buildPressureTest(api, {
          cutMaterial,
          cutPressure,
          cutPasses,
        });
        assert.equal(
          plot.paths.reduce((sum, p) => sum + p.numberOfPasses, 0),
          cutPasses,
        );
        assert.ok(plot.paths.every((p) => p.pressureValueSettings.value.grams === grams[index]));
        assert.equal(config.ptcConfig, undefined);
        checked++;
      }
  // Exercise the real event/Promise bridge on a permanently disconnected transport.
  const { buildSheetJob } = require('../electron/cutter/sheet-job.cjs');
  const sheet = require('../tests/fixtures/sheet-job.cjs')();
  sheet.sheets[0].contours = Array.from({ length: 54 }, (_, i) => ({
    x: 25 + (i % 4) * 42,
    y: 25 + Math.floor(i / 4) * 16,
    width: 40,
    height: 14,
    radius: 1,
    rotation: 0,
  }));
  const registered = await buildSheetJob(api, JSON.stringify(sheet), 0);
  assert.ok(registered.config.ptcConfig);
  assert.equal(registered.plot.paths.length, 54);
  console.log('Verified a 54-contour native registered sheet with matching scan configuration.');
  // A synchronous callback crashes WASM on its first event even when plot building succeeds.
  const { Bifrost: B, Runtime: R } = api;
  const log = console.log,
    error = console.error;
  console.log = console.error = () => {};
  const connection = B.GenericPhysicalConnection.create(
    async () => R.Result.failure('operationFailed'),
    async () => R.Result.success(),
    async () => R.Result.failure('operationFailed'),
    { connectionParameters: B.ConnectionConfig.create('usbSerial', 'gandalf').connectionParams },
  );
  try {
    const device = B.GandalfDevice.createDevice(connection);
    const test = await startPressureTest({
      api,
      device: {
        moveSkill: {
          getCarriageStatus: async () => ({ carriageState: 'idle', queuedMovesCount: 0 }),
        },
        toolSkill: device.toolSkill,
        plotJob: device.plotJob,
      },
      settings: {
        cutMaterial: 'white-sticker-paper',
        cutPressure: 'medium',
        cutPasses: 1,
        materialReady: true,
      },
    });
    await assert.rejects(test.done, /did not confirm/);
  } finally {
    await connection.disconnect();
    console.log = log;
    console.error = error;
  }
  console.log(
    `Verified ${checked} native pressure/pass combinations in Bifrost ${api.Bifrost.BifrostInfo.version}; no hardware connection.`,
  );
  console.log('Verified native asynchronous job events and disconnected-job rejection.');
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
