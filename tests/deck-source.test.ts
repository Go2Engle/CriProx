import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { deckSourceUrl } = require('../electron/deck-source.cjs');

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
