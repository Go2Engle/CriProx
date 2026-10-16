import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addCardToEntries,
  copyEntryOnSheet,
  deleteEntryCopy,
  doubleSidedCardCount,
  editEntryCopy,
  isDoubleSidedCard,
  needsSharedCardBack,
  reverseFaceIndex,
} from '../src/lib/entries';
import type { Entry } from '../src/lib/types';
import { DEFAULT_SETTINGS } from '../src/lib/types';
import { layout } from '../src/lib/layout';

const entry: Entry = {
  id: 'original',
  quantity: 4,
  face: 0,
  card: {
    id: 'old-art',
    name: 'Sol Ring',
    set: 'cmm',
    setName: 'Commander Masters',
    collector: '396',
    faces: [
      {
        name: 'Sol Ring',
        image: 'https://cards.scryfall.io/old.png',
        preview: 'https://cards.scryfall.io/old.png',
      },
    ],
  },
};

const newCard = {
  ...entry.card,
  id: 'new-art',
  faces: [
    {
      name: 'Sol Ring',
      image: 'https://cards.scryfall.io/new.png',
      preview: 'https://cards.scryfall.io/new.png',
    },
  ],
};

const doubleSidedEntry: Entry = {
  ...entry,
  id: 'double-sided',
  quantity: 2,
  card: {
    ...entry.card,
    name: 'Delver of Secrets // Insectile Aberration',
    faces: [
      { ...entry.card.faces[0], name: 'Delver of Secrets' },
      { ...entry.card.faces[0], name: 'Insectile Aberration' },
    ],
  },
};

const copyIds = { added: 'added', remainder: 'remainder' };
const expandedCards = (entries: Entry[]) =>
  entries.flatMap((item) => Array(item.quantity).fill(item.card.id));

test('deleting a sheet card removes one copy and preserves other artwork and faces', () => {
  const entries = [entry, { ...doubleSidedEntry, face: 1 }];
  const result = deleteEntryCopy(entries, { entryId: doubleSidedEntry.id, copy: 1 });
  assert.equal(result[0], entry);
  assert.deepEqual(result[1], { ...entries[1], quantity: 1 });
  assert.equal(entries[1].quantity, 2);
});

test('deleting the last copy removes its entry and lets pagination shrink', () => {
  const entries = [
    { ...entry, quantity: 6 },
    { ...doubleSidedEntry, quantity: 1 },
  ];
  assert.equal(layout(entries, DEFAULT_SETTINGS).length, 2);
  const result = deleteEntryCopy(entries, { entryId: doubleSidedEntry.id, copy: 0 });
  assert.deepEqual(result, [entries[0]]);
  assert.equal(layout(result, DEFAULT_SETTINGS).length, 1);
  assert.deepEqual(
    deleteEntryCopy([{ ...entry, quantity: 1 }], { entryId: entry.id, copy: 0 }),
    [],
  );
});

test('deleting an invalid or stale copy leaves the project unchanged', () => {
  const entries = [entry];
  for (const target of [
    { entryId: 'missing', copy: 0 },
    { entryId: entry.id, copy: -1 },
    { entryId: entry.id, copy: entry.quantity },
    { entryId: entry.id, copy: 0.5 },
  ])
    assert.equal(deleteEntryCopy(entries, target), entries);
});

test('duplicate inserts the exact face and artwork after the clicked copy without exceeding entry limits', () => {
  const original = { ...doubleSidedEntry, quantity: 100, face: 1 };
  const result = copyEntryOnSheet(
    [original],
    DEFAULT_SETTINGS,
    { entryId: original.id, copy: 2 },
    0,
    'duplicate',
    copyIds,
  );
  assert.deepEqual(
    result.map(({ id, quantity, face }) => [id, quantity, face]),
    [
      [original.id, 3, 1],
      ['added', 1, 1],
      ['remainder', 97, 1],
    ],
  );
  assert.equal(result[1].card, original.card);
  assert.equal(
    result.reduce((sum, item) => sum + item.quantity, 0),
    101,
  );
});

test('fill page preserves existing cards and uses the selected layout capacity', () => {
  for (const profile of ['expanded', 'seven', 'eight', 'nine'] as const) {
    const settings = { ...DEFAULT_SETTINGS, profile };
    const entries = [
      { ...entry, quantity: 1 },
      { ...entry, id: 'other', card: newCard, quantity: 1 },
    ];
    const result = copyEntryOnSheet(
      entries,
      settings,
      { entryId: entry.id, copy: 0 },
      0,
      'fill',
      copyIds,
    );
    const sheets = layout(result, settings);
    assert.equal(sheets.length, 1);
    assert.equal(
      sheets[0].placements.length,
      profile === 'seven' ? 7 : profile === 'eight' ? 8 : profile === 'nine' ? 9 : 6,
    );
    assert.equal(result.at(-1), entries[1]);
    assert.ok(result.slice(0, -1).every((item) => item.card === entry.card));
  }
});

test('fill affects only the active partial page and duplicate moves overflow to the next page', () => {
  const entries = [
    { ...entry, quantity: 6 },
    { ...entry, id: 'other', card: newCard, quantity: 2 },
  ];
  const target = { entryId: 'other', copy: 0 };
  const filled = copyEntryOnSheet(entries, DEFAULT_SETTINGS, target, 1, 'fill', copyIds);
  assert.deepEqual(expandedCards(filled).slice(0, 6), expandedCards(entries).slice(0, 6));
  assert.equal(layout(filled, DEFAULT_SETTINGS)[1].placements.length, 6);
  const full = [entries[0]];
  const duplicated = copyEntryOnSheet(
    full,
    DEFAULT_SETTINGS,
    { entryId: entry.id, copy: 5 },
    0,
    'duplicate',
    copyIds,
  );
  assert.deepEqual(
    layout(duplicated, DEFAULT_SETTINGS).map((sheet) => sheet.placements.length),
    [6, 1],
  );
});

test('copy actions ignore full pages, stale targets, and additions beyond the project limit', () => {
  const full = [{ ...entry, quantity: 6 }];
  const target = { entryId: entry.id, copy: 0 };
  assert.equal(copyEntryOnSheet(full, DEFAULT_SETTINGS, target, 0, 'fill', copyIds), full);
  for (const invalid of [
    { ...target, copy: -1 },
    { ...target, copy: 6 },
    { ...target, copy: 0.5 },
    { ...target, entryId: 'missing' },
  ]) {
    assert.equal(copyEntryOnSheet(full, DEFAULT_SETTINGS, invalid, 0, 'duplicate', copyIds), full);
  }
  assert.equal(copyEntryOnSheet(full, DEFAULT_SETTINGS, target, 1, 'duplicate', copyIds), full);
  const capped = Array.from({ length: 5 }, (_, index) => ({
    ...entry,
    id: String(index),
    quantity: 100,
  }));
  assert.equal(
    copyEntryOnSheet(
      capped,
      DEFAULT_SETTINGS,
      { entryId: '4', copy: 99 },
      83,
      'duplicate',
      copyIds,
    ),
    capped,
  );
  assert.equal(
    copyEntryOnSheet(capped, DEFAULT_SETTINGS, { entryId: '4', copy: 99 }, 83, 'fill', copyIds),
    capped,
  );
});

test('adding a catalog card preserves the chosen printing even when its oracle card is already present', () => {
  const original = { ...entry, card: { ...entry.card, oracleId: 'same-oracle' } };
  const printing = { ...newCard, oracleId: 'same-oracle', set: 'lea', collector: '1' };
  const added = addCardToEntries([original], printing, 'new-printing');
  assert.equal(added.length, 2);
  assert.equal(added[0].quantity, 4);
  assert.equal(added[1].card, printing);
  const repeated = addCardToEntries(added, printing, 'unused');
  assert.equal(repeated.length, 2);
  assert.equal(repeated[1].quantity, 2);
});

test('catalog additions respect the project and entry limits and preserve the selected front face', () => {
  const full = Array.from({ length: 5 }, (_, index) => ({
    ...entry,
    id: String(index),
    quantity: 100,
  }));
  assert.equal(addCardToEntries(full, newCard, 'extra'), full);
  const capped = addCardToEntries([{ ...entry, quantity: 100 }], entry.card, 'overflow');
  assert.deepEqual(
    capped.map((item) => item.quantity),
    [100, 1],
  );
  const reversed = { ...doubleSidedEntry, face: 1 };
  const added = addCardToEntries([reversed], reversed.card, 'front');
  assert.deepEqual(
    added.map((item) => [item.face, item.quantity]),
    [
      [1, 2],
      [0, 1],
    ],
  );
});

test('double-sided entries expose the opposite face and shared-back requirement', () => {
  assert.equal(isDoubleSidedCard(doubleSidedEntry.card), true);
  assert.equal(reverseFaceIndex(doubleSidedEntry), 1);
  assert.equal(reverseFaceIndex({ ...doubleSidedEntry, face: 1 }), 0);
  assert.equal(doubleSidedCardCount([entry, doubleSidedEntry]), 2);
  assert.equal(needsSharedCardBack([doubleSidedEntry]), false);
  assert.equal(needsSharedCardBack([doubleSidedEntry, entry]), true);
});

test('editing artwork for one copy splits only that copy and preserves card order', () => {
  const updated = editEntryCopy(
    [entry],
    { entryId: entry.id, copy: 2 },
    { card: newCard },
    { edited: 'edited', remainder: 'remainder' },
  );

  assert.deepEqual(
    updated.map(({ id, quantity, card }) => ({ id, quantity, artwork: card.id })),
    [
      { id: 'original', quantity: 2, artwork: 'old-art' },
      { id: 'edited', quantity: 1, artwork: 'new-art' },
      { id: 'remainder', quantity: 1, artwork: 'old-art' },
    ],
  );
  assert.equal(
    updated.reduce((total, candidate) => total + candidate.quantity, 0),
    entry.quantity,
  );
});

test('editing the first copy leaves the remaining quantity on the original entry', () => {
  const updated = editEntryCopy(
    [entry],
    { entryId: entry.id, copy: 0 },
    { card: newCard },
    { edited: 'edited', remainder: 'unused' },
  );

  assert.deepEqual(
    updated.map(({ id, quantity, card }) => ({ id, quantity, artwork: card.id })),
    [
      { id: 'edited', quantity: 1, artwork: 'new-art' },
      { id: 'original', quantity: 3, artwork: 'old-art' },
    ],
  );
});

test('editing a single-copy entry keeps its identity', () => {
  const single = { ...entry, quantity: 1 };
  const updated = editEntryCopy(
    [single],
    { entryId: entry.id, copy: 0 },
    { card: newCard, face: 0 },
    { edited: 'unused', remainder: 'unused' },
  );

  assert.equal(updated[0].id, entry.id);
  assert.equal(updated[0].quantity, 1);
  assert.equal(updated[0].card.id, 'new-art');
});

test('an invalid copy target does not modify the entry list', () => {
  const entries = [entry];
  assert.equal(
    editEntryCopy(
      entries,
      { entryId: entry.id, copy: entry.quantity },
      { card: newCard },
      { edited: 'edited', remainder: 'remainder' },
    ),
    entries,
  );
});
