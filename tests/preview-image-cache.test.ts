import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PreviewImageCache,
  previewCacheEvictions,
  type PreviewImageStorage,
} from '../src/lib/preview-image-cache';

function storage(): PreviewImageStorage {
  const images = new Map<string, Blob>();
  return {
    read: async (source) => images.get(source),
    write: async (source, blob) => {
      images.set(source, blob);
    },
  };
}
const image = (content = 'image') => new Blob([content], { type: 'image/jpeg' });

test('sort changes and concurrent requests reuse a single image download', async () => {
  const downloads: string[] = [];
  const cache = new PreviewImageCache(storage(), async (source) => {
    downloads.push(source);
    return image(source);
  });
  const first = await Promise.all([cache.get('card-a'), cache.get('card-a'), cache.get('card-b')]);
  const sorted = await Promise.all([cache.get('card-b'), cache.get('card-a')]);
  assert.deepEqual(downloads, ['card-a', 'card-b']);
  assert.equal(first[0], first[1]);
  assert.equal(sorted[0], first[2]);
  assert.equal(sorted[1], first[0]);
});

test('an app restart reads cached image bytes without downloading again', async () => {
  const disk = storage();
  const first = new PreviewImageCache(disk, async () => image());
  await first.get('card');
  const restarted = new PreviewImageCache(disk, async () => {
    throw new Error('Network offline');
  });
  assert.equal(await (await restarted.get('card')).text(), 'image');
});

test('memory eviction preserves disk reuse and keeps recently viewed previews', async () => {
  const disk = storage();
  let reads = 0;
  let downloads = 0;
  const cache = new PreviewImageCache(
    {
      ...disk,
      read: async (source) => {
        reads++;
        return disk.read(source);
      },
    },
    async () => {
      downloads++;
      return image('1234');
    },
    8,
  );
  await cache.get('a');
  await cache.get('b');
  await cache.get('a'); // a is more recent than b
  await cache.get('c');
  await cache.get('a');
  assert.equal(reads, 3);
  await cache.get('b'); // evicted from memory, still on disk
  assert.equal(reads, 4);
  assert.equal(downloads, 3);
});

test('disk eviction respects byte and entry limits while retaining the newest images', () => {
  const records = [
    { source: 'a', bytes: 4 },
    { source: 'b', bytes: 3 },
    { source: 'c', bytes: 4 },
  ];
  assert.deepEqual(previewCacheEvictions(records, 7), {
    keep: records.slice(1),
    remove: records.slice(0, 1),
  });
  assert.deepEqual(previewCacheEvictions(records, 100, 1), {
    keep: records.slice(2),
    remove: records.slice(0, 2),
  });
  assert.deepEqual(previewCacheEvictions([{ source: 'oversized', bytes: 12 }], 7), {
    keep: [],
    remove: [{ source: 'oversized', bytes: 12 }],
  });
});

test('unavailable or full storage still allows sorting without repeated downloads in the session', async () => {
  let downloads = 0;
  const cache = new PreviewImageCache(
    {
      read: async () => {
        throw new Error('Storage disabled');
      },
      write: async () => {
        throw new Error('Quota exceeded');
      },
    },
    async () => {
      downloads++;
      return image();
    },
  );
  await cache.get('card');
  await cache.get('card');
  assert.equal(downloads, 1);
});

test('failed downloads are not cached and can be retried', async () => {
  let attempts = 0;
  const cache = new PreviewImageCache(storage(), async () => {
    if (++attempts === 1) throw new Error('Offline');
    return image();
  });
  await assert.rejects(cache.get('card'), /Offline/);
  assert.equal(await (await cache.get('card')).text(), 'image');
  assert.equal(attempts, 2);
});

test('HTTP errors and non-image responses are never saved as previews', async (t) => {
  const responses = [
    new Response('Unavailable', { status: 503 }),
    new Response('<html>Error</html>', { headers: { 'Content-Type': 'text/html' } }),
    new Response('', { headers: { 'Content-Type': 'image/jpeg' } }),
    new Response(image()),
  ];
  const fetch = t.mock.method(globalThis, 'fetch', async () => responses.shift()!);
  const cache = new PreviewImageCache(storage());
  await assert.rejects(cache.get('card'), /Could not load/);
  await assert.rejects(cache.get('card'), /not an image/);
  await assert.rejects(cache.get('card'), /not an image/);
  await cache.get('card');
  await cache.get('card');
  assert.equal(fetch.mock.callCount(), 4);
});

test('preview downloads limit concurrency without starving queued images', async () => {
  let active = 0;
  let maximum = 0;
  const finish: (() => void)[] = [];
  const cache = new PreviewImageCache(
    storage(),
    async () => {
      active++;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => finish.push(resolve));
      active--;
      return image();
    },
    32,
    2,
  );
  const loads = ['a', 'b', 'c', 'd'].map((source) => cache.get(source));
  for (let index = 0; index < loads.length; index++) {
    while (!finish.length) await new Promise((resolve) => setImmediate(resolve));
    finish.shift()!();
  }
  await Promise.all(loads);
  assert.equal(maximum, 2);
  assert.equal(active, 0);
});
