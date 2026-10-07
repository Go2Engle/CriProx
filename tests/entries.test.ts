import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addCardToEntries,
  doubleSidedCardCount,
  editEntryCopy,
  isDoubleSidedCard,
  needsSharedCardBack,
  reverseFaceIndex,
} from '../src/lib/entries';
import type { Entry } from '../src/lib/types';

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
