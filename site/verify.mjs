import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { Parser } from 'htmlparser2';

// Verify the actual generated pages, including links originating in Markdown.
export async function verifySite(root, base) {
  const pages = new Map();
  const errors = [];
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await scan(file);
      else if (entry.name.endsWith('.html')) {
        const ids = new Set();
        const links = [];
        new Parser({
          onopentag(tag, attrs) {
            if (attrs.id) {
              if (ids.has(attrs.id)) errors.push(`${file}: duplicate id ${attrs.id}`);
              ids.add(attrs.id);
            }
            if (['a', 'link'].includes(tag) && attrs.href) links.push(attrs.href);
            if (tag === 'img' && attrs.src) links.push(attrs.src);
            if (tag === 'script' && attrs.src) links.push(attrs.src);
          },
        }).end(await readFile(file, 'utf8'));
        pages.set(file, { ids, links });
      }
    }
  }
  await scan(root);
  for (const [file, { links }] of pages) {
    for (const href of links) {
      if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) continue;
      const link = new URL(
        href,
        'https://local.invalid' + base + path.relative(root, file).split(path.sep).join('/'),
      );
      if (!link.pathname.startsWith(base)) {
        errors.push(`${file}: link outside site base ${href}`);
        continue;
      }
      let target = path.join(root, decodeURIComponent(link.pathname.slice(base.length)));
      try {
        if ((await stat(target)).isDirectory()) target = path.join(target, 'index.html');
        await stat(target);
      } catch {
        errors.push(`${file}: missing target ${href}`);
        continue;
      }
      if (
        link.hash &&
        pages.has(target) &&
        !pages.get(target).ids.has(decodeURIComponent(link.hash.slice(1)))
      ) {
        errors.push(`${file}: missing anchor ${href}`);
      }
    }
  }
  if (errors.length) throw new Error(`Website verification failed:\n${errors.join('\n')}`);
}
