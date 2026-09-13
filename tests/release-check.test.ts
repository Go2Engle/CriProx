import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { findAvailableRelease, isNewerVersion, isTrustedReleaseUrl } =
  require('../electron/release-check.cjs') as {
    findAvailableRelease: (
      currentVersion: string,
      fetchRelease?: (url: string, init: RequestInit) => Promise<Response>,
    ) => Promise<ReleaseUpdate | null>;
    isNewerVersion: (candidate: string, current: string) => boolean;
    isTrustedReleaseUrl: (value: string) => boolean;
  };

test('release versions use semantic version precedence', () => {
  assert.equal(isNewerVersion('v0.2.0', '0.1.9'), true);
  assert.equal(isNewerVersion('0.1.1', '0.1.0'), true);
  assert.equal(isNewerVersion('0.1.0', '0.1.0'), false);
  assert.equal(isNewerVersion('0.0.9', '0.1.0'), false);
  assert.equal(isNewerVersion('1.0.0', '1.0.0-beta.2'), true);
  assert.equal(isNewerVersion('not-a-version', '0.1.0'), false);
});

test('only CriProx GitHub release pages can be opened by the renderer', () => {
  assert.equal(
    isTrustedReleaseUrl('https://github.com/Go2Engle/CriProx/releases/tag/v0.2.0'),
    true,
  );
  assert.equal(isTrustedReleaseUrl('https://github.com/Go2Engle/Other/releases/tag/v0.2.0'), false);
  assert.equal(
    isTrustedReleaseUrl('https://github.com.evil.example/Go2Engle/CriProx/releases/tag/v0.2.0'),
    false,
  );
});

test('release checks return a newer stable GitHub release', async () => {
  const update = await findAvailableRelease('0.1.0', async (url, init) => {
    assert.equal(url, 'https://api.github.com/repos/Go2Engle/CriProx/releases/latest');
    assert.match(
      String((init.headers as Record<string, string>)['User-Agent']),
      /CriProx\/0\.1\.0/,
    );
    return new Response(
      JSON.stringify({
        tag_name: 'v0.2.0',
        html_url: 'https://github.com/Go2Engle/CriProx/releases/tag/v0.2.0',
        draft: false,
        prerelease: false,
      }),
      { status: 200 },
    );
  });

  assert.deepEqual(update, {
    currentVersion: '0.1.0',
    latestVersion: '0.2.0',
    releaseUrl: 'https://github.com/Go2Engle/CriProx/releases/tag/v0.2.0',
  });
});
