import type { DeckLine } from './deck';

export type DeckProvider = 'moxfield' | 'archidekt';
export type ParsedDeckSource = { provider: DeckProvider; id: string };
export type ImportedDeck = { name: string; cards: DeckLine[] };

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function text(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function quantity(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : undefined;
}

function categories(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.toLowerCase())
    : [];
}

function finishDeck(
  name: unknown,
  cards: Omit<DeckLine, 'line'>[],
  provider: string,
): ImportedDeck {
  if (!cards.length) throw new Error(`${provider} did not return any importable cards.`);

  const combined = new Map<string, Omit<DeckLine, 'line'>>();
  for (const card of cards) {
    const key = JSON.stringify([card.name.toLocaleLowerCase('en-US'), card.set, card.collector]);
    const existing = combined.get(key);
    if (existing) existing.quantity += card.quantity;
    else combined.set(key, { ...card });
  }

  return {
    name: text(name) || `${provider} deck`,
    cards: [...combined.values()].map((card, index) => ({ ...card, line: index + 1 })),
  };
}

export function parseDeckSource(value: string): ParsedDeckSource {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Paste a full Moxfield or Archidekt deck link.');
  }
  if (url.protocol !== 'https:') throw new Error('Deck links must use https://.');

  const host = url.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'moxfield.com') {
    const id = url.pathname.match(/^\/decks\/([A-Za-z0-9_-]+)(?:\/|$)/)?.[1];
    if (id) return { provider: 'moxfield', id };
  }
  if (host === 'archidekt.com') {
    const id = url.pathname.match(/^\/decks\/(\d+)(?:\/|$)/)?.[1];
    if (id) return { provider: 'archidekt', id };
  }
  throw new Error('Paste a Moxfield or Archidekt deck link.');
}

export function parseMoxfieldDeck(payload: unknown): ImportedDeck {
  const deck = record(payload);
  if (!deck) throw new Error('Moxfield returned an unreadable deck.');
  const boards = record(deck.boards);
  const cards: Omit<DeckLine, 'line'>[] = [];

  for (const boardName of [
    'commanders',
    'companions',
    'signatureSpells',
    'mainboard',
    'sideboard',
    'attractions',
    'contraptions',
    'planes',
    'schemes',
  ]) {
    const entries = record(record(boards?.[boardName])?.cards);
    for (const value of Object.values(entries || {})) {
      const entry = record(value);
      const card = record(entry?.card);
      const name = text(card?.name);
      const count = quantity(entry?.quantity);
      if (!name || !count) continue;
      cards.push({
        name,
        quantity: count,
        set: text(card?.set)?.toLowerCase(),
        collector: text(card?.cn),
      });
    }
  }

  return finishDeck(deck.name, cards, 'Moxfield');
}

export function parseArchidektDeck(payload: unknown): ImportedDeck {
  const deck = record(payload);
  if (!deck || !Array.isArray(deck.cards))
    throw new Error('Archidekt returned an unreadable deck.');
  const cards: Omit<DeckLine, 'line'>[] = [];

  for (const value of deck.cards) {
    const entry = record(value);
    if (
      !entry ||
      entry.deletedAt ||
      categories(entry.categories).some((item) => item === 'maybeboard')
    )
      continue;
    const card = record(entry.card);
    const oracle = record(card?.oracleCard);
    const edition = record(card?.edition);
    const name = text(oracle?.name) || text(card?.displayName) || text(card?.name);
    const count = quantity(entry.quantity);
    if (!name || !count) continue;
    cards.push({
      name,
      quantity: count,
      set: text(edition?.editioncode)?.toLowerCase(),
      collector: text(card?.collectorNumber),
    });
  }

  return finishDeck(deck.name, cards, 'Archidekt');
}

async function requestDeck(source: ParsedDeckSource): Promise<unknown> {
  if (window.criprox?.deckRequest) return window.criprox.deckRequest(source.provider, source.id);

  const path = `/deck-source-api/${source.provider}/${encodeURIComponent(source.id)}`;
  const response = await fetch(path, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`${source.provider} returned ${response.status}.`);
  return response.json();
}

export async function importDeckSource(value: string): Promise<ImportedDeck> {
  const source = parseDeckSource(value);
  try {
    const payload = await requestDeck(source);
    return source.provider === 'moxfield'
      ? parseMoxfieldDeck(payload)
      : parseArchidektDeck(payload);
  } catch (reason) {
    if (source.provider === 'moxfield') {
      throw new Error(
        'Could not import this Moxfield deck. In Moxfield, choose Export, copy the decklist, and paste it on the Card list tab instead.',
        { cause: reason },
      );
    }
    throw new Error(
      'Could not import this Archidekt deck. Check that the link is public or unlisted.',
      {
        cause: reason,
      },
    );
  }
}
