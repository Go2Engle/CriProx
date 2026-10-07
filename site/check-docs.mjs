import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { needsDocumentation } from './lib.mjs';

if (!process.env.GITHUB_EVENT_PATH) {
  console.log('Documentation freshness is checked on feature pull requests in CI.');
} else {
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (event.pull_request) {
    const pr = event.pull_request;
    const files = execFileSync('git', ['diff', '--name-only', `${pr.base.sha}...${pr.head.sha}`], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n');
    if (
      needsDocumentation({ title: pr.title, files, labels: pr.labels.map((label) => label.name) })
    ) {
      throw new Error(
        'Feature PRs changing the app must update README.md or a docs/*.md guide so the website stays current. For a feature with no documentation impact, a maintainer may apply documentation-not-needed and rerun CI.',
      );
    }
    console.log('Documentation freshness check passed.');
  }
}
