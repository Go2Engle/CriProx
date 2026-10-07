import { useEffect, useRef, useState } from 'react';
import { Grid2X2, LoaderCircle, Search } from 'lucide-react';
import {
  searchTokens,
  TOKEN_CARD_SORTS,
  type SetCardDirection,
  type TokenCardSort,
} from '../lib/scryfall';
import type { Card } from '../lib/types';
import CardSearchResults, { type CardSearchResultsProps } from './CardSearchResults';

export default function TokenBrowser(props: Omit<CardSearchResultsProps, 'cards'>) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [filter, setFilter] = useState({ name: '', code: '' });
  const [order, setOrder] = useState<TokenCardSort>('released');
  const [direction, setDirection] = useState<SetCardDirection>('desc');
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string>();
  const [busy, setBusy] = useState('Loading tokens…');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setCards([]);
    setTotal(0);
    setNext(undefined);
    setError('');
    setBusy('Loading tokens…');
    void searchTokens(filter.name, filter.code, order, direction)
      .then((result) => {
        if (generation.current !== current) return;
        setCards(result.cards);
        setTotal(result.total);
        setNext(result.next);
      })
      .catch((reason) => {
        if (generation.current === current)
          setError(reason instanceof Error ? reason.message : 'Could not load tokens. Try again.');
      })
      .finally(() => {
        if (generation.current === current) setBusy('');
      });
    return () => {
      ++generation.current;
    };
  }, [filter, order, direction, retry]);

  async function loadMore() {
    if (!next || busy) return;
    const current = generation.current;
    setBusy('Loading more tokens…');
    setError('');
    try {
      const result = await searchTokens(filter.name, filter.code, order, direction, next);
      if (generation.current !== current) return;
      setCards((previous) => [
        ...previous,
        ...result.cards.filter((card) => !previous.some((item) => item.id === card.id)),
      ]);
      setNext(result.next);
    } catch (reason) {
      if (generation.current === current)
        setError(reason instanceof Error ? reason.message : 'Could not load tokens. Try again.');
    } finally {
      if (generation.current === current) setBusy('');
    }
  }

  return (
    <div className="set-browser" aria-busy={!!busy}>
      <form
        className="set-browser-controls"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter({ name: name.trim(), code: code.trim() });
        }}
      >
        <div className="search-field">
          <Search size={17} />
          <input
            autoFocus
            aria-label="Filter tokens by name"
            placeholder="Token name, e.g. Treasure…"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Filter tokens by set code"
            placeholder="Token set code (optional), e.g. TMH2…"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        </div>
        <button className="primary compact" type="submit">
          <Search size={16} /> Search tokens
        </button>
      </form>
      <div className="card-search-summary">
        <span>Browse paper token printings. Leave both filters empty to see all tokens.</span>
      </div>
      <div className="set-browser-controls">
        <label>
          Sort tokens
          <select value={order} onChange={(event) => setOrder(event.target.value as TokenCardSort)}>
            {TOKEN_CARD_SORTS.map((sort) => (
              <option key={sort.value} value={sort.value}>
                {sort.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Direction
          <select
            value={direction}
            onChange={(event) => setDirection(event.target.value as SetCardDirection)}
          >
            <option value="asc">Ascending</option>
            <option value="desc">Descending</option>
          </select>
        </label>
      </div>
      <div className="card-search-summary" aria-live="polite">
        {!busy && !error && (
          <span>
            {cards.length} of {total} token printings shown
          </span>
        )}
      </div>
      {error && (
        <div className="error-box" role="alert">
          {error}
          {!next && (
            <button className="secondary compact" onClick={() => setRetry((value) => value + 1)}>
              Try again
            </button>
          )}
        </div>
      )}
      {busy && (
        <div className="loading" role="status">
          <LoaderCircle className="spin" size={18} /> {busy}
        </div>
      )}
      {!busy && !error && !cards.length && (
        <div className="card-search-empty">
          <Grid2X2 size={31} strokeWidth={1.3} />
          <strong>No matching tokens</strong>
          <span>Try another token name or token set code, or clear both filters.</span>
        </div>
      )}
      <CardSearchResults {...props} cards={cards} />
      {next && !busy && (
        <button className="secondary load-more" onClick={() => void loadMore()}>
          Load more tokens
        </button>
      )}
    </div>
  );
}
