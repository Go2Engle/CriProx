import { test } from 'node:test';
import assert from 'node:assert/strict';
import { watchCutterPage, type CutterPageApi } from '../src/lib/cutter-page-connection';
import { DISCONNECTED_CUTTER, type CutterState } from '../src/lib/cutter';

const idle: CutterState = { ...DISCONNECTED_CUTTER, supported: true, message: 'Not connected' };
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
function fixture(key = true) {
  const connections: string[] = [],
    saved: boolean[] = [],
    states: CutterState[] = [],
    errors: string[] = [],
    pending: boolean[] = [];
  let subscriber: (s: CutterState) => void = () => {},
    reads = 0;
  const api: CutterPageApi = {
    state: async () => idle,
    keyStatus: async () => {
      reads++;
      return { available: key };
    },
    connectSaved: async (transport) => {
      connections.push(transport);
      return { ...idle, status: 'connected', encrypted: true };
    },
    onState: (callback) => {
      subscriber = callback;
      return () => {
        subscriber = () => {};
      };
    },
  };
  return {
    api,
    connections,
    saved,
    states,
    errors,
    pending,
    reads: () => reads,
    emit: (state: CutterState) => subscriber(state),
    handlers: {
      state: (s: CutterState) => states.push(s),
      savedKey: (v: boolean) => saved.push(v),
      pending: (v: boolean) => pending.push(v),
      error: (v: string) => errors.push(v),
    },
  };
}
test('the visible cut page connects once with a saved key and never retries from status events', async () => {
  const f = fixture();
  const stop = watchCutterPage(f.api, 'usb', f.handlers);
  await tick();
  assert.deepEqual(f.connections, ['usb']);
  assert.deepEqual(f.saved, [true]);
  assert.equal(f.states.at(-1)!.status, 'connected');
  f.emit(idle);
  await tick();
  assert.equal(f.connections.length, 1, 'manual disconnection does not reconnect automatically');
  stop();
  f.emit({ ...idle, status: 'error' });
  assert.equal(f.states.at(-1)!.status, 'disconnected');
  assert.deepEqual(f.pending, [true, false]);
});
test('a missing key requests setup without contacting the cutter', async () => {
  const f = fixture(false);
  const stop = watchCutterPage(f.api, 'usb', f.handlers);
  await tick();
  assert.deepEqual(f.saved, [false]);
  assert.deepEqual(f.connections, []);
  stop();
});
test('a failed saved key refreshes availability for the setup prompt without a retry', async () => {
  const f = fixture();
  let reads = 0;
  f.api.keyStatus = async () => ({ available: ++reads === 1 });
  f.api.connectSaved = async (transport) => {
    f.connections.push(transport);
    throw Error('Could not authenticate with the saved cutter key.');
  };
  const stop = watchCutterPage(f.api, 'ble', f.handlers);
  await tick();
  assert.deepEqual(f.connections, ['ble']);
  assert.deepEqual(f.saved, [true, false]);
  assert.match(f.errors[0], /saved cutter key/);
  stop();
});
test('hidden or closed cut pages and existing active connections do not initiate a connection', async () => {
  const f = fixture();
  const stop = watchCutterPage(f.api, 'usb', f.handlers);
  stop();
  await tick();
  assert.equal(f.connections.length, 0);
  assert.equal(f.reads(), 0);
  for (const status of ['connected', 'connecting', 'cutting'] as const) {
    const active = fixture();
    active.api.state = async () => ({ ...idle, status, encrypted: status !== 'connecting' });
    const stop = watchCutterPage(active.api, 'usb', active.handlers);
    await tick();
    assert.equal(active.connections.length, 0);
    stop();
  }
});
