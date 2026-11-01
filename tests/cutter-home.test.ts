import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { homeIdleDevice } = require('../scripts/lib/cricut-home-test.cjs');

function fixture(states: { carriageState: string; queuedMovesCount: number }[], failHome = false) {
  const calls: string[] = [];
  const device = {
    moveSkill: {
      async getCarriageStatus() {
        calls.push('status');
        return states.shift();
      },
    },
    uxStateMachineSkill: {
      async enterActiveState() {
        calls.push('active');
      },
      async exitActiveState() {
        calls.push('idle');
      },
    },
    homeAxesSkill: {
      async homeAxes(x: boolean, z: boolean) {
        assert.equal(x, true);
        assert.equal(z, true);
        calls.push('home');
        if (failHome) throw new Error('device rejected home');
      },
      async waitUntilHomeFinished() {
        calls.push('wait');
      },
    },
  };
  return { device, calls };
}
const idle = { carriageState: 'idle', queuedMovesCount: 0 };

test('homing refuses busy or queued machine states without sending motion', async () => {
  for (const state of [
    { ...idle, carriageState: 'moving' },
    { ...idle, queuedMovesCount: 1 },
  ]) {
    const { device, calls } = fixture([state]);
    await assert.rejects(homeIdleDevice(device), /must be idle/);
    assert.deepEqual(calls, ['status']);
  }
});
test('homing waits for completion and verifies idle before reporting success', async () => {
  const { device, calls } = fixture([idle, idle]);
  const result = await homeIdleDevice(device);
  assert.equal(result.homeCompleted, true);
  assert.deepEqual(calls, ['status', 'active', 'home', 'wait', 'status', 'idle']);
});
test('a rejected homing command restores UX state and propagates failure', async () => {
  const { device, calls } = fixture([idle], true);
  await assert.rejects(homeIdleDevice(device), /device rejected home/);
  assert.deepEqual(calls, ['status', 'active', 'home', 'idle']);
});
test('completion with remaining queued moves is a failure', async () => {
  const { device, calls } = fixture([idle, { ...idle, queuedMovesCount: 1 }]);
  await assert.rejects(homeIdleDevice(device), /did not return to idle/);
  assert.equal(calls.at(-1), 'idle');
});
