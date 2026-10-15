import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, LoaderCircle, Search } from 'lucide-react';
import {
  MPC_ARTWORK_SORT_OPTIONS,
  searchMpcArtwork,
  sortMpcArtwork,
  type MpcArtwork,
  type MpcArtworkSort,
  type MpcArtworkType,
} from '../lib/mpc';

export default function MpcArtworkSearch({
  type,
  initialQuery = '',
  choose,
  openByDefault = false,
  hideTrigger = false,
}: {
  type: MpcArtworkType;
  initialQuery?: string;
  choose: (artwork: MpcArtwork) => void;
  openByDefault?: boolean;
  hideTrigger?: boolean;
}) {
  const [open, setOpen] = useState(openByDefault),
    [query, setQuery] = useState(initialQuery),
    [sort, setSort] = useState<MpcArtworkSort>('dpiDescending'),
    [search, setSearch] = useState<{ query: string; sort: MpcArtworkSort; page: number } | null>(
      openByDefault ? { query: initialQuery, sort: 'dpiDescending', page: 0 } : null,
    ),
    [items, setItems] = useState<MpcArtwork[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [total, setTotal] = useState(0),
    [busy, setBusy] = useState(openByDefault),
    [error, setError] = useState('');

  useEffect(() => {
    if (!search) return;
    let active = true;
    searchMpcArtwork(search.query, type, search.page, search.sort)
      .then((result) => {
        if (!active) return;
        setItems((current) => (search.page ? [...current, ...result.artwork] : result.artwork));
        setPage(search.page);
        setMore(result.more);
        setTotal(result.total);
      })
      .catch((reason) => {
        if (active)
          setError(reason instanceof Error ? reason.message : 'MPC Autofill search failed.');
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [search, type]);

  const sortedItems = useMemo(() => sortMpcArtwork(items, sort), [items, sort]);

  function startSearch(nextSort = sort, nextPage = 0, nextQuery = query) {
    setBusy(true);
    setError('');
    if (!nextPage) {
      setItems([]);
      setMore(false);
      setTotal(0);
    }
    setSearch({ query: nextQuery, sort: nextSort, page: nextPage });
  }

  function reveal() {
    setOpen(true);
    if (!items.length) startSearch();
  }

  if (!open && hideTrigger) return null;

  if (!open)
    return (
      <button className="secondary mpc-open" onClick={reveal}>
        <Search size={15} /> Browse MPC Autofill{' '}
        {type === 'CARDBACK' ? 'card backs' : type === 'TOKEN' ? 'token art' : 'art'}
      </button>
    );

  return (
    <div className="mpc-picker">
      <div className="mpc-picker-heading">
        <div>
          <strong>MPC Autofill</strong>
          <span>Community-made, print-ready artwork</span>
        </div>
        <a href="https://mpcfill.com/" target="_blank" rel="noreferrer">
          Visit site <ExternalLink size={13} />
        </a>
      </div>
      <form
        className="set-browser-controls mpc-search-controls"
        onSubmit={(event) => {
          event.preventDefault();
          startSearch();
        }}
      >
        <div className="search-field mpc-search">
          <Search size={16} />
          <input
            aria-label={`Search MPC Autofill ${type === 'CARDBACK' ? 'card backs' : type === 'TOKEN' ? 'token art' : 'card art'}`}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              type === 'CARDBACK'
                ? 'Search card backs, or leave blank…'
                : type === 'TOKEN'
                  ? 'Token name…'
                  : 'Card name…'
            }
          />
          <button className="secondary" disabled={busy || (type !== 'CARDBACK' && !query.trim())}>
            Search
          </button>
        </div>
        <label>
          Sort artwork
          <select
            value={sort}
            disabled={busy}
            onChange={(event) => {
              const nextSort = event.target.value as MpcArtworkSort;
              setSort(nextSort);
              if (sort.startsWith('dpi') && nextSort.startsWith('dpi')) return;
              startSearch(nextSort, 0, search?.query ?? query);
            }}
          >
            {MPC_ARTWORK_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </form>
      {(sort === 'dpiDescending' || sort === 'dpiAscending') && (
        <p className="mpc-sort-help">
          DPI sorting applies to loaded results. Load more to compare more artwork.
        </p>
      )}
      {error && <div className="error-box">{error}</div>}
      <div className="mpc-results">
        {sortedItems.map((artwork) => (
          <button
            key={artwork.id}
            className="mpc-result"
            onClick={() => choose(artwork)}
            title={`Use ${artwork.name}`}
          >
            <span className="mpc-result-image">
              <img
                className="mpc-source-art"
                src={artwork.face.preview}
                alt={artwork.name}
                loading="lazy"
              />
            </span>
            <strong>{artwork.name}</strong>
            <span>
              {artwork.source} ·{' '}
              {Number.isFinite(artwork.dpi) && artwork.dpi > 0
                ? `${artwork.dpi} DPI`
                : 'DPI unknown'}
            </span>
          </button>
        ))}
      </div>
      {busy && (
        <div className="loading">
          <LoaderCircle className="spin" size={18} /> Searching MPC Autofill…
        </div>
      )}
      {!busy && !error && !items.length && (
        <p className="empty-message">No MPC Autofill artwork matched this search.</p>
      )}
      <div className="mpc-picker-footer">
        <span>
          {total ? `${items.length} of ${total} results` : 'Images served by MPC Autofill'}
        </span>
        {more && (
          <button
            className="text-button"
            disabled={busy}
            onClick={() => startSearch(sort, page + 1, search?.query)}
          >
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
