import { get, set } from 'idb-keyval';
import type { Card } from './types';
import type { DeckLine } from './deck';
type RawCard = {
  id: string;
  name: string;
  set: string;
  set_name: string;
  collector_number: string;
  oracle_id: string;
  layout?: string;
  image_uris?: { png: string; normal: string };
  card_faces?: { name: string; image_uris?: { png: string; normal: string } }[];
};
type Collection = {
  data: RawCard[];
  total_cards?: number;
  not_found?: { name?: string; set?: string; collector_number?: string }[];
  has_more?: boolean;
  next_page?: string;
};
let queue = Promise.resolve();
let lastRequest = 0;
let lastSearchRequest = 0;
class ScryfallRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const run = queue.then(async () => {
    const isSearch = path.startsWith('/cards/search?');
    await new Promise((resolve) =>
      setTimeout(
        resolve,
        Math.max(
          0,
          120 - (Date.now() - lastRequest),
          isSearch ? 500 - (Date.now() - lastSearchRequest) : 0,
        ),
      ),
    );
    lastRequest = Date.now();
    if (isSearch) lastSearchRequest = lastRequest;
    let response: Response;
    try {
      response = await fetch(`https://api.scryfall.com${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new Error('Could not reach Scryfall. Check your connection, or add local artwork.');
    }
    if (response.status === 429)
      throw new Error('Scryfall is rate limiting requests. Please wait before trying again.');
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new ScryfallRequestError(
        error.details || `Scryfall returned ${response.status}. Try again later.`,
        response.status,
      );
    }
    return response.json() as Promise<T>;
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
export function normalizeScryfallCard(raw: RawCard): Card {
  const faces = raw.image_uris
    ? [{ name: raw.name, image: raw.image_uris.png, preview: raw.image_uris.normal }]
    : (raw.card_faces || [])
        .filter((face) => face.image_uris)
        .map((face) => ({
          name: face.name,
          image: face.image_uris!.png,
          preview: face.image_uris!.normal,
        }));
  return {
    id: raw.id,
    oracleId: raw.oracle_id,
    name: raw.name,
    ...(raw.layout === 'token' || raw.layout === 'double_faced_token'
      ? { kind: 'token' as const }
      : {}),
    set: raw.set,
    setName: raw.set_name,
    collector: raw.collector_number,
    faces,
  };
}
function comparableName(name: string) {
  return name
    .normalize('NFKC')
    .replace(/[‘’]/g, "'")
    .replace(/\s*\/\/\s*/g, ' // ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US');
}
export function scryfallLookupName(name: string) {
  return name.split(/\s*\/\/\s*/, 1)[0].trim();
}
export function cardMatchesDeckLine(card: Card, line: DeckLine) {
  const names = [card.name, ...card.faces.map((f) => f.name)].map(comparableName);
  return (
    names.includes(comparableName(line.name)) &&
    (!line.set || card.set === line.set) &&
    (!line.collector || card.collector === line.collector)
  );
}
export async function resolveDeck(lines: DeckLine[], progress: (value: string) => void) {
  const found: { line: DeckLine; card: Card }[] = [],
    missing: string[] = [];
  // Collapse duplicate identifiers before requesting; cache successful lookups for a day.
  const unique = [
    ...new Map(
      lines.map((line) => [
        JSON.stringify([comparableName(scryfallLookupName(line.name)), line.set, line.collector]),
        line,
      ]),
    ).values(),
  ];
  const results: Card[] = [];
  for (let i = 0; i < unique.length; i += 75) {
    const batch = unique.slice(i, i + 75);
    // The collection endpoint resolves reversible cards by the front face, not
    // the full "Front // Back" display name. Version the cache so older failed
    // full-name lookups are never reused after this normalization change.
    const key = `lookup:v2:${JSON.stringify(
      batch.map((line) => [scryfallLookupName(line.name), line.set, line.collector]),
    )}`;
    progress(`Finding cards ${i + 1}–${Math.min(i + 75, unique.length)} of ${unique.length}…`);
    const cached = await get<{ time: number; data: RawCard[] }>(key).catch(() => undefined);
    let data: RawCard[];
    if (cached && Date.now() - cached.time < 86400000) data = cached.data;
    else {
      const response = await request<Collection>('/cards/collection', {
        method: 'POST',
        body: JSON.stringify({
          identifiers: batch.map((l) =>
            l.set && l.collector
              ? { set: l.set, collector_number: l.collector }
              : { name: scryfallLookupName(l.name), ...(l.set ? { set: l.set } : {}) },
          ),
        }),
      });
      data = response.data;
      await set(key, { time: Date.now(), data }).catch(() => {});
    }
    results.push(...data.map(normalizeScryfallCard));
  }
  for (const line of lines) {
    const card = results.find((candidate) => cardMatchesDeckLine(candidate, line));
    if (card?.faces.length) found.push({ line, card });
    else
      missing.push(
        `Line ${line.line}: ${line.name}${line.set ? ` (${line.set}) ${line.collector || ''}` : ''}`,
      );
  }
  return { found, missing };
}
export async function variants(
  card: Card,
  next?: string,
): Promise<{ cards: Card[]; next?: string }> {
  const path = next ? new URL(next).pathname + new URL(next).search : scryfallVariantsPath(card);
  const key = `variants:${path}`;
  const cached = await get<{ time: number; data: Collection }>(key).catch(() => undefined);
  const result =
    cached && Date.now() - cached.time < 86400000 ? cached.data : await request<Collection>(path);
  if (!cached || Date.now() - cached.time >= 86400000)
    await set(key, { time: Date.now(), data: result }).catch(() => {});
  return {
    cards: result.data.map(normalizeScryfallCard).filter((c) => c.faces.length),
    next: result.has_more ? result.next_page : undefined,
  };
}

export function scryfallVariantsPath(card: Card) {
  return `/cards/search?q=${encodeURIComponent(`oracleid:${card.oracleId} game:paper`)}&unique=prints&order=released&include_extras=true`;
}

export function scryfallSearchPath(query: string) {
  const trimmed = query.trim();
  const tokenSearch = /\s+tokens?$/i.test(trimmed);
  const name = (tokenSearch ? trimmed.replace(/\s+tokens?$/i, '') : trimmed)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
  if (!name) throw new Error('Enter a card name to search.');
  const search = `name:"${name}" game:paper${tokenSearch ? ' is:token' : ''}`;
  return `/cards/search?q=${encodeURIComponent(search)}&unique=cards&order=name&include_extras=true`;
}

export async function searchCards(
  query: string,
  next?: string,
): Promise<{ cards: Card[]; next?: string }> {
  const path = next ? new URL(next).pathname + new URL(next).search : scryfallSearchPath(query);
  const key = `card-search:v1:${path}`;
  const cached = await get<{ time: number; data: Collection }>(key).catch(() => undefined);
  const result =
    cached && Date.now() - cached.time < 86400000 ? cached.data : await request<Collection>(path);
  if (!cached || Date.now() - cached.time >= 86400000)
    await set(key, { time: Date.now(), data: result }).catch(() => {});
  return {
    cards: result.data.map(normalizeScryfallCard).filter((card) => card.faces.length),
    next: result.has_more ? result.next_page : undefined,
  };
}

export type ScryfallSet = {
  id: string;
  code: string;
  name: string;
  released_at?: string;
  card_count: number;
  set_type: string;
  digital: boolean;
};

export const SET_CARD_SORTS = [
  { value: 'set', label: 'Collector number' },
  { value: 'name', label: 'Name' },
  { value: 'color', label: 'Color' },
  { value: 'rarity', label: 'Rarity' },
  { value: 'cmc', label: 'Mana value' },
  { value: 'artist', label: 'Artist' },
] as const;
export type SetCardSort = (typeof SET_CARD_SORTS)[number]['value'];
export type SetCardDirection = 'asc' | 'desc';

export async function listSets(): Promise<ScryfallSet[]> {
  const key = 'scryfall-sets:v1';
  const cached = await Promise.resolve()
    .then(() => get<{ time: number; data: ScryfallSet[] }>(key))
    .catch(() => undefined);
  if (cached && Date.now() - cached.time < 86400000) return cached.data;
  const result = await request<{ data: ScryfallSet[] }>('/sets');
  await Promise.resolve()
    .then(() => set(key, { time: Date.now(), data: result.data }))
    .catch(() => {});
  return result.data;
}

export function scryfallSetSearchPath(
  code: string,
  order: SetCardSort = 'set',
  direction: SetCardDirection = 'asc',
) {
  const normalized = code.trim().toLowerCase();
  if (!/^[a-z0-9]+$/.test(normalized)) throw new Error('Choose a valid set.');
  return `/cards/search?q=${encodeURIComponent(`set:${normalized} game:paper`)}&unique=prints&order=${order}&dir=${direction}&include_extras=true&include_variations=true`;
}

export async function searchSetCards(
  code: string,
  order: SetCardSort = 'set',
  direction: SetCardDirection = 'asc',
  next?: string,
): Promise<{ cards: Card[]; total: number; next?: string }> {
  const path = next
    ? new URL(next).pathname + new URL(next).search
    : scryfallSetSearchPath(code, order, direction);
  const key = `set-cards:v1:${path}`;
  const cached = await Promise.resolve()
    .then(() => get<{ time: number; data: Collection }>(key))
    .catch(() => undefined);
  let result: Collection;
  try {
    result =
      cached && Date.now() - cached.time < 86400000 ? cached.data : await request<Collection>(path);
  } catch (error) {
    // Announced sets can exist in the catalog before any paper cards are searchable.
    if (!next && error instanceof ScryfallRequestError && error.status === 404)
      return { cards: [], total: 0 };
    throw error;
  }
  if (!cached || Date.now() - cached.time >= 86400000)
    await Promise.resolve()
      .then(() => set(key, { time: Date.now(), data: result }))
      .catch(() => {});
  return {
    cards: result.data.map(normalizeScryfallCard).filter((card) => card.faces.length),
    total: result.total_cards ?? result.data.length,
    next: result.has_more ? result.next_page : undefined,
  };
}
