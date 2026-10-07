import { get, set } from 'idb-keyval';
import { resolveCardIds } from './scryfall';
import type { Card } from './types';

export type CommanderPrecon = {
  fileName: string;
  name: string;
  code: string;
  releaseDate?: string;
};
export type PreconEntry = { card: Card; quantity: number; commander: boolean };
type PreconCard = { id?: string; name: string; quantity: number; commander: boolean };
type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordValue)
    : undefined;
}
const validFileName = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_]+$/.test(value);

export function parsePreconCatalog(payload: unknown): CommanderPrecon[] {
  const data = record(payload)?.data;
  if (!Array.isArray(data)) throw new Error('MTGJSON returned an unreadable deck catalog.');
  return data.flatMap((value) => {
    const deck = record(value);
    if (
      deck?.type !== 'Commander Deck' ||
      !validFileName(deck.fileName) ||
      typeof deck.name !== 'string' ||
      typeof deck.code !== 'string'
    )
      return [];
    return [
      {
        fileName: deck.fileName,
        name: deck.name,
        code: deck.code,
        releaseDate: typeof deck.releaseDate === 'string' ? deck.releaseDate : undefined,
      },
    ];
  });
}

export function parsePreconCards(payload: unknown): PreconCard[] {
  const deck = record(record(payload)?.data);
  if (!deck || !Array.isArray(deck.mainBoard))
    throw new Error('MTGJSON returned an unreadable decklist.');
  const cards = new Map<string, PreconCard>();
  // Display commanders, tokens, sideboards, planes, and schemes are extras, not deck copies.
  for (const [board, commander] of [
    [deck.commander ?? [], true],
    [deck.mainBoard, false],
  ] as const) {
    if (!Array.isArray(board)) throw new Error('MTGJSON returned an unreadable decklist.');
    for (const value of board) {
      const card = record(value);
      // MTGJSON can describe the two faces of one physical card as separate records.
      if (card?.side && card.side !== 'a') continue;
      if (
        !card ||
        typeof card.name !== 'string' ||
        !card.name.trim() ||
        typeof card.count !== 'number' ||
        !Number.isInteger(card.count) ||
        card.count < 1 ||
        card.count > 100
      )
        throw new Error('MTGJSON returned an unreadable card or quantity.');
      const id = record(card.identifiers)?.scryfallId;
      const entry: PreconCard = {
        id: typeof id === 'string' && id ? id : undefined,
        name: card.name,
        quantity: card.count,
        commander,
      };
      const key = entry.id ?? JSON.stringify([card.name, card.setCode, card.number]);
      const existing = cards.get(key);
      if (existing) {
        existing.quantity += entry.quantity;
        existing.commander ||= commander;
      } else cards.set(key, entry);
    }
  }
  const result = [...cards.values()];
  const total = result.reduce((sum, card) => sum + card.quantity, 0);
  if (!total || total > 500 || result.some((card) => card.quantity > 100))
    throw new Error('This decklist has unsupported quantities.');
  return result;
}

async function request<T>(path: string, parse: (payload: unknown) => T): Promise<T> {
  const key = `precons:v1:${path}`;
  const cached = await Promise.resolve()
    .then(() => get<{ time: number; data: unknown }>(key))
    .catch(() => undefined);
  if (cached && Date.now() - cached.time < 86400000) return parse(cached.data);
  let response: Response;
  try {
    response = await fetch(`https://mtgjson.com/api/v5/${path}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(30000),
    });
  } catch {
    throw new Error('Could not reach MTGJSON. Check your connection and try again.');
  }
  if (!response.ok) throw new Error(`MTGJSON returned ${response.status}. Try again later.`);
  const data: unknown = await response.json();
  const parsed = parse(data);
  await Promise.resolve()
    .then(() => set(key, { time: Date.now(), data }))
    .catch(() => {});
  return parsed;
}

export async function listCommanderPrecons() {
  return request('DeckList.json', parsePreconCatalog);
}

export async function loadCommanderPrecon(fileName: string): Promise<{
  entries: PreconEntry[];
  total: number;
  missing: string[];
}> {
  if (!validFileName(fileName)) throw new Error('Choose a valid precon deck.');
  const specs = await request(`decks/${fileName}.json`, parsePreconCards);
  const cards = await resolveCardIds(specs.flatMap((spec) => (spec.id ? [spec.id] : [])));
  const byId = new Map(cards.map((card) => [card.id, card]));
  const entries: PreconEntry[] = [],
    missing: string[] = [];
  for (const spec of specs) {
    const card = spec.id ? byId.get(spec.id) : undefined;
    if (card?.faces.length)
      entries.push({ card, quantity: spec.quantity, commander: spec.commander });
    else missing.push(spec.name);
  }
  return { entries, total: specs.reduce((sum, spec) => sum + spec.quantity, 0), missing };
}
