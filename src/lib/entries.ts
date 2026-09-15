import type { Card, Entry } from './types';

export type EntryCopy = { entryId: string; copy: number };
export type EntryArtworkPatch = Partial<Pick<Entry, 'card' | 'face'>>;
export type SplitEntryIds = { edited: string; remainder: string };

export function isDoubleSidedCard(card: Card) {
  return card.faces.length === 2;
}

export function reverseFaceIndex(entry: Entry): number | undefined {
  return isDoubleSidedCard(entry.card) ? (entry.face === 0 ? 1 : 0) : undefined;
}

export function doubleSidedCardCount(entries: Entry[]) {
  return entries.reduce(
    (count, entry) => count + (isDoubleSidedCard(entry.card) ? entry.quantity : 0),
    0,
  );
}

export function needsSharedCardBack(entries: Entry[]) {
  return entries.some((entry) => !isDoubleSidedCard(entry.card));
}

export function editEntryCopy(
  entries: Entry[],
  target: EntryCopy,
  patch: EntryArtworkPatch,
  ids: SplitEntryIds,
): Entry[] {
  const index = entries.findIndex((entry) => entry.id === target.entryId),
    entry = entries[index];
  if (!entry || target.copy < 0 || target.copy >= entry.quantity) return entries;

  if (entry.quantity === 1) {
    return entries.map((candidate, candidateIndex) =>
      candidateIndex === index ? { ...candidate, ...patch } : candidate,
    );
  }

  const before = target.copy,
    after = entry.quantity - target.copy - 1,
    replacement: Entry[] = [];
  if (before) replacement.push({ ...entry, quantity: before });
  replacement.push({ ...entry, ...patch, id: ids.edited, quantity: 1 });
  if (after)
    replacement.push({
      ...entry,
      id: before ? ids.remainder : entry.id,
      quantity: after,
    });

  return [...entries.slice(0, index), ...replacement, ...entries.slice(index + 1)];
}
