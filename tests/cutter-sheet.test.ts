import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const sheetJob = require('./fixtures/sheet-job.cjs');
const { prepareSheetJob } = require('../electron/cutter/sheet-job.cjs');
const { REGISTRATION_METRICS: m } = require('../electron/cutter/geometry.cjs');

test('registered jobs use the printed frame and convert paper coordinates to the native inner origin', () => {
  const job = sheetJob(),
    prepared = prepareSheetJob(JSON.stringify(job), 0);
  const expectedX = 70 - (12.7 + m.thickness + m.clearance + m.printBleed);
  const first = prepared.paths[0].match(/^M\s*([\d.-]+)[ ,]+([\d.-]+)/);
  assert.ok(first);
  assert.ok(Math.abs(Number(first[1]) - expectedX) < 0.001);
  assert.equal(prepared.resolved.pressureGrams, 80);
  assert.equal(prepared.resolved.passes, 1);
  assert.deepEqual(prepared.scan.frame, job.sheets[0].registration.frame);
  assert.equal(prepared.contourCount, 1);
  job.sheets.push({
    ...job.sheets[0],
    contours: [{ x: 70, y: 90, width: 40, height: 15, radius: 2, rotation: 90 }],
  });
  const second = prepareSheetJob(JSON.stringify(job), 1);
  assert.equal(second.sheetNumber, 2);
  assert.notEqual(second.paths[0], prepared.paths[0]);
});

test('registered jobs reject incompatible geometry, missing pressure, invalid shapes and mark collisions', () => {
  for (const change of [
    (j: any) => {
      j.machine = 'explore-air-2';
    },
    (j: any) => {
      j.registrationMode = 'captured';
    },
    (j: any) => {
      j.sheets[0].registration.frame.x = 0;
    },
    (j: any) => {
      j.sheets[0].registration.page.height = 300;
    },
    (j: any) => {
      j.sheets[0].contours[0].width = -1;
    },
    (j: any) => {
      j.sheets[0].contours[0].radius = 100;
    },
    (j: any) => {
      j.sheets[0].contours[0].x = -40;
    },
    (j: any) => {
      j.sheets[0].contours[0].x = 12.7;
      j.sheets[0].contours[0].y = 12.7;
    },
    (j: any) => {
      j.sheets[0].contours = [];
    },
    (j: any) => {
      j.cutSettings.passes = 0;
    },
    (j: any) => {
      delete j.cutSettings;
    },
  ]) {
    const job = sheetJob();
    change(job);
    assert.throws(() => prepareSheetJob(JSON.stringify(job), 0));
  }
  const job = JSON.stringify(sheetJob());
  for (const index of [-1, 1, 0.5, '0', null]) assert.throws(() => prepareSheetJob(job, index));
});
