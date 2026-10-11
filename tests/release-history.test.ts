import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const { bundledReleaseHistory, mergeReleaseHistory } = createRequire(import.meta.url)(
  '../electron/release-history.cjs',
);

test('bundled history matches the changelog and includes only the installed version and earlier', async () => {
  const site = await import(new URL('../site/lib.mjs', import.meta.url).href);
  const changelog = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  const expected = site.changelogReleases(changelog);
  assert.deepEqual(
    bundledReleaseHistory('99.0.0').map((release: { version: string }) => release.version),
    expected.map((release: { tag_name: string }) => release.tag_name.slice(1)),
  );
  const history: UpdateState['changelog'] = mergeReleaseHistory(
    '0.13.0',
    bundledReleaseHistory('0.13.0'),
  );
  assert.equal(history[0].version, '0.13.0');
  assert.equal(history[0].isInstalled, true);
  assert.ok(history.every((release) => !release.isNew));
});

test('history sorts versions, replaces duplicate notes, and marks only newer releases as new', () => {
  const release = (version: string, body = '* Original notes') => ({
    version,
    body,
    publishedAt: null,
  });
  const history: UpdateState['changelog'] = mergeReleaseHistory(
    'v0.9.0+test',
    [release('0.8.0'), release('0.9.0'), release('0.10.0')],
    [release('0.10.0', '* Updated notes <script>bad()</script>'), release('0.11.0')],
  );
  assert.deepEqual(
    history.map((release) => [release.version, release.isNew, release.isInstalled]),
    [
      ['0.11.0', true, false],
      ['0.10.0', true, false],
      ['0.9.0', false, true],
      ['0.8.0', false, false],
    ],
  );
  assert.match(history[1].releaseNotesHtml, /Updated notes/);
  assert.doesNotMatch(history[1].releaseNotesHtml, /<script|bad\(\)/);
});
