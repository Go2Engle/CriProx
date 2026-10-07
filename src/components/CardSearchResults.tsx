import { Check, Plus } from 'lucide-react';
import type { Card } from '../lib/types';
import CachedCardPreview from './CachedCardPreview';

export type CardSearchResultsProps = {
  cards: Card[];
  added: Record<string, number>;
  remaining: number;
  add: (card: Card) => void;
};

export default function CardSearchResults({
  cards,
  added,
  remaining,
  add,
}: CardSearchResultsProps) {
  return (
    <div className="card-search-results">
      {cards.map((card) => {
        const addedCount = added[card.id] || 0;
        return (
          <article className="card-search-result" key={card.id}>
            <CachedCardPreview source={card.faces[0].preview} name={card.name} />
            <div className="card-search-result-copy">
              <strong>{card.name}</strong>
              <span>
                {card.setName} · {card.set.toUpperCase()}
                {card.collector && ` #${card.collector}`}
              </span>
            </div>
            <button
              className={addedCount ? 'secondary compact added-card' : 'secondary compact'}
              disabled={remaining <= 0}
              aria-label={`${addedCount ? `Add another copy of` : 'Add'} ${card.name}, ${card.set.toUpperCase()} #${card.collector}`}
              onClick={() => add(card)}
            >
              {addedCount ? <Check size={14} /> : <Plus size={14} />}
              {addedCount ? `Added ${addedCount}` : 'Add card'}
            </button>
          </article>
        );
      })}
    </div>
  );
}
