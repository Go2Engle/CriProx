import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchTokens, scryfallTokenSearchPath } from '../src/lib/scryfall';

test('token browsing starts with all paper printings and safely scopes optional filters', () => {
  const all = new URL(scryfallTokenSearchPath(), 'https://api.scryfall.com');
  assert.equal(all.searchParams.get('q'), 'is:token game:paper');
  assert.equal(all.searchParams.get('unique'), 'prints');
  assert.equal(all.searchParams.get('order'), 'released');
  assert.equal(all.searchParams.get('dir'), 'desc');
  assert.equal(all.searchParams.get('include_extras'), 'true');
  assert.equal(all.searchParams.get('include_variations'), 'true');
  const filtered = new URL(
    scryfallTokenSearchPath('  Treasure  ', ' TMH2 ', 'artist', 'asc'),
    'https://api.scryfall.com',
  );
  assert.equal(filtered.searchParams.get('q'), 'is:token game:paper name:"Treasure" set:tmh2');
  assert.equal(filtered.searchParams.get('order'), 'artist');
  assert.equal(filtered.searchParams.get('dir'), 'asc');
  const escaped = new URL(
    scryfallTokenSearchPath('" OR game:arena \\'),
    'https://api.scryfall.com',
  );
  assert.equal(escaped.searchParams.get('q'), 'is:token game:paper name:"\\" OR game:arena \\\\"');
  assert.throws(() => scryfallTokenSearchPath('', 'tmh2 OR game:arena'), /valid token set code/);
});

const token = (id: string, collector: string) => ({
  id,
  oracle_id: 'treasure-oracle',
  name: 'Treasure',
  layout: 'token',
  set: 'tmh2',
  set_name: 'Modern Horizons 2 Tokens',
  collector_number: collector,
  image_uris: {
    png: `https://cards.scryfall.io/${id}.png`,
    normal: `https://cards.scryfall.io/${id}.jpg`,
  },
});

test('token pagination preserves different artwork and double-faced tokens in server order', async (t) => {
  const next = `https://api.scryfall.com${scryfallTokenSearchPath('Treasure', '', 'name', 'asc')}&page=2`;
  const urls: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    urls.push(url);
    return Response.json(
      urls.length === 1
        ? {
            data: [
              token('art-1', '1'),
              token('art-2', '2'),
              { ...token('no-art', '3'), image_uris: undefined },
            ],
            total_cards: 4,
            has_more: true,
            next_page: next,
          }
        : {
            data: [
              {
                ...token('double', '4'),
                layout: 'double_faced_token',
                image_uris: undefined,
                card_faces: [
                  { name: 'Treasure', image_uris: token('front', '4').image_uris },
                  { name: 'Goblin', image_uris: token('back', '4').image_uris },
                ],
              },
            ],
            total_cards: 4,
            has_more: false,
          },
    );
  });
  const first = await searchTokens('Treasure', '', 'name', 'asc');
  assert.deepEqual(
    first.cards.map((card) => card.id),
    ['art-1', 'art-2'],
  );
  assert.equal(first.total, 4);
  assert.equal(first.next, next);
  const second = await searchTokens('Treasure', '', 'name', 'asc', first.next);
  assert.equal(urls[1], next);
  assert.equal(second.cards[0].kind, 'token');
  assert.equal(second.cards[0].faces[1].name, 'Goblin');
  assert.equal(second.next, undefined);
});

test('unmatched token filters are empty while service and pagination errors remain retryable', async (t) => {
  let status = 404;
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ details: 'Unavailable' }, { status }),
  );
  assert.deepEqual(await searchTokens('No such token'), { cards: [], total: 0 });
  status = 503;
  await assert.rejects(searchTokens(), /Unavailable/);
  status = 429;
  await assert.rejects(searchTokens(), /rate limiting/);
  status = 404;
  await assert.rejects(
    searchTokens('', '', 'released', 'desc', 'https://api.scryfall.com/cards/search?page=2'),
    /Unavailable/,
  );
});
