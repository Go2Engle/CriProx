import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editEntryCopy } from '../src/lib/entries';
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
