import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';
import { parseMoxfieldDeck } from '../src/lib/deck-source';
import { parseDeck } from '../src/lib/deck';
import { resolveDeck } from '../src/lib/scryfall';

const require = createRequire(import.meta.url);
const { deckSourceUrl } = require('../electron/deck-source.cjs');

// Moxfield aggregates copies by name; selected printings live in printingData.
const mixedLands = {
  name: 'Issue 144 lands',
  boards: {
    mainboard: {
      cards: {
        island: {
          quantity: 6,
          card: { name: 'Island', set: 'eoc', cn: '1' },
          printingData: [
            { quantity: 3, set: 'ECL', cn: '380' },
            { quantity: 3, set: 'ECL', cn: '275' },
          ],
        },
        mountain: {
          quantity: 6,
          card: { name: 'Mountain', set: 'mkm', cn: '283' },
          printingData: [
            { quantity: 3, set: 'BLB', cn: '274' },
            { quantity: 3, set: 'BLB', cn: '277' },
          ],
        },
      },
    },
  },
};

test('Moxfield imports each selected land printing with its own quantity', () => {
  assert.deepEqual(parseMoxfieldDeck(mixedLands).cards, [
    { name: 'Island', quantity: 3, set: 'ecl', collector: '380', line: 1 },
    { name: 'Island', quantity: 3, set: 'ecl', collector: '275', line: 2 },
    { name: 'Mountain', quantity: 3, set: 'blb', collector: '274', line: 3 },
    { name: 'Mountain', quantity: 3, set: 'blb', collector: '277', line: 4 },
  ]);
});

test('Moxfield combines finishes of the same printing without adding the aggregate quantity', () => {
  const entry = {
    quantity: 3,
    card: { name: 'Island', set: 'eoc', cn: '1' },
    printingData: [
      { quantity: 1, set: 'ECL', cn: '380', finish: 'nonFoil' },
      { quantity: 2, set: 'ecl', cn: '380', finish: 'foil' },
    ],
  };
  assert.deepEqual(
    parseMoxfieldDeck({ boards: { mainboard: { cards: { island: entry } } } }).cards,
    [{ name: 'Island', quantity: 3, set: 'ecl', collector: '380', line: 1 }],
  );
});

test('Moxfield uses the representative printing when no printing breakdown is provided', () => {
  for (const printingData of [undefined, null, []]) {
    assert.deepEqual(
      parseMoxfieldDeck({
        boards: {
          mainboard: {
            cards: {
              island: {
                quantity: 6,
                card: { name: 'Island', set: 'ECL', cn: '380' },
                printingData,
              },
            },
          },
        },
      }).cards,
      [{ name: 'Island', quantity: 6, set: 'ecl', collector: '380', line: 1 }],
    );
  }
});

test('Moxfield rejects incomplete printing breakdowns instead of substituting artwork or losing copies', () => {
  for (const printingData of [
    [{ quantity: 3, set: 'ECL', cn: '380' }],
    [{ quantity: 7, set: 'ECL', cn: '380' }],
    [{ quantity: 6, set: 'ECL' }],
    [{ quantity: 6, cn: '380' }],
    [{ quantity: 0, set: 'ECL', cn: '380' }],
    [null],
  ]) {
    assert.throws(
      () =>
        parseMoxfieldDeck({
          boards: {
            mainboard: {
              cards: { island: { ...mixedLands.boards.mainboard.cards.island, printingData } },
            },
          },
        }),
      /printing/i,
    );
  }
});

test('deck resolution keeps mixed land artwork and accepts the exported Nezumi name', async (t) => {
  // Exercise the network path with an unavailable browser cache.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  Object.defineProperty(globalThis, 'indexedDB', {
    configurable: true,
    value: {
      open() {
        const request = {
          error: new Error('Cache unavailable'),
          onerror: undefined as (() => void) | undefined,
        };
        queueMicrotask(() => request.onerror?.());
        return request;
      },
    },
  });
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'indexedDB', previous);
    else Reflect.deleteProperty(globalThis, 'indexedDB');
  });
  const lands = parseMoxfieldDeck(mixedLands).cards;
  const nezumi = parseDeck('1 Nezumi Graverobber / Nighteyes the Desecrator (PLST) CHK-129')
    .cards[0];
  const unavailable = { ...lands[0], collector: '999', line: 6 };
  t.mock.method(globalThis, 'fetch', async (url: string, init: RequestInit) => {
    assert.equal(url, 'https://api.scryfall.com/cards/collection');
    assert.deepEqual(JSON.parse(init.body as string).identifiers, [
      { set: 'ecl', collector_number: '380' },
      { set: 'ecl', collector_number: '275' },
      { set: 'blb', collector_number: '274' },
      { set: 'blb', collector_number: '277' },
      { set: 'plst', collector_number: 'CHK-129' },
      { set: 'ecl', collector_number: '999' },
    ]);
    return Response.json({
      data: [...lands, { ...nezumi, name: 'Nezumi Graverobber // Nighteyes the Desecrator' }]
        .reverse()
        .map((line) => ({
          id: `${line.set}-${line.collector}`,
          name: line.name,
          set: line.set,
          set_name: line.set,
          collector_number: line.collector,
          image_uris: {
            png: 'https://cards.scryfall.io/test.png',
            normal: 'https://cards.scryfall.io/test.jpg',
          },
        })),
      not_found: [{ set: 'ecl', collector_number: '999' }],
    });
  });
  const result = await resolveDeck([...lands, { ...nezumi, line: 5 }, unavailable], () => {});
  assert.deepEqual(
    result.found.map(({ line, card }) => [line.quantity, card.id]),
    [
      [3, 'ecl-380'],
      [3, 'ecl-275'],
      [3, 'blb-274'],
      [3, 'blb-277'],
      [1, 'plst-CHK-129'],
    ],
  );
  assert.deepEqual(result.missing, ['Line 6: Island (ecl) 999']);
});

test('desktop deck requests are constrained to known providers and identifier shapes', () => {
  assert.equal(
    deckSourceUrl({ provider: 'moxfield', id: 'abc_DEF-123' }),
    'https://api2.moxfield.com/v3/decks/all/abc_DEF-123',
  );
  assert.equal(
    deckSourceUrl({ provider: 'archidekt', id: '14420275' }),
    'https://archidekt.com/api/decks/14420275/',
  );
  assert.throws(() => deckSourceUrl({ provider: 'moxfield', id: '../users' }), /Unsupported/);
  assert.throws(
    () => deckSourceUrl({ provider: 'archidekt', id: '123?admin=true' }),
    /Unsupported/,
  );
  assert.throws(() => deckSourceUrl({ provider: '__proto__', id: 'anything' }), /Unsupported/);
});
