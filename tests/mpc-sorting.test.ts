import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MPC_ARTWORK_SORT_OPTIONS,
  mpcExploreSearchPayload,
  normalizeMpcArtwork,
  searchMpcArtwork,
  sortMpcArtwork,
  type MpcArtwork,
} from '../src/lib/mpc';

const artwork = (id: string, dpi: number): MpcArtwork =>
  normalizeMpcArtwork({
    identifier: id,
    name: 'Sol Ring',
    sourceName: 'Artist',
    dpi,
  });

test('DPI sorting combines pages, preserves ties, and places unknown DPI last in either direction', () => {
  const first = [artwork('low', 300), artwork('high', 1200), artwork('same', 1200)];
  const combined = [
    ...first,
    artwork('highest', 1500),
    artwork('unknown', 0),
    artwork('invalid', NaN),
  ];
  assert.deepEqual(
    sortMpcArtwork(combined, 'dpiDescending').map((item) => item.id),
    ['highest', 'high', 'same', 'low', 'unknown', 'invalid'],
  );
  assert.deepEqual(
    sortMpcArtwork(combined, 'dpiAscending').map((item) => item.id),
    ['low', 'high', 'same', 'highest', 'unknown', 'invalid'],
  );
  assert.deepEqual(
    first.map((item) => item.id),
    ['low', 'high', 'same'],
  );
  assert.deepEqual(
    combined.map((item) => item.id),
    ['low', 'high', 'same', 'highest', 'unknown', 'invalid'],
  );
  for (const sort of ['nameAscending', 'nameDescending', 'dateModifiedDescending'] as const) {
    assert.deepEqual(sortMpcArtwork(combined, sort), combined);
  }
});

test('every artwork sort uses supported API ordering and preserves filters and page offsets', () => {
  for (const type of ['CARD', 'TOKEN', 'CARDBACK'] as const) {
    for (const { value } of MPC_ARTWORK_SORT_OPTIONS) {
      const payload = mpcExploreSearchPayload('  Sol Ring  ', type, 2, [12, 34], value);
      assert.equal(payload.sortBy, value.startsWith('dpi') ? 'nameAscending' : value);
      assert.equal(payload.pageStart, 48);
      assert.equal(payload.pageSize, 24);
      assert.deepEqual(payload.cardTypes, [type]);
      assert.equal(payload.query, 'Sol Ring');
      assert.equal(payload.searchSettings.searchTypeSettings.filterCardbacks, type === 'CARDBACK');
      assert.deepEqual(payload.searchSettings.sourceSettings.sources, [
        [12, true],
        [34, true],
      ]);
      assert.deepEqual(payload.searchSettings.filterSettings.excludesTags, ['NSFW']);
    }
    assert.equal(mpcExploreSearchPayload('', type, 0, []).sortBy, 'nameAscending');
  }
});

test('artwork requests retain selected server sort through pagination and a restarted search', async (t) => {
  const requests: { sortBy: string; pageStart: number }[] = [];
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => {
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: {
      criprox: {
        mpcRequest: async (path: string, _method: string, body: unknown) => {
          if (path === '/2/sources/') return { results: { artist: { pk: 12 } } };
          requests.push(body as (typeof requests)[number]);
          return {
            cards: [
              {
                identifier: `art-${requests.length}`,
                name: 'Sol Ring',
                sourceName: 'Artist',
                sourceType: 'Google Drive',
                dpi: 600,
              },
            ],
            count: 25,
          };
        },
      },
    },
  });
  const first = await searchMpcArtwork('Sol Ring', 'CARD', 0, 'nameDescending');
  assert.equal(first.more, true);
  const second = await searchMpcArtwork('Sol Ring', 'CARD', 1, 'nameDescending');
  assert.equal(second.more, false);
  assert.notEqual(first.artwork[0].id, second.artwork[0].id);
  await searchMpcArtwork('Sol Ring', 'CARD', 0, 'dateModifiedDescending');
  await searchMpcArtwork('Sol Ring', 'CARD');
  assert.deepEqual(
    requests.map(({ sortBy, pageStart }) => ({ sortBy, pageStart })),
    [
      { sortBy: 'nameDescending', pageStart: 0 },
      { sortBy: 'nameDescending', pageStart: 24 },
      { sortBy: 'dateModifiedDescending', pageStart: 0 },
      { sortBy: 'nameAscending', pageStart: 0 },
    ],
  );
});
