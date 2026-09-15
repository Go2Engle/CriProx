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
  image_uris?: { png: string; normal: string };
  card_faces?: { name: string; image_uris?: { png: string; normal: string } }[];
};
type Collection = {
  data: RawCard[];
  not_found?: { name?: string; set?: string; collector_number?: string }[];
  has_more?: boolean;
  next_page?: string;
};
let queue = Promise.resolve();
let lastRequest = 0;
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const run = queue.then(async () => {
    await new Promise((resolve) =>
      setTimeout(resolve, Math.max(0, 120 - (Date.now() - lastRequest))),
    );
    lastRequest = Date.now();
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
      throw new Error(error.details || `Scryfall returned ${response.status}. Try again later.`);
    }
    return response.json() as Promise<T>;
  });
  queue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
function normalize(raw: RawCard): Card {
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
    results.push(...data.map(normalize));
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
  const path = next
    ? new URL(next).pathname + new URL(next).search
    : `/cards/search?q=${encodeURIComponent(`oracleid:${card.oracleId} game:paper`)}&unique=prints&order=released`;
  const key = `variants:${path}`;
  const cached = await get<{ time: number; data: Collection }>(key).catch(() => undefined);
  const result =
    cached && Date.now() - cached.time < 86400000 ? cached.data : await request<Collection>(path);
  if (!cached || Date.now() - cached.time >= 86400000)
    await set(key, { time: Date.now(), data: result }).catch(() => {});
  return {
    cards: result.data.map(normalize).filter((c) => c.faces.length),
    next: result.has_more ? result.next_page : undefined,
  };
}

export function scryfallSearchPath(query: string) {
  const name = query.trim().replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  if (!name) throw new Error('Enter a card name to search.');
  return `/cards/search?q=${encodeURIComponent(`name:"${name}" game:paper`)}&unique=cards&order=name`;
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
    cards: result.data.map(normalize).filter((card) => card.faces.length),
    next: result.has_more ? result.next_page : undefined,
  };
}
