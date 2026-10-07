import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Layers3, LoaderCircle, Plus, Search } from 'lucide-react';
import {
  listCommanderPrecons,
  loadCommanderPrecon,
  type CommanderPrecon,
  type PreconEntry,
} from '../lib/precons';
import CardSearchResults, { type CardSearchResultsProps } from './CardSearchResults';

type Props = Omit<CardSearchResultsProps, 'cards'> & { addDeck: (entries: PreconEntry[]) => void };

export default function PreconBrowser({ addDeck, ...props }: Props) {
  const [decks, setDecks] = useState<CommanderPrecon[]>([]);
  const [filter, setFilter] = useState('');
  const [listOrder, setListOrder] = useState('newest');
  const [selected, setSelected] = useState<CommanderPrecon>();
  const [result, setResult] = useState<
    Awaited<ReturnType<typeof loadCommanderPrecon>> & { fileName: string }
  >();
  const [busy, setBusy] = useState('Loading commander precons…');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [decksAdded, setDecksAdded] = useState<Record<string, number>>({});
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    setError('');
    setResult(undefined);
    setBusy(selected ? 'Loading deck cards…' : 'Loading commander precons…');
    const load = selected
      ? loadCommanderPrecon(selected.fileName).then((data) => {
          if (generation.current === current) setResult({ ...data, fileName: selected.fileName });
        })
      : listCommanderPrecons().then((data) => {
          if (generation.current === current) setDecks(data);
        });
    void load
      .catch((reason) => {
        if (generation.current === current)
          setError(reason instanceof Error ? reason.message : 'Could not load precons. Try again.');
      })
      .finally(() => {
        if (generation.current === current) setBusy('');
      });
    return () => {
      ++generation.current;
    };
  }, [selected, retry]);

  const visibleDecks = useMemo(() => {
    const term = filter.trim().toLowerCase();
    return decks
      .filter((deck) => !term || `${deck.name} ${deck.code}`.toLowerCase().includes(term))
      .sort((a, b) =>
        listOrder === 'name'
          ? a.name.localeCompare(b.name) || a.code.localeCompare(b.code)
          : (b.releaseDate || '').localeCompare(a.releaseDate || '') ||
            a.name.localeCompare(b.name),
      );
  }, [decks, filter, listOrder]);
  const loaded = selected && result?.fileName === selected.fileName ? result : undefined;
  const canAddDeck =
    !!loaded && !busy && !error && !loaded.missing.length && loaded.total <= props.remaining;

  function addWholeDeck() {
    if (!canAddDeck || !loaded) return;
    addDeck(loaded.entries);
    setDecksAdded((previous) => ({
      ...previous,
      [loaded.fileName]: (previous[loaded.fileName] || 0) + 1,
    }));
  }

  return (
    <div className="set-browser" aria-busy={!!busy}>
      {selected ? (
        <>
          <button className="secondary compact" onClick={() => setSelected(undefined)}>
            <ArrowLeft size={14} /> All precons
          </button>
          <div className="set-browser-heading">
            <h3>{selected.name}</h3>
            <span>
              {selected.code.toUpperCase()} · {selected.releaseDate || 'Release date unknown'}
            </span>
          </div>
          {loaded && (
            <>
              <div className="precon-deck-actions">
                <button className="primary compact" disabled={!canAddDeck} onClick={addWholeDeck}>
                  <Plus size={14} /> Add deck ({loaded.total} cards)
                </button>
                {!!decksAdded[loaded.fileName] && (
                  <span role="status">
                    Deck added {decksAdded[loaded.fileName]}{' '}
                    {decksAdded[loaded.fileName] === 1 ? 'time' : 'times'}
                  </span>
                )}
              </div>
              <div className="card-search-summary" aria-live="polite">
                <span>
                  {loaded.entries.length} printings · {loaded.total} cards including commanders ·
                  Quantities shown below
                </span>
                {!loaded.missing.length && loaded.total > props.remaining && (
                  <span>
                    There is room for {props.remaining} more cards. Add individual cards or free
                    space for the whole deck.
                  </span>
                )}
              </div>
              {!!loaded.missing.length && (
                <div className="error-box" role="alert">
                  <span>
                    Artwork unavailable for: {loaded.missing.join(', ')}. You can add available
                    cards individually; the whole deck needs all printings.
                  </span>
                  <button
                    className="secondary compact"
                    onClick={() => setRetry((value) => value + 1)}
                  >
                    Try again
                  </button>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <>
          <div className="set-browser-controls">
            <div className="search-field">
              <Search size={17} />
              <input
                autoFocus
                aria-label="Filter precons by deck name or set code"
                placeholder="Filter by deck name or set code…"
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              />
            </div>
            <label>
              Sort precons
              <select value={listOrder} onChange={(event) => setListOrder(event.target.value)}>
                <option value="newest">Newest first</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>
          <div className="card-search-summary" aria-live="polite">
            {!busy && !error && (
              <span>{visibleDecks.length} commander precons · Decklists from MTGJSON</span>
            )}
          </div>
        </>
      )}
      {error && (
        <div className="error-box" role="alert">
          {error}
          <button className="secondary compact" onClick={() => setRetry((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}
      {busy && (
        <div className="loading" role="status">
          <LoaderCircle className="spin" size={18} /> {busy}
        </div>
      )}
      {!selected && !busy && !error && !visibleDecks.length && (
        <div className="card-search-empty">
          <Layers3 size={31} strokeWidth={1.3} />
          <strong>No matching precons</strong>
          <span>Try a different deck name or set code.</span>
        </div>
      )}
      {selected ? (
        loaded && (
          <CardSearchResults
            {...props}
            cards={loaded.entries.map((entry) => entry.card)}
            deckContents={Object.fromEntries(loaded.entries.map((entry) => [entry.card.id, entry]))}
          />
        )
      ) : (
        <div className="set-browser-list">
          {!busy &&
            !error &&
            visibleDecks.map((deck) => (
              <button
                className="set-browser-set"
                key={deck.fileName}
                onClick={() => setSelected(deck)}
              >
                <span className="set-browser-code">{deck.code.toUpperCase()}</span>
                <span className="set-browser-copy">
                  <strong>{deck.name}</strong>
                  <span>{deck.releaseDate || 'Release date unknown'} · Commander precon</span>
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
