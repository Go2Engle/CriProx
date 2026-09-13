import type { Card, CardFace } from './types';

export type MpcArtwork = {
  id: string;
  name: string;
  source: string;
  dpi: number;
  face: CardFace;
};

type MpcSource = { pk: number };
type MpcResult = {
  identifier: string;
  name: string;
  sourceName: string;
  sourceType?: string;
  dpi: number;
};

let sources: Promise<MpcSource[]> | undefined;

async function request<T>(
  path: string,
  method: 'GET' | 'POST' = 'GET',
  body?: unknown,
): Promise<T> {
  try {
    if (window.criprox?.mpcRequest)
      return (await window.criprox.mpcRequest(path, method, body)) as T;
    const response = await fetch(`/mpc-api${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(30000),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.message || `MPC Autofill returned ${response.status}.`);
    return result as T;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('MPC Autofill')) throw error;
    throw new Error('Could not reach MPC Autofill. Check your connection and try again.');
  }
}

async function sourceRows() {
  sources ??= request<{ results: Record<string, MpcSource> }>('/2/sources/').then((result) =>
    Object.values(result.results),
  );
  return sources;
}

export function normalizeMpcArtwork(result: MpcResult): MpcArtwork {
  const id = encodeURIComponent(result.identifier);
  const root = `https://cdn.mpcautofill.com/images/google_drive`;
  // MPC's CDN uses this value to size the full image. Keep the selected
  // artwork's available detail instead of reducing every source to 600 DPI.
  const sourceDpi = Math.max(300, Math.min(1500, Math.round(result.dpi || 1200)));
  return {
    id: result.identifier,
    name: result.name,
    source: result.sourceName,
    dpi: result.dpi,
    face: {
      name: result.name,
      image: `${root}/full/${id}.jpg?dpi=${sourceDpi}&jpgQuality=95`,
      preview: `${root}/large/${id}.jpg?jpgQuality=90`,
    },
  };
}

export async function searchMpcArtwork(
  query: string,
  type: 'CARD' | 'CARDBACK',
  page = 0,
): Promise<{ artwork: MpcArtwork[]; total: number; more: boolean }> {
  const sourceList = await sourceRows();
  const pageSize = 24;
  const response = await request<{ cards: MpcResult[]; count: number }>(
    '/2/exploreSearch/',
    'POST',
    {
      cardTypes: [type],
      pageSize,
      pageStart: page * pageSize,
      query: query.trim() || null,
      sortBy: type === 'CARDBACK' && !query.trim() ? 'dateModifiedDescending' : 'nameAscending',
      searchSettings: {
        searchTypeSettings: { fuzzySearch: true, filterCardbacks: type === 'CARDBACK' },
        sourceSettings: { sources: sourceList.map((source) => [source.pk, true]) },
        filterSettings: {
          minimumDPI: 0,
          maximumDPI: 1500,
          maximumSize: 30,
          languages: [],
          includesTags: [],
          excludesTags: ['NSFW'],
        },
      },
    },
  );
  const artwork = response.cards
    .filter((card) => card.sourceType === 'Google Drive')
    .map(normalizeMpcArtwork);
  return { artwork, total: response.count, more: (page + 1) * pageSize < response.count };
}

export function mpcArtworkAsCard(artwork: MpcArtwork, cardName: string): Card {
  return {
    id: `mpc-${artwork.id}`,
    name: cardName,
    set: 'mpc',
    setName: `MPC Autofill · ${artwork.source}`,
    collector: '',
    faces: [{ ...artwork.face, name: cardName }],
  };
}
