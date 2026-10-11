const { readFileSync } = require('node:fs');
const path = require('node:path');
const { isNewerVersion } = require('./release-check.cjs');
const { formatReleaseNotes } = require('./release-notes.cjs');

function bundledReleaseHistory(currentVersion) {
  const changelog = readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf8');
  return changelog
    .split(/(?=^## \[\d)/m)
    .slice(1)
    .flatMap((body) => {
      const match = body.match(/^## \[(\d+\.\d+\.\d+)\]\([^)]+\) \((\d{4}-\d{2}-\d{2})\)/);
      if (!match || isNewerVersion(match[1], currentVersion)) return [];
      return [{ version: match[1], body, publishedAt: `${match[2]}T00:00:00Z` }];
    });
}

function mergeReleaseHistory(currentVersion, ...histories) {
  const releases = new Map();
  for (const release of histories.flat()) {
    releases.set(release.version, {
      version: release.version,
      publishedAt: release.publishedAt,
      ...formatReleaseNotes(release),
      isNew: isNewerVersion(release.version, currentVersion),
      isInstalled: release.version === currentVersion.replace(/^v/, '').split('+')[0],
    });
  }
  return [...releases.values()].sort((left, right) =>
    isNewerVersion(left.version, right.version)
      ? -1
      : isNewerVersion(right.version, left.version)
        ? 1
        : 0,
  );
}

module.exports = { bundledReleaseHistory, mergeReleaseHistory };
