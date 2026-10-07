import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  listSets,
  searchSetCards,
  SET_CARD_SORTS,
  scryfallSetSearchPath,
} from '../src/lib/scryfall';

test('set searches preserve all printings, extras, and variations with the selected global sort', () => {
  for (const sort of SET_CARD_SORTS) {
    for (const direction of ['asc', 'desc'] as const) {
      const url = new URL(
        scryfallSetSearchPath(' MH2 ', sort.value, direction),
        'https://api.scryfall.com',
      );
      assert.equal(url.pathname, '/cards/search');
      assert.equal(url.searchParams.get('q'), 'set:mh2 game:paper');
      assert.equal(url.searchParams.get('unique'), 'prints');
      assert.equal(url.searchParams.get('order'), sort.value);
      assert.equal(url.searchParams.get('dir'), direction);
      assert.equal(url.searchParams.get('include_extras'), 'true');
      assert.equal(url.searchParams.get('include_variations'), 'true');
    }
  }
  assert.throws(() => scryfallSetSearchPath('mh2 OR set:lea'), /valid set/);
  assert.throws(() => scryfallSetSearchPath(''), /valid set/);
});

test('set catalog retains token, supplemental, announced, and digital metadata for the browser', async (t) => {
  const sets = [
    {
      id: 'main',
      code: 'mh2',
      name: 'Modern Horizons 2',
      card_count: 494,
      set_type: 'draft_innovation',
      digital: false,
      released_at: '2021-06-18',
    },
    {
      id: 'token',
      code: 'tmh2',
      name: 'Modern Horizons 2 Tokens',
      card_count: 21,
      set_type: 'token',
      digital: false,
    },
    {
      id: 'future',
      code: 'future',
      name: 'Announced set',
      card_count: 0,
      set_type: 'expansion',
      digital: false,
    },
    {
      id: 'digital',
      code: 'digital',
      name: 'Digital set',
      card_count: 40,
      set_type: 'alchemy',
      digital: true,
    },
  ];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    assert.equal(url, 'https://api.scryfall.com/sets');
    return Response.json({ data: sets });
  });
  assert.deepEqual(await listSets(), sets);
});

const rawCard = (id: string, collector: string) => ({
  id,
  oracle_id: 'same-oracle',
  name: 'Plains',
  set: 'mh2',
  set_name: 'Modern Horizons 2',
  collector_number: collector,
  image_uris: {
    png: `https://cards.scryfall.io/${id}.png`,
    normal: `https://cards.scryfall.io/${id}.jpg`,
  },
});

test('set pagination keeps distinct printings of the same card and follows the server sort', async (t) => {
  const next =
    'https://api.scryfall.com/cards/search?q=set%3Amh2%20game%3Apaper&unique=prints&order=rarity&dir=desc&page=2';
  const paths: string[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string) => {
    paths.push(url);
    return Response.json(
      paths.length === 1
        ? {
            data: [rawCard('art-1', '1'), rawCard('art-2', '2')],
            total_cards: 3,
            has_more: true,
            next_page: next,
          }
        : { data: [rawCard('art-3', '3')], total_cards: 3, has_more: false },
    );
  });
  const first = await searchSetCards('mh2', 'rarity', 'desc');
  assert.deepEqual(
    first.cards.map((card) => [card.id, card.collector]),
    [
      ['art-1', '1'],
      ['art-2', '2'],
    ],
  );
  assert.equal(first.total, 3);
  assert.equal(first.next, next);
  const second = await searchSetCards('mh2', 'rarity', 'desc', first.next);
  assert.equal(paths[1], next);
  assert.equal(second.cards[0].id, 'art-3');
  assert.equal(second.next, undefined);
});

test('set cards preserve token and matching reverse-face artwork and omit records without images', async (t) => {
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({
      data: [
        { ...rawCard('token', '1'), layout: 'token' },
        {
          ...rawCard('double', '2'),
          image_uris: undefined,
          layout: 'transform',
          card_faces: [
            {
              name: 'Front',
              image_uris: {
                png: 'https://cards.scryfall.io/front.png',
                normal: 'https://cards.scryfall.io/front.jpg',
              },
            },
            {
              name: 'Back',
              image_uris: {
                png: 'https://cards.scryfall.io/back.png',
                normal: 'https://cards.scryfall.io/back.jpg',
              },
            },
          ],
        },
        { ...rawCard('no-art', '3'), image_uris: undefined },
      ],
      total_cards: 3,
    }),
  );
  const result = await searchSetCards('mh2');
  assert.equal(result.cards.length, 2);
  assert.equal(result.cards[0].kind, 'token');
  assert.equal(result.cards[1].faces[1].image, 'https://cards.scryfall.io/back.png');
  assert.equal(result.total, 3);
});

test('announced sets with no cards are empty while service failures remain retryable errors', async (t) => {
  let status = 404;
  t.mock.method(globalThis, 'fetch', async () =>
    Response.json({ details: 'Service unavailable' }, { status }),
  );
  assert.deepEqual(await searchSetCards('future'), { cards: [], total: 0 });
  status = 503;
  await assert.rejects(searchSetCards('mh2'), /Service unavailable/);
  status = 429;
  await assert.rejects(searchSetCards('mh2'), /rate limiting/);
  status = 404;
  await assert.rejects(
    searchSetCards('mh2', 'name', 'asc', 'https://api.scryfall.com/cards/search?page=2'),
    /Service unavailable/,
  );
});
