import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Layers3, LoaderCircle, Search } from 'lucide-react';
import {
  listSets,
  searchSetCards,
  SET_CARD_SORTS,
  type ScryfallSet,
  type SetCardDirection,
  type SetCardSort,
} from '../lib/scryfall';
import type { Card } from '../lib/types';
import CardSearchResults, { type CardSearchResultsProps } from './CardSearchResults';

const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';

export default function SetBrowser(props: Omit<CardSearchResultsProps, 'cards'>) {
  const [sets, setSets] = useState<ScryfallSet[]>([]);
  const [filter, setFilter] = useState('');
  const [listOrder, setListOrder] = useState('newest');
  const [selected, setSelected] = useState<ScryfallSet>();
  const [order, setOrder] = useState<SetCardSort>('set');
  const [direction, setDirection] = useState<SetCardDirection>('asc');
  const [cards, setCards] = useState<Card[]>([]);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string>();
  const [busy, setBusy] = useState('Loading sets…');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setError('');
    setCards([]);
    setNext(undefined);
    setTotal(0);
    setBusy(selected ? 'Loading set cards…' : 'Loading sets…');
    const load = selected
      ? searchSetCards(selected.code, order, direction).then((result) => {
          if (generation.current !== current) return;
          setCards(result.cards);
          setTotal(result.total);
          setNext(result.next);
        })
      : listSets().then((result) => {
          if (generation.current === current) setSets(result);
        });
    void load
      .catch((reason) => {
        if (generation.current === current) setError(errorText(reason));
      })
      .finally(() => {
        if (generation.current === current) setBusy('');
      });
    return () => {
      ++generation.current;
    };
  }, [selected, order, direction, retry]);

  const visibleSets = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return sets
      .filter(
        (set) =>
          !set.digital &&
          (!term || set.name.toLowerCase().includes(term) || set.code.toLowerCase().includes(term)),
      )
      .sort((a, b) =>
        listOrder === 'name'
          ? a.name.localeCompare(b.name) || a.code.localeCompare(b.code)
          : (b.released_at || '').localeCompare(a.released_at || '') ||
            a.name.localeCompare(b.name),
      );
  }, [sets, filter, listOrder]);

  async function loadMore() {
    if (!selected || !next || busy) return;
    const current = generation.current;
    setBusy('Loading more cards…');
    setError('');
    try {
      const result = await searchSetCards(selected.code, order, direction, next);
      if (generation.current !== current) return;
      setCards((previous) => [
        ...previous,
        ...result.cards.filter((card) => !previous.some((item) => item.id === card.id)),
      ]);
      setNext(result.next);
    } catch (reason) {
      if (generation.current === current) setError(errorText(reason));
    } finally {
      if (generation.current === current) setBusy('');
    }
  }

  return (
    <div className="set-browser" aria-busy={!!busy}>
      {selected ? (
        <>
          <button className="secondary compact" onClick={() => setSelected(undefined)}>
            <ArrowLeft size={14} /> All sets
          </button>
          <div className="set-browser-heading">
            <h3>{selected.name}</h3>
            <span>
              {selected.code.toUpperCase()} · {selected.released_at || 'Release date unknown'}
            </span>
          </div>
          <div className="set-browser-controls">
            <label>
              Sort cards
              <select
                value={order}
                onChange={(event) => setOrder(event.target.value as SetCardSort)}
              >
                {SET_CARD_SORTS.map((sort) => (
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
                {cards.length} of {total} printings shown
              </span>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="set-browser-controls">
            <div className="search-field">
              <Search size={17} />
              <input
                autoFocus
                aria-label="Filter sets by name or code"
                placeholder="Filter sets by name or code…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            <label>
              Sort sets
              <select value={listOrder} onChange={(event) => setListOrder(event.target.value)}>
                <option value="newest">Newest first</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>
          <div className="card-search-summary" aria-live="polite">
            {!busy && !error && (
              <span>{visibleSets.length} paper sets · Includes token and supplemental sets</span>
            )}
          </div>
        </>
      )}
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
      {!busy && !error && !(selected ? cards.length : visibleSets.length) && (
        <div className="card-search-empty">
          <Layers3 size={31} strokeWidth={1.3} />
          <strong>{selected ? 'No paper cards available yet' : 'No matching sets'}</strong>
          <span>
            {selected
              ? 'Try another set, or check back as cards are added to Scryfall.'
              : 'Try a different set name or code.'}
          </span>
        </div>
      )}
      {selected ? (
        <CardSearchResults {...props} cards={cards} />
      ) : (
        <div className="set-browser-list">
          {visibleSets.map((set) => (
            <button className="set-browser-set" key={set.id} onClick={() => setSelected(set)}>
              <span className="set-browser-code">{set.code.toUpperCase()}</span>
              <span className="set-browser-copy">
                <strong>{set.name}</strong>
                <span>
                  {set.released_at || 'Release date unknown'} · {set.card_count} cards ·{' '}
                  {set.set_type.replaceAll('_', ' ')}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
      {next && !busy && (
        <button className="secondary load-more" onClick={() => void loadMore()}>
          Load more cards
        </button>
      )}
    </div>
  );
}
