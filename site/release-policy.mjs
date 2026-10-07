const websitePaths = ['site/', 'docs/assets/', 'docs/WEBSITE.md', '.github/workflows/pages.yml'];

function isWebsitePath(file) {
  return websitePaths.some((path) => (path.endsWith('/') ? file.startsWith(path) : file === path));
}

export function assertSiteReleasePolicy({ title, body = '', files }) {
  const siteScope = /^[a-z]+\(site\)!?:/i.test(title);
  const websiteOnly =
    files.some(isWebsitePath) && files.every((file) => isWebsitePath(file) || file === 'README.md');
  if (!siteScope && !websiteOnly) return;
  if (
    !/^(chore|docs|style)(\([^\r\n)]+\))?: /i.test(title) ||
    /^\s*BREAKING(?: CHANGE|-CHANGE):/m.test(body)
  ) {
    throw new Error(
      'Website changes must use a non-breaking chore(site), docs(site), or style(site) PR title. Do not use feat, fix, perf, or breaking-change footers: website updates must not trigger app releases or appear in app release notes. Split app behavior changes into a separate PR.',
    );
  }
}
