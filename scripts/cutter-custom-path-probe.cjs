// Offline plot construction only. Never discovers, connects to, or moves a cutter.
const assert = require('node:assert/strict');
const { loadInstalledRuntime } = require('../electron/cutter/runtime.cjs');
const { buildSheetJob } = require('../electron/cutter/sheet-job.cjs');
(async () => {
  const { api } = await loadInstalledRuntime();
  const job = require('../tests/fixtures/sheet-job.cjs')();
  job.version = 2;
  job.contourPosition = 'page-points';
  job.contourShape = 'paths';
  job.sheets[0].contours = [
    {
      closed: true,
      points: Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5,
          r = i % 2 ? 8 : 18;
        return { x: 80 + Math.cos(a) * r, y: 90 + Math.sin(a) * r };
      }),
    },
    {
      closed: false,
      points: [
        { x: 70, y: 120 },
        { x: 80, y: 125 },
        { x: 90, y: 120 },
      ],
    },
    {
      closed: true,
      points: Array.from({ length: 128 }, (_, i) => ({
        x: 130 + Math.cos((i * Math.PI) / 64) * 18,
        y: 90 + Math.sin((i * Math.PI) / 64) * 12,
      })),
    },
  ];
  const built = await buildSheetJob(api, JSON.stringify(job), 0);
  assert.ok(built.config.ptcConfig);
  assert.equal(built.prepared.contourCount, 3);
  assert.equal(built.plot.paths.length, 3);
  assert.ok(built.plot.paths.every((p) => p.numberOfPasses === 1));
  console.log(
    'PASS: native registered plot accepts a concave star, an open polyline, and an ellipse at 80 g, one pass. No hardware accessed.',
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
