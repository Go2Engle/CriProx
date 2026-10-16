import type { Card, Entry, Settings } from './types';
import { grid } from './layout';

export type EntryCopy = { entryId: string; copy: number };
export type EntryArtworkPatch = Partial<Pick<Entry, 'card' | 'face'>>;
export type SplitEntryIds = { edited: string; remainder: string };

/** Remove only the clicked copy, retaining any other copies of the entry. */
export function deleteEntryCopy(entries: Entry[], target: EntryCopy): Entry[] {
  const entry = entries.find((candidate) => candidate.id === target.entryId);
  if (!entry || !Number.isInteger(target.copy) || target.copy < 0 || target.copy >= entry.quantity)
    return entries;
  if (entry.quantity === 1) return entries.filter((candidate) => candidate.id !== entry.id);
  return entries.map((candidate) =>
    candidate.id === entry.id ? { ...candidate, quantity: candidate.quantity - 1 } : candidate,
  );
}

/** Insert copies of the exact artwork/face after a card on the active sheet. */
export function copyEntryOnSheet(
  entries: Entry[],
  settings: Settings,
  target: EntryCopy,
  sheetIndex: number,
  action: 'duplicate' | 'fill',
  ids: { added: string; remainder: string },
): Entry[] {
  const index = entries.findIndex((entry) => entry.id === target.entryId),
    entry = entries[index],
    capacity = grid(settings).capacity,
    total = entries.reduce((sum, item) => sum + item.quantity, 0),
    position = entries.slice(0, index).reduce((sum, item) => sum + item.quantity, 0) + target.copy;
  if (
    !entry ||
    !Number.isInteger(target.copy) ||
    target.copy < 0 ||
    target.copy >= entry.quantity ||
    !capacity ||
    Math.floor(position / capacity) !== sheetIndex
  )
    return entries;
  const occupied = Math.min(capacity, total - sheetIndex * capacity),
    quantity = action === 'duplicate' ? 1 : capacity - occupied;
  if (quantity <= 0 || quantity > 100 || total + quantity > 500) return entries;
  const before = target.copy + 1,
    after = entry.quantity - before;
  return [
    ...entries.slice(0, index),
    { ...entry, quantity: before },
    { ...entry, id: ids.added, quantity },
    ...(after ? [{ ...entry, id: ids.remainder, quantity: after }] : []),
    ...entries.slice(index + 1),
  ];
}

export function addCardToEntries(entries: Entry[], card: Card, newId: string): Entry[] {
  if (entries.reduce((sum, entry) => sum + entry.quantity, 0) >= 500) return entries;
  const matching = entries.find(
    (entry) => entry.card.id === card.id && entry.face === 0 && entry.quantity < 100,
  );
  if (matching)
    return entries.map((entry) =>
      entry.id === matching.id ? { ...entry, quantity: entry.quantity + 1 } : entry,
    );
  return [...entries, { id: newId, card, quantity: 1, face: 0 }];
}

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
