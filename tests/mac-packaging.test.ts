import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('macOS releases remain unsigned until signing credentials are configured', async () => {
  const packageJson = JSON.parse(
    await readFile(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const releaseWorkflow = await readFile(
    new URL('../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );
  const mac = packageJson.build.mac;

  assert.equal(mac.identity, null);
  assert.equal(mac.hardenedRuntime, true);
  assert.equal(mac.notarize, undefined);
  assert.match(mac.extendInfo.NSDocumentsFolderUsageDescription, /Documents folder/);
  assert.doesNotMatch(packageJson.scripts['package:mac'], /forceCodeSigning/);
  for (const secret of [
    'CSC_LINK',
    'CSC_KEY_PASSWORD',
    'APPLE_ID',
    'APPLE_APP_SPECIFIC_PASSWORD',
    'APPLE_TEAM_ID',
  ]) {
    assert.doesNotMatch(
      releaseWorkflow,
      new RegExp(`${secret}: \\$\\{\\{ secrets\\.${secret} \\}\\}`),
    );
  }
});

test('an existing draft release can be rebuilt manually', async () => {
  const releaseWorkflow = await readFile(
    new URL('../.github/workflows/release.yml', import.meta.url),
    'utf8',
  );

  assert.match(releaseWorkflow, /workflow_dispatch:/);
  assert.match(releaseWorkflow, /release_tag:/);
  assert.match(releaseWorkflow, /release_ref:/);
  assert.match(releaseWorkflow, /gh release view "\$RELEASE_TAG"/);
});
