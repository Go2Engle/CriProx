export type DeckLine = {
  name: string;
  quantity: number;
  set?: string;
  collector?: string;
  line: number;
};
export function parseDeck(text: string): { cards: DeckLine[]; errors: string[] } {
  const cards: DeckLine[] = [],
    errors: string[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const value = raw.trim();
    if (
      !value ||
      value.startsWith('//') ||
      value.startsWith('#') ||
      /^(deck|mainboard|sideboard|commander|companion|maybeboard):?$/i.test(value)
    )
      return;
    const match = value.match(
      /^(?:(\d+)\s*x?\s+)?(.+?)(?:\s+\(([a-z0-9]+)\)(?:\s+([a-z0-9★-]+))?)?(?:\s+\*F\*)?$/i,
    );
    if (!match) {
      errors.push(`Line ${i + 1}: could not read this card.`);
      return;
    }
    const quantity = Number(match[1] || 1),
      name = match[2].trim();
    if (quantity < 1 || quantity > 100 || !Number.isInteger(quantity)) {
      errors.push(`Line ${i + 1}: quantity must be between 1 and 100.`);
      return;
    }
    if (/^\d+\s*$/.test(name) || name.length > 200) {
      errors.push(`Line ${i + 1}: enter a card name.`);
      return;
    }
    cards.push({ name, quantity, set: match[3]?.toLowerCase(), collector: match[4], line: i + 1 });
  });
  if (cards.reduce((sum, c) => sum + c.quantity, 0) > 500)
    errors.push('Use at most 500 cards per project.');
  return { cards, errors };
}
