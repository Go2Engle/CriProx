import { useEffect, useState } from 'react';
import { ExternalLink, LoaderCircle, Search } from 'lucide-react';
import { searchMpcArtwork, type MpcArtwork } from '../lib/mpc';

export default function MpcArtworkSearch({
  type,
  initialQuery = '',
  choose,
  openByDefault = false,
  hideTrigger = false,
}: {
  type: 'CARD' | 'CARDBACK';
  initialQuery?: string;
  choose: (artwork: MpcArtwork) => void;
  openByDefault?: boolean;
  hideTrigger?: boolean;
}) {
  const [open, setOpen] = useState(openByDefault),
    [query, setQuery] = useState(initialQuery),
    [items, setItems] = useState<MpcArtwork[]>([]),
    [page, setPage] = useState(0),
    [more, setMore] = useState(false),
    [total, setTotal] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');

  async function search(nextPage = 0) {
    setBusy(true);
    setError('');
    try {
      const result = await searchMpcArtwork(query, type, nextPage);
      setItems((current) => (nextPage ? [...current, ...result.artwork] : result.artwork));
      setPage(nextPage);
      setMore(result.more);
      setTotal(result.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'MPC Autofill search failed.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (openByDefault) void search();
    // The initial query is intentionally searched once when this source tab opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reveal() {
    setOpen(true);
    if (!items.length) void search();
  }

  if (!open && hideTrigger) return null;

  if (!open)
    return (
      <button className="secondary mpc-open" onClick={reveal}>
        <Search size={15} /> Browse MPC Autofill {type === 'CARDBACK' ? 'card backs' : 'art'}
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
        className="search-field mpc-search"
        onSubmit={(event) => {
          event.preventDefault();
          void search();
        }}
      >
        <Search size={16} />
        <input
          aria-label={`Search MPC Autofill ${type === 'CARDBACK' ? 'card backs' : 'card art'}`}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={type === 'CARDBACK' ? 'Search card backs, or leave blank…' : 'Card name…'}
        />
        <button className="secondary" disabled={busy || (type === 'CARD' && !query.trim())}>
          Search
        </button>
      </form>
      {error && <div className="error-box">{error}</div>}
      <div className="mpc-results">
        {items.map((artwork) => (
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
              {artwork.source} · {artwork.dpi} DPI
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
          <button className="text-button" disabled={busy} onClick={() => void search(page + 1)}>
            Load more
          </button>
        )}
      </div>
    </div>
  );
}
