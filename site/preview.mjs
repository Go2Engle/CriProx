import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeBase } from './lib.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '_site');
const base = normalizeBase(process.env.SITE_BASE_PATH);
const port = Number(process.env.PORT || 4174);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml',
  '.txt': 'text/plain',
};
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if (pathname === '/' && base !== '/') {
      response.writeHead(302, { Location: base });
      response.end();
      return;
    }
    if (!pathname.startsWith(base)) throw new Error('Not found');
    let file = path.resolve(root, pathname.slice(base.length));
    if (file !== root && !file.startsWith(root + path.sep)) throw new Error('Not found');
    if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html');
    const body = await readFile(file);
    response.writeHead(200, {
      'Content-Type': types[path.extname(file)] || 'application/octet-stream',
    });
    response.end(body);
  } catch {
    response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(await readFile(path.join(root, '404.html')).catch(() => 'Build the site first.'));
  }
}).listen(port, '127.0.0.1', () => console.log(`CriProx website: http://127.0.0.1:${port}${base}`));
