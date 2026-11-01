import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
const { findCricutInstallation } = createRequire(import.meta.url)(
  '../electron/cricut-installation.cjs',
);

test('installation discovery reports files only, without treating an installed bridge as a connected machine', async () => {
  const root = path.join('C:\\User\\Local', 'Programs', 'Cricut Design Space');
  const files = new Set([
    path.join(root, 'Cricut Design Space.exe'),
    path.join(root, 'resources', 'plugins', 'cricut-device-io', 'CricutDeviceIO.exe'),
  ]);
  const io = {
    stat: async (p: string) => {
      if (!files.has(p)) throw new Error('ENOENT');
      return { isFile: () => true };
    },
    readFile: async () => '43.2.0\n',
  };
  assert.deepEqual(
    await findCricutInstallation({
      platform: 'win32',
      env: { LOCALAPPDATA: 'C:\\User\\Local' },
      io,
    }),
    {
      executable: path.join(root, 'Cricut Design Space.exe'),
      version: '43.2.0',
      bridgeInstalled: true,
    },
  );
  assert.equal(await findCricutInstallation({ platform: 'linux', env: {}, io }), null);
  assert.equal(await findCricutInstallation({ platform: 'win32', env: {}, io }), null);
  files.delete(path.join(root, 'resources', 'plugins', 'cricut-device-io', 'CricutDeviceIO.exe'));
  const partial = await findCricutInstallation({
    platform: 'win32',
    env: { LOCALAPPDATA: 'C:\\User\\Local' },
    io: { ...io, readFile: async () => '<bad metadata>' },
  });
  assert.equal(partial.version, null);
  assert.equal(partial.bridgeInstalled, false);
});
