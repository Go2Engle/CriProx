import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('macOS releases require a stable signed and notarized identity', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const releaseWorkflow = await readFile(
    new URL('../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );
  const mac = packageJson.build.mac;

  assert.equal(mac.identity, undefined);
  assert.equal(mac.hardenedRuntime, true);
  assert.equal(mac.notarize, true);
  assert.match(mac.extendInfo.NSDocumentsFolderUsageDescription, /Documents folder/);
  assert.match(packageJson.scripts['package:mac'], /forceCodeSigning=true/);
  for (const secret of [
    'CSC_LINK',
    'CSC_KEY_PASSWORD',
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
  ]) {
    assert.match(releaseWorkflow, new RegExp(`${secret}: \\$\\{\\{ secrets\\.${secret} \\}\\}`));
  }
});
