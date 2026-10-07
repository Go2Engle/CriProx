import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCommanderPrecon, parsePreconCards, parsePreconCatalog } from '../src/lib/precons';
import { resolveCardIds } from '../src/lib/scryfall';

const cardSpec = (id: string, name = id, count = 1) => ({
  name,
  count,
  identifiers: { scryfallId: id },
});
const rawCard = (id: string) => ({
  id,
  oracle_id: id,
  name: id,
  set: 'cmm',
  set_name: 'Commander Masters',
  collector_number: '1',
  image_uris: {
    png: `https://cards.scryfall.io/${id}.png`,
    normal: `https://cards.scryfall.io/${id}.jpg`,
  },
});

test('precon catalog includes paper Commander Deck products and keeps edition identities distinct', () => {
  const deck = {
    name: 'A precon',
    code: 'CMM',
    fileName: 'A_CMM',
    releaseDate: '2023-08-04',
    type: 'Commander Deck',
  };
  assert.deepEqual(
    parsePreconCatalog({
      data: [
        deck,
        { ...deck, fileName: 'ACollectors_CMM' },
        { ...deck, type: 'MTGO Commander Deck' },
        { ...deck, type: 'Brawl Deck' },
        { ...deck, type: 'Theme Deck' },
        { ...deck, fileName: '../other' },
      ],
    }).map((deck) => deck.fileName),
    ['A_CMM', 'ACollectors_CMM'],
  );
  assert.throws(() => parsePreconCatalog({}), /unreadable/);
});

test('precon contents retain commander and land quantities without counting reverse faces or extras', () => {
  const front = { ...cardSpec('double'), side: 'a' };
  const result = parsePreconCards({
    data: {
      commander: [cardSpec('leader')],
      mainBoard: [
        cardSpec('plains', 'Plains', 10),
        cardSpec('plains', 'Plains', 2),
        front,
        { ...front, side: 'b' },
      ],
      displayCommander: [cardSpec('oversized')],
      tokens: [cardSpec('token')],
      sideBoard: [cardSpec('extra')],
      planes: [cardSpec('plane')],
      schemes: [cardSpec('scheme')],
    },
  });
  assert.deepEqual(result, [
    { id: 'leader', name: 'leader', quantity: 1, commander: true },
    { id: 'plains', name: 'Plains', quantity: 12, commander: false },
    { id: 'double', name: 'double', quantity: 1, commander: false },
  ]);
  assert.deepEqual(parsePreconCards({ data: { mainBoard: [cardSpec('only')] } })[0].quantity, 1);
});

test('unreadable or excessive quantities fail instead of importing a misleading partial deck', () => {
  for (const cards of [
    [],
    [cardSpec('a', 'A', 0)],
    [cardSpec('a', 'A', 1.5)],
    [cardSpec('a', 'A', 101)],
    [cardSpec('a', 'A', 100), cardSpec('a', 'A', 1)],
    Array.from({ length: 6 }, (_, i) => cardSpec(String(i), String(i), 100)),
  ]) {
    assert.throws(() => parsePreconCards({ data: { mainBoard: cards } }));
  }
  assert.throws(() => parsePreconCards({ data: {} }), /unreadable/);
});

test('exact-printing collections use batches of 75, deduplicate IDs, and retain matching reverse artwork', async (t) => {
  const ids = Array.from({ length: 80 }, (_, index) => `id-${index}`);
  const batchSizes: number[] = [];
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.scryfall.com/cards/collection');
    const identifiers = JSON.parse(init.body as string).identifiers as { id: string }[];
    batchSizes.push(identifiers.length);
    return Response.json({
      data: identifiers.map(({ id }) =>
        id === 'id-0'
          ? {
              ...rawCard(id),
              image_uris: undefined,
              layout: 'transform',
              card_faces: [
                { name: 'Front', image_uris: rawCard('front').image_uris },
                { name: 'Back', image_uris: rawCard('back').image_uris },
              ],
            }
          : rawCard(id),
      ),
    });
  });
  const result = await resolveCardIds([...ids, ids[0]]);
  assert.deepEqual(batchSizes, [75, 5]);
  assert.equal(result.length, 80);
  assert.equal(result[0].faces[1].image, 'https://cards.scryfall.io/back.png');
});

test('precon loading matches collection results by ID and reports unavailable exact printings', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url: string, init?: RequestInit) => {
    if (url === 'https://mtgjson.com/api/v5/decks/Example_CMM.json')
      return Response.json({
        data: {
          commander: [cardSpec('leader')],
          mainBoard: [
            cardSpec('plains', 'Plains', 12),
            cardSpec('missing'),
            { name: 'No identifier', count: 1 },
            cardSpec('no-art'),
          ],
        },
      });
    assert.equal(url, 'https://api.scryfall.com/cards/collection');
    assert.deepEqual(JSON.parse(init!.body as string).identifiers, [
      { id: 'leader' },
      { id: 'plains' },
      { id: 'missing' },
      { id: 'no-art' },
    ]);
    return Response.json({
      data: [rawCard('plains'), rawCard('leader'), { ...rawCard('no-art'), image_uris: undefined }],
    });
  });
  const result = await loadCommanderPrecon('Example_CMM');
  assert.equal(result.total, 16);
  assert.deepEqual(
    result.entries.map(({ card, quantity, commander }) => [card.id, quantity, commander]),
    [
      ['leader', 1, true],
      ['plains', 12, false],
    ],
  );
  assert.deepEqual(result.missing, ['missing', 'No identifier', 'no-art']);
  await assert.rejects(loadCommanderPrecon('../Example_CMM'), /valid precon/);
});

test('MTGJSON network and server failures give retryable errors', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({}, { status: 503 }));
  await assert.rejects(loadCommanderPrecon('Unavailable_CMM'), /MTGJSON returned 503/);
  t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('Offline');
  });
  await assert.rejects(loadCommanderPrecon('Unavailable_CMM'), /Could not reach MTGJSON/);
});
