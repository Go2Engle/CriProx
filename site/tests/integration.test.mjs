import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifySite } from '../verify.mjs';

const site = fileURLToPath(new URL('../', import.meta.url));
test('complete build keeps current docs, uses stable installer assets, and verifies Pages links', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'criprox-site-test-'));
  const fixture = path.join(temporary, 'releases.json');
  const releases = [
    {
      tag_name: 'v1.2.3',
      name: 'v1.2.3',
      published_at: '2026-10-01T12:00:00Z',
      html_url: 'https://github.com/Go2Engle/CriProx/releases/tag/v1.2.3',
      body: '### Features\n* **artwork:** add a new image source',
      assets: [
        {
          name: 'CriProx.dmg',
          browser_download_url:
            'https://github.com/Go2Engle/CriProx/releases/download/v1.2.3/CriProx.dmg',
        },
      ],
    },
    { tag_name: 'v1.2.4-draft', draft: true, published_at: '2026-10-02T12:00:00Z' },
    { tag_name: 'v1.3.0-beta', prerelease: true, published_at: '2026-10-03T12:00:00Z' },
  ];
  try {
    await writeFile(fixture, JSON.stringify(releases));
    execFileSync(process.execPath, [path.join(site, 'build.mjs')], {
      env: { ...process.env, RELEASES_FILE: fixture, SITE_BASE_PATH: '/CriProx/' },
    });
    const home = await readFile(path.join(site, '_site/index.html'), 'utf8');
    const timeline = await readFile(path.join(site, '_site/changelog/index.html'), 'utf8');
    const guide = await readFile(path.join(site, '_site/docs/features/index.html'), 'utf8');
    assert.match(home, /releases\/download\/v1.2.3\/CriProx.dmg/);
    assert.match(timeline, /id="v1.2.3-new"/);
    assert.doesNotMatch(timeline, /v1.2.4-draft|v1.3.0-beta/);
    assert.match(guide, /Card and artwork sources/);
    assert.match(home, /<script src="\/CriProx\/assets\/nav.js" defer><\/script>/);
    assert.doesNotMatch(home, /<script(?! src=)/);
    assert.match(home, /<details class="mobile-navigation">/);
    assert.match(timeline, /<h2>Add a new image source<\/h2>/);
    assert.match(timeline, /class="version" href="#v1.2.3"/);
    assert.match(timeline, /class="atom-link"/);
    assert.match(await readFile(path.join(site, '_site/assets/nav.js'), 'utf8'), /Escape/);
    await verifySite(path.join(site, '_site'), '/CriProx/');
    // The same source must work at a custom domain's root as well.
    execFileSync(process.execPath, [path.join(site, 'build.mjs')], {
      env: { ...process.env, RELEASES_FILE: fixture, SITE_BASE_PATH: '/' },
    });
    await verifySite(path.join(site, '_site'), '/');
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test('generated-site verification rejects broken Markdown links and duplicate anchors', async () => {
  const temporary = await mkdtemp(path.join(tmpdir(), 'criprox-site-invalid-'));
  try {
    await writeFile(
      path.join(temporary, 'index.html'),
      '<h1 id="a">A</h1><h2 id="a">B</h2><a href="/CriProx/missing/">Missing</a><script src="/CriProx/assets/missing.js"></script>',
    );
    await assert.rejects(verifySite(temporary, '/CriProx/'), /duplicate id a[\s\S]*missing target/);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});
