const RELEASE_API = 'https://api.github.com/repos/Go2Engle/CriProx/releases/latest';

function parseVersion(value) {
  const match = String(value)
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/);
  if (!match) return null;
  return {
    numbers: match.slice(1, 4).map(Number),
    prerelease: match[4]?.split('.') || [],
  };
}

function comparePrerelease(left, right) {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    if (left[index] === undefined) return -1;
    if (right[index] === undefined) return 1;
    if (left[index] === right[index]) continue;
    const leftNumber = /^\d+$/.test(left[index]);
    const rightNumber = /^\d+$/.test(right[index]);
    if (leftNumber && rightNumber) return Number(left[index]) > Number(right[index]) ? 1 : -1;
    if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
    return left[index] > right[index] ? 1 : -1;
  }
  return 0;
}

function isNewerVersion(candidate, current) {
  const left = parseVersion(candidate);
  const right = parseVersion(current);
  if (!left || !right) return false;
  for (let index = 0; index < 3; index += 1) {
    if (left.numbers[index] !== right.numbers[index]) {
      return left.numbers[index] > right.numbers[index];
    }
  }
  return comparePrerelease(left.prerelease, right.prerelease) > 0;
}

function isTrustedReleaseUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'github.com' &&
      !url.username &&
      !url.password &&
      /^\/Go2Engle\/CriProx\/releases\/tag\/[^/]+$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

async function findAvailableRelease(currentVersion, fetchRelease = fetch) {
  const response = await fetchRelease(RELEASE_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `CriProx/${currentVersion}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) return null;
  const release = await response.json();
  if (
    release.draft ||
    release.prerelease ||
    !isNewerVersion(release.tag_name, currentVersion) ||
    !isTrustedReleaseUrl(release.html_url)
  ) {
    return null;
  }
  return {
    currentVersion,
    latestVersion: release.tag_name.replace(/^v/, ''),
    releaseUrl: release.html_url,
  };
}

module.exports = { findAvailableRelease, isNewerVersion, isTrustedReleaseUrl };
