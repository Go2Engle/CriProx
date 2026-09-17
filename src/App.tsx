import RegisteredPrint from './components/RegisteredPrint';
import FrontBleedControl from './components/FrontBleedControl';
import MpcArtworkSearch from './components/MpcArtworkSearch';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { get, set } from 'idb-keyval';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CircleHelp,
  Copy,
  Download,
  ExternalLink,
  FilePlus2,
  FolderCog,
  FolderOpen,
  Grid2X2,
  ImagePlus,
  Layers3,
  Link2,
  LoaderCircle,
  Minus,
  Maximize2,
  Plus,
  RotateCcw,
  Ruler,
  Save,
  Scissors,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { Card, Entry, PrintDpi, Project, Settings } from './lib/types';
import {
  DEFAULT_SETTINGS,
  EMPTY_PROJECT,
  fixedBleedMm,
  PRINT_DPI_OPTIONS,
  STANDARD_CARD_RADIUS_MM,
} from './lib/types';
import { envelope, grid, layout, type Sheet } from './lib/layout';
import { parseDeck } from './lib/deck';
import { importDeckSource } from './lib/deck-source';
import { resolveDeck, searchCards, variants } from './lib/scryfall';
import { exportBundle } from './lib/export';
import { saveProjectAs } from './lib/save-project';
import { validateProject } from './lib/project';
import sampleCards from './sample.json';
import { formatDimensions } from './lib/units';
import { mpcArtworkAsCard } from './lib/mpc';
import { paperWorkflow } from './lib/paper-workflow';
import {
  doubleSidedCardCount,
  editEntryCopy,
  isDoubleSidedCard,
  type EntryArtworkPatch,
  type EntryCopy,
} from './lib/entries';

// The original Design Space ZIP export remains available for a future workflow,
// but registered PDF creation is the only export action shown in the interface.
const ENABLE_DESIGN_SPACE_EXPORT = false;

const createSample = (): Project => ({
  version: 1,
  name: 'The essentials',
  settings: { ...DEFAULT_SETTINGS },
  entries: sampleCards.map((card) => ({ id: crypto.randomUUID(), card, quantity: 1, face: 0 })),
});
const errorText = (error: unknown) =>
  error instanceof Error ? error.message : 'Something went wrong. Please try again.';
async function cardFromArtwork(file: File, base?: Card): Promise<Card> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20000000)
    throw new Error(`${file.name}: choose a PNG, JPG, or WebP under 20 MB.`);
  const bitmap = await createImageBitmap(file);
  bitmap.close();
  const data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read image.'));
    reader.readAsDataURL(file);
  });
  const name = base?.name || file.name.replace(/\.[^.]+$/, '');
  return {
    id: crypto.randomUUID(),
    name,
    set: base ? 'custom' : 'local',
    setName: base ? 'Custom artwork' : 'Your artwork',
    collector: '',
    oracleId: base?.oracleId,
    demo: base?.demo,
    faces: [{ name, image: data, preview: data }],
  };
}
function UnitToggle({
  value,
  change,
}: {
  value: Settings['units'];
  change: (units: Settings['units']) => void;
}) {
  return (
    <div className="segmented unit-toggle" aria-label="Display units">
      <button className={value === 'in' ? 'selected' : ''} onClick={() => change('in')}>
        Inches
      </button>
      <button className={value === 'mm' ? 'selected' : ''} onClick={() => change('mm')}>
        Millimeters
      </button>
    </div>
  );
}

function WindowControls() {
  const controls = window.criprox?.windowControls;
  const isMac = window.criprox?.platform === 'darwin';
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!controls) return;
    let active = true;
    controls
      .isMaximized()
      .then((value) => active && setMaximized(value))
      .catch(() => {});
    const unsubscribe = controls.onMaximizedChange(setMaximized);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [controls]);
  if (!controls) return null;
  const closeButton = (
    <button
      className="window-control window-close"
      aria-label="Close window"
      title="Close"
      onClick={() => void controls.close()}
    >
      <X size={17} />
    </button>
  );
  const minimizeButton = (
    <button
      className="window-control window-minimize"
      aria-label="Minimize window"
      title="Minimize"
      onClick={() => void controls.minimize()}
    >
      <Minus size={16} />
    </button>
  );
  const maximizeButton = (
    <button
      className="window-control window-maximize"
      aria-label={maximized ? 'Restore window' : 'Maximize window'}
      title={maximized ? 'Restore' : 'Maximize'}
      onClick={() => void controls.toggleMaximize()}
    >
      {maximized ? <Copy className="restore-icon" size={13} /> : <Maximize2 size={14} />}
    </button>
  );
  return (
    <div className={`window-controls ${isMac ? 'mac' : 'desktop'}`} aria-label="Window controls">
      {isMac ? (
        <>
          {closeButton}
          {minimizeButton}
          {maximizeButton}
        </>
      ) : (
        <>
          {minimizeButton}
          {maximizeButton}
          {closeButton}
        </>
      )}
    </div>
  );
}
function Modal({
  title,
  subtitle,
  children,
  close,
  wide = false,
  className = '',
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' wide' : ''}${className ? ` ${className}` : ''}`}
      onCancel={close}
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="modal-heading">
        <div>
          <h2 id="dialog-title">{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        <button className="icon-button" aria-label="Close dialog" onClick={close}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
function ProjectsModal({
  snapshot,
  activeProjectId,
  busy,
  close,
  refresh,
  changeDirectory,
  reveal,
  open,
  remove,
  saveCurrent,
  importBackup,
  exportBackup,
  newProject,
}: {
  snapshot: ProjectLibrarySnapshot | null;
  activeProjectId: string | null;
  busy: boolean;
  close: () => void;
  refresh: () => void;
  changeDirectory: () => void;
  reveal: () => void;
  open: (projectId: string) => void;
  remove: (project: ProjectSummary) => void;
  saveCurrent: () => void;
  importBackup: () => void;
  exportBackup: () => void;
  newProject: () => void;
}) {
  const [showSettings, setShowSettings] = useState(false),
    [deleteCandidate, setDeleteCandidate] = useState<ProjectSummary | null>(null);
  const formatUpdated = (value: string) =>
    new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
      new Date(value),
    );
  return (
    <Modal
      title="Projects"
      subtitle="Save, browse, and reopen projects from your local CriProx library."
      close={close}
      wide
      className="projects-modal"
    >
      <div className="projects-content">
        <div className="library-location">
          <span className="library-location-icon">
            <FolderOpen size={18} />
          </span>
          <div>
            <strong>{snapshot?.isDefault ? 'CriProx projects' : 'Custom projects folder'}</strong>
            <span title={snapshot?.root}>{snapshot?.root || 'Finding your projects folder…'}</span>
          </div>
          <button
            className={`icon-button ${showSettings ? 'active' : ''}`}
            aria-label="Project folder settings"
            title="Project folder settings"
            onClick={() => setShowSettings((shown) => !shown)}
          >
            <Settings2 size={17} />
          </button>
        </div>
        {showSettings && (
          <div className="project-folder-settings">
            <div>
              <strong>Projects folder</strong>
              <span>
                New projects get their own subfolder here. Uploaded artwork is stored in that
                project’s assets folder.
              </span>
            </div>
            <div className="project-folder-actions">
              <button className="secondary compact" disabled={busy} onClick={reveal}>
                <ExternalLink size={14} /> Show in folder
              </button>
              <button className="secondary compact" disabled={busy} onClick={changeDirectory}>
                <FolderCog size={14} /> Change folder
              </button>
              <button className="secondary compact" disabled={busy} onClick={exportBackup}>
                <ArrowDownToLine size={14} /> Export JSON backup
              </button>
            </div>
          </div>
        )}
        <div className="projects-section-heading">
          <div>
            <h3>Saved projects</h3>
            <span>
              {snapshot
                ? `${snapshot.projects.length} project${snapshot.projects.length === 1 ? '' : 's'}`
                : 'Loading…'}
            </span>
          </div>
          <button
            className="icon-button"
            aria-label="Refresh projects"
            title="Refresh projects"
            disabled={busy}
            onClick={refresh}
          >
            <RotateCcw className={busy ? 'spin' : ''} size={15} />
          </button>
        </div>
        <div className="project-browser" aria-busy={busy}>
          {snapshot?.projects.map((item) => {
            const current = item.id === activeProjectId;
            return (
              <div className="project-browser-entry" key={item.id}>
                <article className={`project-browser-item ${current ? 'current' : ''}`}>
                  <span className="project-browser-icon">
                    <FolderOpen size={20} />
                  </span>
                  <div className="project-browser-copy">
                    <strong>{item.name}</strong>
                    <span>
                      {item.cardCount} card{item.cardCount === 1 ? '' : 's'}
                      <i />
                      <Clock3 size={11} /> {formatUpdated(item.updatedAt)}
                    </span>
                  </div>
                  {current && <span className="current-project-badge">CURRENT</span>}
                  <div className="project-browser-actions">
                    <button
                      className="secondary compact"
                      disabled={busy || current}
                      onClick={() => open(item.id)}
                    >
                      {current ? 'Open' : 'Open project'}
                    </button>
                    <button
                      className="icon-button project-delete-button"
                      aria-label={`Delete ${item.name}`}
                      title="Move project to Trash"
                      disabled={busy}
                      onClick={() => setDeleteCandidate(item)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
                {deleteCandidate?.id === item.id && (
                  <div className="project-delete-confirm" role="alert">
                    <span>
                      Move <strong>{item.name}</strong> and its saved artwork to Trash?
                    </span>
                    <div>
                      <button
                        className="secondary compact"
                        disabled={busy}
                        onClick={() => setDeleteCandidate(null)}
                      >
                        Cancel
                      </button>
                      <button
                        className="danger-button compact"
                        disabled={busy}
                        onClick={() => {
                          remove(item);
                          setDeleteCandidate(null);
                        }}
                      >
                        <Trash2 size={14} /> Move to Trash
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {snapshot && !snapshot.projects.length && (
            <div className="empty-project-browser">
              <FolderOpen size={30} strokeWidth={1.3} />
              <strong>No saved projects yet</strong>
              <span>Save the current project to create its folder and add it here.</span>
            </div>
          )}
          {!snapshot && (
            <div className="empty-project-browser">
              <LoaderCircle className="spin" size={26} />
              <span>Finding saved projects…</span>
            </div>
          )}
        </div>
      </div>
      <div className="modal-footer projects-footer">
        <div>
          <button className="secondary compact" disabled={busy} onClick={importBackup}>
            <Upload size={14} /> Import JSON backup
          </button>
          <button className="secondary compact" disabled={busy} onClick={newProject}>
            <FilePlus2 size={14} /> New project
          </button>
        </div>
        <button className="primary compact" disabled={busy} onClick={saveCurrent}>
          {busy ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}
          Save current project
        </button>
      </div>
    </Modal>
  );
}
function ImportModal({
  add,
  remaining,
  close,
}: {
  add: (entries: Entry[]) => void;
  remaining: number;
  close: () => void;
}) {
  const [mode, setMode] = useState<'link' | 'list'>('link'),
    [link, setLink] = useState(''),
    [text, setText] = useState(''),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const parsed = parseDeck(text);
  const deckText = (cards: typeof parsed.cards) =>
    cards
      .map(
        (card) =>
          `${card.quantity} ${card.name}${card.set ? ` (${card.set.toUpperCase()})${card.collector ? ` ${card.collector}` : ''}` : ''}`,
      )
      .join('\n');

  async function resolveCards(cards: typeof parsed.cards, retryText: string) {
    if (cards.reduce((n, card) => n + card.quantity, 0) > remaining) {
      setError(`There is room for ${remaining} more cards in this project.`);
      return;
    }
    setBusy('Finding your cards…');
    const result = await resolveDeck(cards, setBusy);
    if (result.found.length)
      add(
        result.found.map(({ card, line }) => ({
          id: crypto.randomUUID(),
          card,
          quantity: line.quantity,
          face: 0,
        })),
      );
    if (result.missing.length) {
      const foundLines = new Set(result.found.map((found) => found.line.line));
      setMode('list');
      setText(
        retryText
          .split(/\r?\n/)
          .filter((_, index) => !foundLines.has(index + 1))
          .join('\n'),
      );
      setError(
        `${result.found.length} entries added. Could not find:\n${result.missing.join('\n')}\nCheck spelling or the set and collector number, then retry.`,
      );
    } else {
      close();
    }
  }

  async function importCards() {
    setError('');
    if (parsed.errors.length) {
      setError(parsed.errors.join('\n'));
      return;
    }
    if (!parsed.cards.length) {
      setError('Paste at least one card name.');
      return;
    }
    try {
      await resolveCards(parsed.cards, text);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy('');
    }
  }

  async function importLink() {
    setError('');
    setBusy('Loading deck…');
    try {
      const deck = await importDeckSource(link);
      await resolveCards(deck.cards, deckText(deck.cards));
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy('');
    }
  }
  return (
    <Modal
      title="Import a deck"
      subtitle="Use a Moxfield or Archidekt link, or paste a card list."
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="import-content">
        <div className="segmented import-source-toggle" aria-label="Deck import source">
          <button
            className={mode === 'link' ? 'selected' : ''}
            aria-pressed={mode === 'link'}
            disabled={!!busy}
            onClick={() => {
              setMode('link');
              setError('');
            }}
          >
            <Link2 size={14} /> Deck link
          </button>
          <button
            className={mode === 'list' ? 'selected' : ''}
            aria-pressed={mode === 'list'}
            disabled={!!busy}
            onClick={() => {
              setMode('list');
              setError('');
            }}
          >
            <Upload size={14} /> Card list
          </button>
        </div>
        {mode === 'link' ? (
          <>
            <div className="field-heading">
              <label htmlFor="deck-link">Public or unlisted deck link</label>
            </div>
            <div className="deck-link-field">
              <Link2 size={16} />
              <input
                id="deck-link"
                autoFocus
                type="url"
                value={link}
                disabled={!!busy}
                onChange={(event) => setLink(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && link.trim() && !busy) void importLink();
                }}
                placeholder="https://moxfield.com/decks/…"
              />
            </div>
            <div className="import-hint">
              <span>Moxfield and Archidekt links are supported</span>
              <span>Maybeboards excluded</span>
            </div>
          </>
        ) : (
          <>
            <div className="field-heading">
              <label htmlFor="decklist">Card list</label>
              <button
                className="text-button"
                disabled={!!busy}
                onClick={() =>
                  setText('1 Sol Ring\n1 Command Tower\n2 Arcane Signet\n1 Swords to Plowshares')
                }
              >
                Try an example
              </button>
            </div>
            <textarea
              id="decklist"
              autoFocus
              rows={10}
              value={text}
              disabled={!!busy}
              onChange={(event) => setText(event.target.value)}
              placeholder={'1 Sol Ring\n4 Lightning Bolt\n1 Counterspell (MH2) 267'}
            />
            <div className="import-hint">
              <span>Quantity + card name · optional (SET) number</span>
              <span>{parsed.cards.reduce((n, card) => n + card.quantity, 0)} cards</span>
            </div>
          </>
        )}
        <div className="soft-info">
          <Sparkles size={17} />
          <span>
            Card data comes from Scryfall. Linked decks keep their selected printings when
            available, and you can choose a different printing after import.
          </span>
        </div>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <span className="muted">Up to 500 cards per project</span>
        <button
          className="primary"
          disabled={!!busy || !(mode === 'link' ? link : text).trim()}
          onClick={mode === 'link' ? importLink : importCards}
        >
          {busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}{' '}
          {busy || (mode === 'link' ? 'Import deck' : 'Add to project')}
        </button>
      </div>
    </Modal>
  );
}
function CardSearchModal({
  add,
  remaining,
  close,
}: {
  add: (card: Card) => void;
  remaining: number;
  close: () => void;
}) {
  const [query, setQuery] = useState(''),
    [cards, setCards] = useState<Card[]>([]),
    [next, setNext] = useState<string>(),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [searched, setSearched] = useState(''),
    [added, setAdded] = useState<Record<string, number>>({});

  async function search(event: React.FormEvent) {
    event.preventDefault();
    const term = query.trim();
    if (!term) {
      setError('Enter a card name to search.');
      return;
    }
    setBusy('Searching cards…');
    setError('');
    try {
      const result = await searchCards(term);
      setCards(result.cards);
      setNext(result.next);
      setSearched(term);
    } catch (reason) {
      setCards([]);
      setNext(undefined);
      setSearched(term);
      setError(errorText(reason));
    } finally {
      setBusy('');
    }
  }

  async function loadMore() {
    if (!next) return;
    setBusy('Loading more cards…');
    setError('');
    try {
      const result = await searchCards(searched, next);
      setCards((current) => [
        ...current,
        ...result.cards.filter((card) => !current.some((candidate) => candidate.id === card.id)),
      ]);
      setNext(result.next);
    } catch (reason) {
      setError(errorText(reason));
    } finally {
      setBusy('');
    }
  }

  function addCard(card: Card) {
    if (remaining <= 0) return;
    add(card);
    const key = card.oracleId || card.id;
    setAdded((current) => ({ ...current, [key]: (current[key] || 0) + 1 }));
  }

  return (
    <Modal
      wide
      className="card-search-modal"
      title="Find a card"
      subtitle="Search Scryfall and add cards to your project one at a time."
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="card-search-content">
        <form className="card-search-form" onSubmit={search}>
          <div className="search-field">
            <Search size={17} />
            <input
              autoFocus
              aria-label="Search Scryfall cards"
              placeholder="Search by card name…"
              value={query}
              disabled={!!busy}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <button className="primary" disabled={!!busy || !query.trim()} type="submit">
            {busy && !cards.length ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Search size={16} />
            )}
            Search
          </button>
        </form>
        <div className="card-search-summary" aria-live="polite">
          {searched && !error && (
            <span>
              {cards.length} {cards.length === 1 ? 'result' : 'results'} for “{searched}”
            </span>
          )}
          {Object.values(added).reduce((sum, count) => sum + count, 0) > 0 && (
            <span>
              {Object.values(added).reduce((sum, count) => sum + count, 0)} added this session
            </span>
          )}
        </div>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        {!searched && !busy && (
          <div className="card-search-empty">
            <Search size={31} strokeWidth={1.3} />
            <strong>Search the card catalog</strong>
            <span>Try a full or partial name, such as “Sol Ring” or “Lightning”.</span>
          </div>
        )}
        {!!cards.length && (
          <div className="card-search-results">
            {cards.map((card) => {
              const addedCount = added[card.oracleId || card.id] || 0;
              return (
                <article className="card-search-result" key={card.id}>
                  <img src={card.faces[0].preview} alt="" loading="lazy" />
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
                    onClick={() => addCard(card)}
                  >
                    {addedCount ? <Check size={14} /> : <Plus size={14} />}
                    {addedCount ? `Added ${addedCount}` : 'Add card'}
                  </button>
                </article>
              );
            })}
          </div>
        )}
        {busy && !!cards.length && (
          <div className="loading">
            <LoaderCircle className="spin" size={18} /> {busy}
          </div>
        )}
        {next && !busy && (
          <button className="secondary load-more" onClick={() => void loadMore()}>
            Load more results
          </button>
        )}
      </div>
      <div className="modal-footer">
        <span className="muted">
          {remaining > 0
            ? `Room for ${remaining} more card${remaining === 1 ? '' : 's'}`
            : 'This project has reached the 500-card limit'}
        </span>
        <button className="secondary" disabled={!!busy} onClick={close}>
          Done
        </button>
      </div>
    </Modal>
  );
}
function GuideVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !reducedMotion.matches) {
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: 0.65 },
    );
    const handleMotionPreference = () => {
      if (reducedMotion.matches) video.pause();
    };
    observer.observe(video);
    reducedMotion.addEventListener('change', handleMotionPreference);
    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener('change', handleMotionPreference);
    };
  }, []);
  return (
    <div className="guide-video-shell">
      <video
        ref={ref}
        aria-label={label}
        controls
        loop
        muted
        playsInline
        poster={poster}
        preload="metadata"
      >
        <source src={src} type="video/mp4" />
      </video>
    </div>
  );
}
function Guide({ close }: { close: () => void }) {
  const steps = [
    {
      title: 'Download the reusable template',
      description:
        'Open Create print PDF, choose your machine and paper, then download the one-time setup image. Keep the exact dimensions shown with that template.',
      video: {
        src: './tutorials/download-template.mp4',
        poster: './tutorials/download-template.jpg',
        label: 'Walkthrough: download the reusable template from CriProx',
      },
    },
    {
      title: 'Set it up in Design Space',
      description:
        'Upload the setup image as a flat Print Then Cut image, preserve its transparency, and set both dimensions to the exact values supplied by CriProx.',
      video: {
        src: './tutorials/design-space-setup.mp4',
        poster: './tutorials/design-space-setup.jpg',
        label: 'Walkthrough: upload and size the template in Design Space',
      },
    },
    {
      title: 'Capture Cricut’s print',
      description:
        'Make the project and save Cricut’s print as a one-page portrait PDF at actual size. Import that PDF into CriProx so the app can verify and save its registration marks.',
      video: {
        src: './tutorials/capture-registration.mp4',
        poster: './tutorials/capture-registration.jpg',
        label: 'Walkthrough: print the setup from Design Space and capture it in CriProx',
      },
    },
    {
      title: 'Save, print, and run the saved cut',
      description:
        'Save the card-sheet PDF from CriProx, open it in a dedicated PDF application, and print at 100% / Actual size with no fit or shrink scaling. CriProx does not print directly so it can preserve the selected output quality. Return to the same saved Design Space project, choose Already Printed or skip printing when available, and cut the sheet.',
    },
  ];
  return (
    <Modal
      title="Registered PDF printing"
      subtitle="Capture Cricut’s registration once, then reuse it."
      close={close}
      wide
    >
      <div className="guide-content">
        <div className="guide-banner">
          <Scissors size={28} />
          <div>
            <strong>Your artwork, inside Cricut’s captured marks.</strong>
            <p>
              CriProx places your cards into a verified template captured from Design Space and
              saves a full-quality PDF. The saved Cricut project supplies the matching cut paths.
            </p>
          </div>
        </div>
        {steps.map(({ title, description, video }, i) => (
          <div className="guide-step" key={title}>
            <span>{i + 1}</span>
            <div className="guide-step-body">
              <h3>{title}</h3>
              <p>{description}</p>
              {video && <GuideVideo {...video} />}
            </div>
          </div>
        ))}
        <div className="soft-info">
          <CircleHelp size={20} />
          <span>
            Keep the Design Space project, machine, paper, dimensions, and mat position unchanged.
            Recapture the template after any setting change that affects the marks or cut layout.
          </span>
        </div>
        <p className="guide-limit">
          Run a size-check page after capturing a template. Printer scaling, materials, machine
          calibration, and manual back-side feeding can affect alignment.
        </p>
        <a
          className="external-link"
          href="https://help.cricut.com/hc/en-us/articles/360009387274-How-to-Print-Then-Cut-in-Design-Space"
          target="_blank"
          rel="noreferrer"
        >
          Official Cricut Print Then Cut instructions <ExternalLink size={14} />
        </a>
      </div>
      <div className="modal-footer">
        <span className="muted">One measured test saves a stack of paper.</span>
        <button className="primary" onClick={close}>
          Back to studio <ArrowRight size={16} />
        </button>
      </div>
    </Modal>
  );
}
function ExportModal({
  project,
  sheets,
  current,
  close,
  notify,
}: {
  project: Project;
  sheets: Sheet[];
  current: number;
  close: () => void;
  notify: (text: string) => void;
}) {
  const [scope, setScope] = useState<'all' | 'current'>('all'),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const selected = scope === 'all' ? sheets : [sheets[current]];
  async function run(calibration = false) {
    setBusy('Preparing export…');
    setError('');
    try {
      const first = project.entries[0];
      const calibrationSheets: Sheet[] = [
        {
          index: 0,
          width: project.settings.width,
          height: project.settings.height,
          placements: [
            {
              entry: first,
              copy: 0,
              x: 0,
              y: 0,
              width: project.settings.width,
              height: project.settings.height,
              rotated: false,
            },
          ],
        },
      ];
      await exportBundle(project, calibration ? calibrationSheets : selected, setBusy, calibration);
      notify(
        calibration
          ? 'Size-check package downloaded.'
          : 'Export package downloaded. Start with START-HERE.txt.',
      );
      close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <Modal
      title="Ready for Design Space"
      subtitle="Artwork and cutting geometry, together in one package."
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="export-content">
        <div className="package-visual">
          <div className="file-icon">
            <ImagePlus size={28} />
            <span>PNG</span>
          </div>
          <Plus size={20} />
          <div className="file-icon svg">
            <Scissors size={28} />
            <span>SVG</span>
          </div>
          <div>
            <strong>A little precision, packed.</strong>
            <p>
              {project.settings.dpi} DPI artwork · vector cut reference
              <br />
              Exact dimensions · step-by-step guide
            </p>
          </div>
        </div>
        <label className="field-label" htmlFor="scope">
          Sheets to export
        </label>
        <select
          id="scope"
          value={scope}
          disabled={!!busy}
          onChange={(e) => setScope(e.target.value as typeof scope)}
        >
          <option value="all">All sheets ({sheets.length})</option>
          <option value="current">Current sheet ({current + 1})</option>
        </select>
        <div className="dimension-list">
          {selected.slice(0, 6).map((s) => (
            <div key={s.index}>
              <span>
                Sheet {s.index + 1} · {s.placements.length} cards
              </span>
              <strong>{formatDimensions(s.width, s.height, project.settings.units)}</strong>
            </div>
          ))}
          {selected.length > 6 && (
            <span className="muted">+ {selected.length - 6} more sheets</span>
          )}
        </div>
        <div className="soft-info">
          <ShieldCheck size={20} />
          <span>
            Print through Design Space so Cricut creates the correct sensor marks. This export does
            not include registration marks.
          </span>
        </div>
        {project.settings.profile === 'expanded' && (
          <div className="warning-box">
            {project.settings.paper === 'letter'
              ? 'Six-card Letter layout uses the experimental Tabloid-to-Letter workaround. Confirm one page and all four sensor marks before printing.'
              : 'Six-card layout is experimental. Confirm it fits your machine and paper in Design Space without resizing.'}
          </div>
        )}
        {project.settings.profile === 'seven' && (
          <div className="warning-box">
            Seven-card layout is an experimental Tabloid-to-Letter workaround. Confirm one page, all
            four sensor marks, and a measured test cut before using card stock.
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <button className="text-button calibration" disabled={!!busy} onClick={() => run(true)}>
          <Ruler size={17} /> Download a size-check card first
        </button>
      </div>
      <div className="modal-footer">
        <span className="muted">
          {selected.length} sheet{selected.length === 1 ? '' : 's'} · ZIP package
        </span>
        <button className="primary" disabled={!!busy} onClick={() => run()}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <Download size={17} />}{' '}
          {busy || 'Download package'}
        </button>
      </div>
    </Modal>
  );
}
function CardArtwork({
  entry,
  label,
  large = false,
}: {
  entry: Entry;
  label: boolean;
  large?: boolean;
}) {
  const [failed, setFailed] = useState(false),
    src = entry.card.faces[entry.face][large ? 'image' : 'preview'];
  useEffect(() => {
    setFailed(false);
  }, [src]);
  return (
    <>
      <img src={src} alt={entry.card.faces[entry.face].name} onError={() => setFailed(true)} />
      {failed && (
        <div className="art-fallback">
          <ImagePlus size={22} />
          <span>{entry.card.name}</span>
          <small>Artwork unavailable</small>
        </div>
      )}
      {label && <span className="proxy-label">PLAYTEST • NOT FOR SALE</span>}
    </>
  );
}
function ArtworkInspector({
  entry,
  copy,
  customArt,
  proxyLabel,
  backsEnabled,
  close,
  choosePrinting,
  chooseCustomArt,
  uploadCustomArt,
  chooseMpcArt,
  changeFace,
}: {
  entry: Entry;
  copy: number;
  customArt: Card[];
  proxyLabel: boolean;
  backsEnabled: boolean;
  close: () => void;
  choosePrinting: (card: Card) => void;
  chooseCustomArt: (card: Card) => void;
  uploadCustomArt: (file: File) => Promise<void>;
  chooseMpcArt: (card: Card) => void;
  changeFace: (face: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [source, setSource] = useState<'scryfall' | 'mpc'>('scryfall'),
    [cards, setCards] = useState<Card[]>([]),
    [next, setNext] = useState<string>(),
    [loadingPrintings, setLoadingPrintings] = useState(false),
    [printingError, setPrintingError] = useState(''),
    [filter, setFilter] = useState('');
  useEffect(() => {
    // Each card opens on Scryfall, while changing the artwork source for the
    // current card keeps that source selected after an artwork is applied.
    setSource('scryfall');
  }, [entry.id]);
  useEffect(() => {
    let active = true;
    setCards([]);
    setNext(undefined);
    setFilter('');
    setPrintingError('');
    if (!entry.card.oracleId) return;
    setLoadingPrintings(true);
    variants(entry.card)
      .then((result) => {
        if (!active) return;
        setCards(result.cards);
        setNext(result.next);
      })
      .catch((reason) => {
        if (active) setPrintingError(errorText(reason));
      })
      .finally(() => {
        if (active) setLoadingPrintings(false);
      });
    return () => {
      active = false;
    };
  }, [entry.card]);
  async function loadMorePrintings() {
    if (!next) return;
    setLoadingPrintings(true);
    setPrintingError('');
    try {
      const result = await variants(entry.card, next);
      setCards((current) => [...current, ...result.cards]);
      setNext(result.next);
    } catch (reason) {
      setPrintingError(errorText(reason));
    } finally {
      setLoadingPrintings(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      await uploadCustomArt(file);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <Modal
      wide
      className="artwork-modal"
      title={entry.card.name}
      subtitle={`${entry.card.setName}${entry.card.collector ? ` · #${entry.card.collector}` : ''}`}
      close={close}
    >
      <div className="art-inspector">
        <div className="inspector-preview">
          <div className="inspector-card">
            <CardArtwork entry={entry} label={proxyLabel} large />
          </div>
          <span>Print preview · front artwork</span>
        </div>
        <div className="inspector-controls">
          <div className="section-label">CARD ARTWORK</div>
          <h3>Choose what prints</h3>
          <p>
            {entry.quantity > 1
              ? `Editing copy ${copy + 1} of ${entry.quantity}. Artwork changes apply only to this copy.`
              : 'Change this card’s artwork without changing its position on the sheet.'}
          </p>
          {entry.card.faces.length > 1 && (
            <>
              <label className="inspector-face">
                Card face
                <select value={entry.face} onChange={(e) => changeFace(Number(e.target.value))}>
                  {entry.card.faces.map((face, index) => (
                    <option key={face.name} value={index}>
                      {face.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="warning-box double-sided-warning" role="status">
                This is a double-sided card.{' '}
                {backsEnabled
                  ? `${entry.card.faces[entry.face === 0 ? 1 : 0].name} will print as its matching reverse face.`
                  : 'Enable Print card backs to include its matching reverse face.'}
              </div>
            </>
          )}
          <div className="art-source-toggle" role="tablist" aria-label="Artwork source">
            <button
              role="tab"
              aria-selected={source === 'scryfall'}
              className={source === 'scryfall' ? 'selected' : ''}
              onClick={() => setSource('scryfall')}
            >
              Scryfall
            </button>
            <button
              role="tab"
              aria-selected={source === 'mpc'}
              className={source === 'mpc' ? 'selected' : ''}
              onClick={() => setSource('mpc')}
            >
              MPC Autofill
            </button>
          </div>
          {source === 'scryfall' ? (
            <div className="art-source-panel">
              <div className="search-field">
                <Search size={16} />
                <input
                  aria-label="Filter Scryfall printings"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter by set or collector number…"
                />
              </div>
              {printingError && (
                <div role="alert" className="error-box">
                  {printingError}
                  <button className="text-button" onClick={() => void loadMorePrintings()}>
                    Retry
                  </button>
                </div>
              )}
              <div className="variant-grid inspector-variant-grid">
                {cards
                  .filter((card) =>
                    `${card.setName} ${card.set} ${card.collector}`
                      .toLowerCase()
                      .includes(filter.toLowerCase()),
                  )
                  .map((card) => (
                    <button
                      key={card.id}
                      className={`variant-card ${entry.card.id === card.id ? 'chosen' : ''}`}
                      onClick={() => choosePrinting(card)}
                    >
                      <img src={card.faces[0].preview} alt={card.name} loading="lazy" />
                      <strong>{card.setName}</strong>
                      <span>
                        {card.set.toUpperCase()} · #{card.collector}
                        {entry.card.id === card.id && ' · Selected'}
                      </span>
                    </button>
                  ))}
              </div>
              {!loadingPrintings && !printingError && !cards.length && (
                <p className="empty-message">
                  {entry.card.oracleId
                    ? 'No Scryfall printings found for this card.'
                    : 'Scryfall printings are unavailable for local artwork.'}
                </p>
              )}
              {loadingPrintings && (
                <div className="loading">
                  <LoaderCircle className="spin" size={18} /> Finding Scryfall printings…
                </div>
              )}
              {next && !loadingPrintings && (
                <button className="secondary load-more" onClick={() => void loadMorePrintings()}>
                  Load more printings
                </button>
              )}
            </div>
          ) : (
            <div className="art-source-panel">
              <MpcArtworkSearch
                type="CARD"
                initialQuery={entry.card.name}
                openByDefault
                hideTrigger
                choose={(artwork) => chooseMpcArt(mpcArtworkAsCard(artwork, entry.card.name))}
              />
            </div>
          )}
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <div className="custom-art-panel">
            <div className="custom-art-heading">
              <div>
                <strong>Custom artwork</strong>
                <span>Upload your own image or reuse artwork already in this project.</span>
              </div>
              <button className="secondary" disabled={busy} onClick={() => input.current?.click()}>
                {busy ? <LoaderCircle className="spin" size={15} /> : <ImagePlus size={15} />}
                {busy ? 'Reading…' : 'Upload art'}
              </button>
            </div>
            {customArt.length > 0 && (
              <div className="project-art-grid">
                {customArt.map((card) => (
                  <button key={card.id} onClick={() => chooseCustomArt(card)}>
                    <img src={card.faces[0].preview} alt={card.name} />
                    <span>{card.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      <input
        hidden
        ref={input}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      <div className="modal-footer">
        <span className="muted">Artwork changes apply only to this card copy.</span>
        <button className="secondary" onClick={close}>
          Done
        </button>
      </div>
    </Modal>
  );
}
function SheetPreview({
  sheet,
  settings,
  mode,
  zoom,
  select,
  inspect,
}: {
  sheet?: Sheet;
  settings: Settings;
  mode: string;
  zoom: number;
  select: (target: EntryCopy) => void;
  inspect: (target: EntryCopy) => void;
}) {
  const paper = settings.paper === 'letter' ? { w: 215.9, h: 279.4 } : { w: 210, h: 297 };
  const area = envelope(settings);
  return (
    <div className="paper-stage">
      <div
        className="paper"
        style={{
          width: `calc(var(--paper-width, 390px) * ${zoom / 100})`,
          aspectRatio: `${paper.w} / ${paper.h}`,
        }}
      >
        <span className="page-caption">
          {settings.paper === 'letter' ? 'US LETTER' : 'A4'} · LAYOUT PREVIEW
        </span>
        <div
          className="safe-area"
          style={{
            width: `${(area.width / paper.w) * 100}%`,
            height: `${(area.height / paper.h) * 100}%`,
          }}
        />
        {sheet ? (
          <div
            className="sheet-art"
            style={{
              width: `${(sheet.width / paper.w) * 100}%`,
              height: `${(sheet.height / paper.h) * 100}%`,
            }}
          >
            {sheet.placements.map((p, i) => (
              <button
                key={`${p.entry.id}-${p.copy}`}
                aria-label={`Select ${p.entry.card.name}, copy ${p.copy + 1}`}
                title={mode === 'cuts' ? 'Select card' : 'Open artwork preview'}
                className={`placed-card ${mode === 'cuts' ? 'cut-only' : ''}`}
                style={{
                  left: `${(p.x / sheet.width) * 100}%`,
                  top: `${(p.y / sheet.height) * 100}%`,
                  width: `${(p.width / sheet.width) * 100}%`,
                  height: `${(p.height / sheet.height) * 100}%`,
                  borderRadius: `${(settings.radius / p.width) * 100}% / ${(settings.radius / p.height) * 100}%`,
                }}
                onClick={() =>
                  (mode === 'cuts' ? select : inspect)({ entryId: p.entry.id, copy: p.copy })
                }
              >
                {mode === 'cuts' ? (
                  <span>
                    {String(i + 1).padStart(2, '0')}
                    <small>
                      {formatDimensions(settings.width, settings.height, settings.units)}
                    </small>
                  </span>
                ) : (
                  <div
                    className="card-front"
                    style={
                      p.rotated
                        ? {
                            width: `${(p.height / p.width) * 100}%`,
                            height: `${(p.width / p.height) * 100}%`,
                            transform: 'rotate(90deg)',
                            transformOrigin: 'top left',
                            left: '100%',
                          }
                        : {}
                    }
                  >
                    <CardArtwork entry={p.entry} label={settings.proxyLabel} />
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : (
          <div className="empty-paper">
            <Layers3 size={38} strokeWidth={1} />
            <strong>Make room for your next deck.</strong>
            <span>Paste a card list or add your own artwork.</span>
          </div>
        )}
        <span className="paper-bottom">Artwork preview · cut geometry stays fixed</span>
      </div>
    </div>
  );
}
export default function App() {
  const [project, setProject] = useState<Project>(createSample),
    [loaded, setLoaded] = useState(false),
    [saved, setSaved] = useState('Opening workspace…');
  const [modal, setModal] = useState<
    'search' | 'import' | 'guide' | 'export' | 'new' | 'clear' | 'registered' | 'projects' | null
  >(null);
  const [selected, setSelected] = useState<EntryCopy | null>(null),
    [inspecting, setInspecting] = useState<EntryCopy | null>(null),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [mode, setMode] = useState('art'),
    [zoom, setZoom] = useState(100),
    [toast, setToast] = useState(''),
    [releaseUpdate, setReleaseUpdate] = useState<ReleaseUpdate | null>(null),
    [uploading, setUploading] = useState(false),
    [projectLibrary, setProjectLibrary] = useState<ProjectLibrarySnapshot | null>(null),
    [libraryBusy, setLibraryBusy] = useState(false),
    [activeProjectId, setActiveProjectId] = useState<string | null>(() =>
      localStorage.getItem('criprox-active-project'),
    );
  const imageInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null);
  const saveQueue = useRef(Promise.resolve());
  const rememberActiveProject = useCallback((projectId: string | null) => {
    setActiveProjectId(projectId);
    if (projectId) localStorage.setItem('criprox-active-project', projectId);
    else localStorage.removeItem('criprox-active-project');
  }, []);
  const refreshProjectLibrary = useCallback(async () => {
    const projects = window.criprox?.projects;
    if (!projects) return;
    setLibraryBusy(true);
    try {
      const snapshot = await projects.list();
      setProjectLibrary(snapshot);
      setActiveProjectId((current) => {
        if (!current || snapshot.projects.some((item) => item.id === current)) return current;
        localStorage.removeItem('criprox-active-project');
        return null;
      });
    } catch (error) {
      setToast(errorText(error));
    } finally {
      setLibraryBusy(false);
    }
  }, []);
  useEffect(() => {
    let active = true;
    get('criprox-project')
      .then((value) => {
        if (active && value) setProject(validateProject(value));
      })
      .catch(() => {
        if (active)
          setToast(
            'Saved workspace could not be restored. Open a saved project backup to recover it.',
          );
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    void refreshProjectLibrary();
  }, [refreshProjectLibrary]);
  useEffect(() => {
    const releases = window.criprox?.releases;
    if (!releases) return;
    let active = true;
    releases
      .check()
      .then((update) => {
        if (
          active &&
          update &&
          localStorage.getItem('criprox-dismissed-release') !== update.latestVersion
        ) {
          setReleaseUpdate(update);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!loaded) return;
    setSaved('Saving…');
    const timer = setTimeout(() => {
      saveQueue.current = saveQueue.current
        .catch(() => {})
        .then(() => set('criprox-project', project));
      saveQueue.current
        .then(() => setSaved('Saved on this device'))
        .catch(() => setSaved('Could not autosave · save a backup'));
    }, 400);
    return () => clearTimeout(timer);
  }, [project, loaded]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(''), 6000);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const sheets = useMemo(
    () => layout(project.entries, project.settings),
    [project.entries, project.settings],
  );
  const currentPage = Math.min(page, Math.max(0, sheets.length - 1)),
    sheet = sheets[currentPage];
  const count = project.entries.reduce((n, e) => n + e.quantity, 0),
    g = grid(project.settings),
    doubleSidedCount = doubleSidedCardCount(project.entries),
    sharedBackRequired = count > doubleSidedCount;
  const activeEntry = project.entries.find((e) => e.id === selected?.entryId);
  const inspectedEntry = project.entries.find((e) => e.id === inspecting?.entryId);
  const customArt = project.entries
    .filter(
      (entry) => entry.id !== inspecting?.entryId && ['local', 'custom'].includes(entry.card.set),
    )
    .filter(
      (entry, index, entries) =>
        entries.findIndex((candidate) => candidate.card.id === entry.card.id) === index,
    )
    .map((entry) => entry.card);
  const filtered = project.entries.filter((e) =>
    `${e.card.name} ${e.card.setName}`.toLowerCase().includes(search.toLowerCase()),
  );
  function settings(patch: Partial<Settings>) {
    setProject((p) => ({ ...p, settings: { ...p.settings, ...patch } }));
  }
  function editEntry(id: string, patch: Partial<Entry>) {
    setProject((p) => ({
      ...p,
      entries: p.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)),
    }));
  }
  function inspect(target: EntryCopy) {
    setSelected(target);
    setInspecting(target);
  }
  function editCopy(target: EntryCopy, patch: EntryArtworkPatch) {
    const entry = project.entries.find((candidate) => candidate.id === target.entryId);
    if (!entry || target.copy < 0 || target.copy >= entry.quantity) return;
    if (entry.quantity === 1) {
      editEntry(entry.id, patch);
      return;
    }
    const editedId = crypto.randomUUID(),
      remainderId = crypto.randomUUID();
    setProject((current) => ({
      ...current,
      entries: editEntryCopy(current.entries, target, patch, {
        edited: editedId,
        remainder: remainderId,
      }),
    }));
    const edited = { entryId: editedId, copy: 0 };
    setSelected((current) =>
      current?.entryId === target.entryId && current.copy === target.copy ? edited : current,
    );
    setInspecting((current) =>
      current?.entryId === target.entryId && current.copy === target.copy ? edited : current,
    );
  }
  function applyArtwork(target: EntryCopy, entry: Entry, artwork: Card) {
    const face = artwork.faces[0],
      doubleSided = isDoubleSidedCard(entry.card);
    const faces = doubleSided
      ? entry.card.faces.map((existing, index) =>
          index === entry.face
            ? { name: existing.name, image: face.image, preview: face.preview }
            : existing,
        )
      : [{ name: entry.card.name, image: face.image, preview: face.preview }];
    editCopy(target, {
      face: doubleSided ? entry.face : 0,
      card: {
        ...entry.card,
        id: artwork.id,
        set: artwork.set,
        setName: artwork.setName,
        collector: artwork.collector,
        faces,
      },
    });
  }
  function add(entries: Entry[]) {
    setProject((p) => {
      if (
        p.entries.reduce((n, e) => n + e.quantity, 0) +
          entries.reduce((n, e) => n + e.quantity, 0) >
        500
      )
        return p;
      return { ...p, entries: [...p.entries, ...entries] };
    });
  }
  function addCard(card: Card) {
    setProject((current) => {
      const total = current.entries.reduce((sum, entry) => sum + entry.quantity, 0);
      if (total >= 500) return current;
      const matching = current.entries.find(
        (entry) =>
          entry.quantity < 100 &&
          (card.oracleId ? entry.card.oracleId === card.oracleId : entry.card.id === card.id),
      );
      if (matching)
        return {
          ...current,
          entries: current.entries.map((entry) =>
            entry.id === matching.id ? { ...entry, quantity: entry.quantity + 1 } : entry,
          ),
        };
      return {
        ...current,
        entries: [...current.entries, { id: crypto.randomUUID(), card, quantity: 1, face: 0 }],
      };
    });
  }
  function quantity(entry: Entry, delta: number) {
    if (entry.quantity + delta < 1 || entry.quantity + delta > 100) return;
    if (delta > 0 && count >= 500) {
      setToast('Projects can contain up to 500 cards.');
      return;
    }
    editEntry(entry.id, { quantity: entry.quantity + delta });
  }
  async function uploadImages(files: FileList | null) {
    if (!files?.length) return;
    if (files.length + count > 500) {
      setToast('Projects can contain up to 500 cards.');
      return;
    }
    setUploading(true);
    try {
      const entries: Entry[] = [];
      for (const file of Array.from(files)) {
        const card = await cardFromArtwork(file);
        entries.push({
          id: crypto.randomUUID(),
          quantity: 1,
          face: 0,
          card,
        });
      }
      add(entries);
      setToast(`${entries.length} artwork file${entries.length === 1 ? '' : 's'} added.`);
    } catch (e) {
      setToast(errorText(e));
    } finally {
      setUploading(false);
      if (imageInput.current) imageInput.current.value = '';
    }
  }
  async function uploadBackArtwork(file?: File) {
    if (!file) return;
    const card = await cardFromArtwork(file);
    setProject((current) => ({
      ...current,
      backArtwork: {
        ...card.faces[0],
        name: 'Card back',
      },
    }));
    setToast('Card-back artwork saved.');
  }
  function chooseBackArtwork(face: Project['backArtwork']) {
    if (!face) return;
    setProject((current) => ({ ...current, backArtwork: face }));
    setToast('MPC Autofill card back selected.');
  }
  async function exportProjectBackup() {
    try {
      const didSave = await saveProjectAs(project);
      setToast(didSave ? 'Project backup exported.' : 'Export cancelled.');
    } catch (error) {
      setToast(errorText(error));
    }
  }
  async function saveCurrentProject() {
    const projects = window.criprox?.projects;
    if (!projects) {
      await exportProjectBackup();
      return;
    }
    setLibraryBusy(true);
    try {
      const result = await projects.save(activeProjectId, JSON.stringify(project));
      rememberActiveProject(result.project.id);
      setProjectLibrary(result.snapshot);
      setToast('Project saved to your CriProx projects folder.');
    } catch (error) {
      setToast(errorText(error));
    } finally {
      setLibraryBusy(false);
    }
  }
  async function openManagedProject(projectId: string) {
    const projects = window.criprox?.projects;
    if (!projects) return;
    setLibraryBusy(true);
    try {
      const next = validateProject(JSON.parse(await projects.open(projectId)));
      setProject(next);
      rememberActiveProject(projectId);
      setPage(0);
      setSelected(null);
      setInspecting(null);
      setModal(null);
      setToast('Project opened.');
    } catch (error) {
      setToast(errorText(error));
    } finally {
      setLibraryBusy(false);
    }
  }
  async function deleteManagedProject(item: ProjectSummary) {
    const projects = window.criprox?.projects;
    if (!projects) return;
    setLibraryBusy(true);
    try {
      const snapshot = await projects.delete(item.id);
      setProjectLibrary(snapshot);
      const wasCurrent = item.id === activeProjectId;
      if (wasCurrent) rememberActiveProject(null);
      setToast(
        wasCurrent
          ? `“${item.name}” moved to Trash. Your open workspace is now a local draft.`
          : `“${item.name}” moved to Trash.`,
      );
    } catch (error) {
      setToast(errorText(error));
    } finally {
      setLibraryBusy(false);
    }
  }
  async function changeProjectsDirectory() {
    const projects = window.criprox?.projects;
    if (!projects) return;
    setLibraryBusy(true);
    try {
      const snapshot = await projects.chooseDirectory();
      if (snapshot) {
        setProjectLibrary(snapshot);
        rememberActiveProject(null);
        setToast('Projects folder updated. Save this project to add it to the new folder.');
      }
    } catch (error) {
      setToast(errorText(error));
    } finally {
      setLibraryBusy(false);
    }
  }
  async function revealProjectsDirectory() {
    setLibraryBusy(true);
    try {
      await window.criprox?.projects?.reveal();
    } catch (error) {
      setToast(errorText(error));
    } finally {
      setLibraryBusy(false);
    }
  }
  async function openProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 100000000) throw new Error('Project files must be under 100 MB.');
      const next = validateProject(JSON.parse(await file.text()));
      setProject(next);
      rememberActiveProject(null);
      setPage(0);
      setSelected(null);
      setInspecting(null);
      setToast('Project opened.');
    } catch (e) {
      setToast(errorText(e));
    } finally {
      if (projectInput.current) projectInput.current.value = '';
    }
  }
  function dismissRelease() {
    if (releaseUpdate) {
      localStorage.setItem('criprox-dismissed-release', releaseUpdate.latestVersion);
    }
    setReleaseUpdate(null);
  }
  return (
    <div className="app-shell">
      <header className="topbar">
        <WindowControls />
        <a className="brand" href="#" aria-label="CriProx studio">
          <span className="brand-icon">
            <Layers3 size={22} />
          </span>
          <span>
            Cri<span className="brand-accent">Prox</span>
            <small>CARD SHEET STUDIO</small>
          </span>
        </a>
        <div className="workspace-title">
          <button
            className="breadcrumb"
            onClick={() =>
              window.criprox?.projects ? setModal('projects') : projectInput.current?.click()
            }
          >
            {window.criprox?.projects ? 'Projects' : 'Workspace'} <ChevronRight size={12} />
          </button>
          <input
            aria-label="Project name"
            maxLength={100}
            value={project.name}
            onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))}
          />
          <span className="local-badge">{activeProjectId ? 'SAVED PROJECT' : 'LOCAL DRAFT'}</span>
        </div>
        <div className="top-actions">
          <button
            className="primary compact print-action"
            disabled={!loaded}
            onClick={() => setModal('registered')}
          >
            <Download size={16} />
            <span className="print-action-long">Create print PDF</span>
            <span className="print-action-short">PDF</span>
          </button>
          <button
            className="icon-button top-help-action"
            title="How registered PDF printing works"
            aria-label="How registered PDF printing works"
            onClick={() => setModal('guide')}
          >
            <CircleHelp size={18} />
          </button>
          <span className="top-action-divider" />
          <button
            className="icon-button"
            title="New project"
            aria-label="New project"
            disabled={!loaded}
            onClick={() => setModal('new')}
          >
            <FilePlus2 size={18} />
          </button>
          <button
            className="secondary compact"
            disabled={!loaded}
            onClick={() =>
              window.criprox?.projects ? setModal('projects') : projectInput.current?.click()
            }
          >
            <FolderOpen size={16} /> {window.criprox?.projects ? 'Projects' : 'Open'}
          </button>
          <button
            className="secondary compact"
            disabled={!loaded || libraryBusy}
            onClick={() => void saveCurrentProject()}
          >
            {libraryBusy ? <LoaderCircle className="spin" size={16} /> : <Save size={16} />}
            {activeProjectId ? 'Save' : 'Save project'}
          </button>
        </div>
      </header>
      {releaseUpdate && (
        <aside className="release-notice" role="status" aria-live="polite">
          <span className="release-notice-icon">
            <Download size={19} />
          </span>
          <div>
            <strong>CriProx {releaseUpdate.latestVersion} is available</strong>
            <span>You’re using {releaseUpdate.currentVersion}. Download the latest installer.</span>
          </div>
          <button
            className="primary compact"
            onClick={() => {
              void window.criprox?.releases
                ?.open(releaseUpdate.releaseUrl)
                .catch(() => setToast('Could not open the GitHub release.'));
            }}
          >
            View release <ExternalLink size={13} />
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss release notice"
            onClick={dismissRelease}
          >
            <X size={16} />
          </button>
        </aside>
      )}
      <div className="app-body">
        <main>
          <div className="studio-grid">
            <section className="library panel">
              <div className="panel-heading">
                <h2>
                  Your cards <span className="count-badge">{count}</span>
                </h2>
                <div className="library-heading-actions">
                  <button
                    className="text-button clear-deck"
                    disabled={!loaded || !count}
                    onClick={() => setModal('clear')}
                  >
                    <Trash2 size={13} /> Clear
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Find a card"
                    disabled={!loaded || count >= 500}
                    onClick={() => setModal('search')}
                  >
                    <Plus size={19} />
                  </button>
                </div>
              </div>
              <div className="library-controls">
                <button
                  className="primary find-card-button"
                  disabled={!loaded || count >= 500}
                  onClick={() => setModal('search')}
                >
                  <Search size={16} /> Find a card
                </button>
                <button
                  className="secondary import-button"
                  disabled={!loaded}
                  onClick={() => setModal('import')}
                >
                  <Upload size={16} /> Import deck
                </button>
                <button
                  className="secondary artwork-button"
                  disabled={uploading || !loaded}
                  onClick={() => imageInput.current?.click()}
                >
                  {uploading ? (
                    <LoaderCircle className="spin" size={16} />
                  ) : (
                    <ImagePlus size={16} />
                  )}{' '}
                  Add artwork
                </button>
                <div className="search-field">
                  <Search size={15} />
                  <input
                    aria-label="Search your cards"
                    placeholder="Find a card in your deck…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              </div>
              <div className="list-caption">
                <span>CARD / PRINTING</span>
                <span>QTY</span>
              </div>
              <div className="card-list">
                {filtered.map((entry) => (
                  <div
                    key={entry.id}
                    className={`library-card ${selected?.entryId === entry.id ? 'selected' : ''}`}
                  >
                    <button
                      className="card-select"
                      onClick={() => inspect({ entryId: entry.id, copy: 0 })}
                      aria-label={`Inspect ${entry.card.name}`}
                    >
                      <img src={entry.card.faces[entry.face].preview} alt="" />
                      <div>
                        <strong>{entry.card.name}</strong>
                        <span>
                          {entry.card.set.toUpperCase()}
                          {entry.card.collector && ` · #${entry.card.collector}`}
                        </span>
                      </div>
                    </button>
                    <div className="card-bottom">
                      <button
                        className="printing-button"
                        onClick={() => inspect({ entryId: entry.id, copy: 0 })}
                      >
                        {entry.card.oracleId ? 'Change artwork' : 'Local artwork'}{' '}
                        <ChevronDown size={12} />
                      </button>
                      <div className="quantity">
                        <button
                          aria-label={`Decrease ${entry.card.name}`}
                          disabled={entry.quantity <= 1}
                          onClick={() => quantity(entry, -1)}
                        >
                          <Minus size={11} />
                        </button>
                        <span>{entry.quantity}</span>
                        <button
                          aria-label={`Increase ${entry.card.name}`}
                          disabled={entry.quantity >= 100}
                          onClick={() => quantity(entry, 1)}
                        >
                          <Plus size={11} />
                        </button>
                      </div>
                    </div>
                    <button
                      className="remove-card"
                      aria-label={`Remove ${entry.card.name}`}
                      onClick={() =>
                        setProject((p) => ({
                          ...p,
                          entries: p.entries.filter((e) => e.id !== entry.id),
                        }))
                      }
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {!filtered.length && (
                  <div className="empty-library">
                    <Layers3 size={28} />
                    <strong>{search ? 'No matching cards' : 'A fresh start'}</strong>
                    <p>
                      {search
                        ? 'Try another card name.'
                        : 'Paste your deck or upload card images to begin.'}
                    </p>
                    {!search && (
                      <button
                        className="text-button"
                        onClick={() => {
                          setProject(createSample());
                          setPage(0);
                        }}
                      >
                        Load example cards
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="library-footer">
                <ShieldCheck size={15} />
                <span>Your project stays on this device.</span>
              </div>
            </section>
            <section className="preview-panel panel">
              <div className="preview-toolbar">
                <div className="segmented" aria-label="Preview mode">
                  <button
                    className={mode === 'art' ? 'selected' : ''}
                    onClick={() => setMode('art')}
                  >
                    <Layers3 size={14} /> Artwork
                  </button>
                  <button
                    className={mode === 'cuts' ? 'selected' : ''}
                    onClick={() => setMode('cuts')}
                  >
                    <Scissors size={14} /> Cut paths
                  </button>
                </div>
                <div className="zoom-control">
                  <button
                    aria-label="Zoom out"
                    disabled={zoom <= 70}
                    onClick={() => setZoom((z) => Math.max(70, z - 10))}
                  >
                    <ZoomOut size={15} />
                  </button>
                  <span>{zoom}%</span>
                  <button
                    aria-label="Zoom in"
                    disabled={zoom >= 400}
                    onClick={() => setZoom((z) => Math.min(400, z + 10))}
                  >
                    <ZoomIn size={15} />
                  </button>
                </div>
              </div>
              <div className="preview-canvas">
                <div className="sheet-label">
                  <span className="status-dot" />{' '}
                  {count
                    ? `${sheet.placements.length} cards on this sheet`
                    : 'Your canvas is ready'}
                  <span className="view-label">PREVIEW ONLY</span>
                </div>
                <SheetPreview
                  sheet={sheet}
                  settings={project.settings}
                  mode={mode}
                  zoom={zoom}
                  select={setSelected}
                  inspect={inspect}
                />
                <div className="page-nav">
                  <button
                    className="icon-button"
                    aria-label="Previous sheet"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <span>
                    Sheet <strong>{count ? currentPage + 1 : 0}</strong> of {sheets.length}
                  </span>
                  <button
                    className="icon-button"
                    aria-label="Next sheet"
                    disabled={currentPage >= sheets.length - 1}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
              <div className="preview-footer">
                <span>
                  <span className="legend-line" /> Planning area
                </span>
                <span>
                  <Ruler size={14} />{' '}
                  {formatDimensions(
                    project.settings.width,
                    project.settings.height,
                    project.settings.units,
                  )}{' '}
                  cards
                </span>
                <span>{project.settings.dpi} DPI print</span>
              </div>
            </section>
            <aside className="settings-panel panel">
              <div className="panel-heading">
                <h2>
                  <SlidersHorizontal size={17} /> Sheet setup
                </h2>
                <button
                  className="icon-button"
                  aria-label="Reset sheet settings"
                  title="Reset sheet settings"
                  onClick={() => settings({ ...DEFAULT_SETTINGS, units: project.settings.units })}
                >
                  <RotateCcw size={15} />
                </button>
              </div>
              <div className="settings-content">
                <div className="setting-group">
                  <label htmlFor="machine">Cutting machine</label>
                  <div className="select-wrap">
                    <Scissors size={15} />
                    <select
                      id="machine"
                      value={project.settings.machine}
                      onChange={(e) => {
                        const machine = e.target.value as Settings['machine'];
                        settings({
                          machine,
                          ...(project.settings.profile === 'seven' && machine === 'joy-xtra'
                            ? {
                                profile: 'expanded' as const,
                                gap: 1,
                                bleed:
                                  project.settings.bleed > 0
                                    ? fixedBleedMm({ profile: 'expanded' })
                                    : 0,
                              }
                            : {}),
                        });
                      }}
                    >
                      <option value="maker">Cricut Maker series</option>
                      <option value="explore">Cricut Explore series</option>
                      <option value="joy-xtra">Cricut Joy Xtra</option>
                    </select>
                  </div>
                </div>
                <div className="setting-group">
                  <label>Paper size</label>
                  <div className="paper-options">
                    <button
                      className={project.settings.paper === 'letter' ? 'chosen' : ''}
                      onClick={() => settings({ paper: 'letter' })}
                    >
                      <span className="paper-mini" />
                      <strong>US Letter</strong>
                      <small>{formatDimensions(215.9, 279.4, project.settings.units)}</small>
                      {project.settings.paper === 'letter' && <CheckCircle2 size={13} />}
                    </button>
                    <button
                      className={project.settings.paper === 'a4' ? 'chosen' : ''}
                      onClick={() =>
                        settings({
                          paper: 'a4',
                          ...(project.settings.profile === 'seven'
                            ? {
                                profile: 'expanded' as const,
                                gap: 1,
                                bleed:
                                  project.settings.bleed > 0
                                    ? fixedBleedMm({ profile: 'expanded' })
                                    : 0,
                              }
                            : {}),
                        })
                      }
                    >
                      <span className="paper-mini a4" />
                      <strong>A4</strong>
                      <small>{formatDimensions(210, 297, project.settings.units)}</small>
                      {project.settings.paper === 'a4' && <CheckCircle2 size={13} />}
                    </button>
                  </div>
                </div>
                <div className="setting-group unit-setting">
                  <label>Display units</label>
                  <UnitToggle
                    value={project.settings.units}
                    change={(units) => settings({ units })}
                  />
                  <p className="field-note">Changes labels only. Cut geometry stays exact.</p>
                </div>
                <div className="settings-divider" />
                <div className="section-label">
                  <Grid2X2 size={14} /> LAYOUT & DIMENSIONS
                </div>
                <div className="setting-group">
                  <label htmlFor="profile">
                    Sheet area <span className="mini-badge">{g.capacity} UP</span>
                  </label>
                  <select
                    id="profile"
                    value={project.settings.profile}
                    onChange={(e) => {
                      const profile = e.target.value as Settings['profile'];
                      settings(
                        profile === 'seven'
                          ? {
                              profile,
                              paper: 'letter',
                              width: 63,
                              height: 88,
                              gap: 0.1,
                              radius: STANDARD_CARD_RADIUS_MM,
                              bleed: project.settings.bleed > 0 ? fixedBleedMm({ profile }) : 0,
                            }
                          : {
                              profile,
                              ...(project.settings.profile === 'seven'
                                ? {
                                    gap: 1,
                                    bleed:
                                      project.settings.bleed > 0
                                        ? fixedBleedMm({ profile: 'expanded' })
                                        : 0,
                                  }
                                : {}),
                            },
                      );
                      setPage(0);
                    }}
                  >
                    <option value="expanded">6 slots · default</option>
                    <option value="seven" disabled={project.settings.machine === 'joy-xtra'}>
                      7 slots · experimental Letter hack
                    </option>
                  </select>
                  <p className="field-note">
                    {project.settings.profile === 'seven'
                      ? `${formatDimensions(189.2, 214.2, project.settings.units)} 2–3–2 layout. Choose Tabloid in Design Space, then US Letter at 100% in the system print dialog.`
                      : `${formatDimensions(180, 220, project.settings.units)} candidate area.${paperWorkflow(project.settings).usesLetterHack ? ' Choose Tabloid in Design Space, then US Letter at 100% in the system print dialog.' : ' Verify in Design Space before printing.'}`}
                  </p>
                </div>
                <div className="settings-divider" />
                <div className="section-label">
                  <Settings2 size={14} /> PRINT DETAILS
                </div>
                <div className="setting-group">
                  <label htmlFor="resolution">Resolution</label>
                  <select
                    id="resolution"
                    value={project.settings.dpi}
                    onChange={(e) => settings({ dpi: Number(e.target.value) as PrintDpi })}
                  >
                    {PRINT_DPI_OPTIONS.map((dpi) => (
                      <option key={dpi} value={dpi}>
                        {dpi} DPI ·{' '}
                        {dpi === 300
                          ? 'standard'
                          : dpi === 600
                            ? 'high quality'
                            : dpi === 900
                              ? 'extra high'
                              : 'maximum detail'}
                      </option>
                    ))}
                  </select>
                  <p className="field-note">
                    Higher settings preserve more detail from high-resolution artwork. 900 and 1200
                    DPI take longer and create much larger print files.
                  </p>
                </div>
                <FrontBleedControl settings={project.settings} change={settings} />
                <label className="switch-row">
                  <span>
                    Print card backs
                    <small>Optional · manual refeed by default</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={project.settings.backsEnabled}
                    onChange={(e) => settings({ backsEnabled: e.target.checked })}
                  />
                  <span className="switch" />
                </label>
                {doubleSidedCount > 0 && (
                  <div className="warning-box double-sided-warning" role="status">
                    {doubleSidedCount} double-sided card{doubleSidedCount === 1 ? '' : 's'}{' '}
                    selected.{' '}
                    {project.settings.backsEnabled
                      ? 'Each matching reverse face will print in its mirrored back position; shared artwork remains for single-sided cards.'
                      : 'Enable Print card backs to include the matching reverse faces.'}
                  </div>
                )}
                {project.settings.backsEnabled && (
                  <button
                    className="text-button back-configure"
                    onClick={() => setModal('registered')}
                  >
                    {sharedBackRequired && !project.backArtwork
                      ? 'Add shared card-back artwork'
                      : 'Configure back printing'}{' '}
                    <ArrowRight size={12} />
                  </button>
                )}
                <label className="switch-row">
                  <span>
                    Playtest label<small>A small label along the bottom edge</small>
                  </span>
                  <input
                    type="checkbox"
                    checked={project.settings.proxyLabel}
                    onChange={(e) => settings({ proxyLabel: e.target.checked })}
                  />
                  <span className="switch" />
                </label>
                {activeEntry && selected && (
                  <div className="selection-details">
                    <div className="section-label">SELECTED CARD</div>
                    <strong>{activeEntry.card.name}</strong>
                    <p>{activeEntry.card.setName}</p>
                    {activeEntry.card.faces.length > 1 && (
                      <>
                        <label>
                          Card face
                          <select
                            aria-label="Card face"
                            value={activeEntry.face}
                            onChange={(e) => editCopy(selected, { face: Number(e.target.value) })}
                          >
                            {activeEntry.card.faces.map((face, i) => (
                              <option key={i} value={i}>
                                {face.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="warning-box double-sided-warning" role="status">
                          Double-sided card.{' '}
                          {project.settings.backsEnabled
                            ? `${activeEntry.card.faces[activeEntry.face === 0 ? 1 : 0].name} is set as its reverse.`
                            : 'Turn on Print card backs to print its reverse face.'}
                        </div>
                      </>
                    )}
                    <button
                      className="text-button"
                      disabled={count >= 500}
                      onClick={() =>
                        add([{ ...activeEntry, id: crypto.randomUUID(), quantity: 1 }])
                      }
                    >
                      <Copy size={13} /> Duplicate as separate entry
                    </button>
                  </div>
                )}
              </div>
            </aside>
          </div>
          <div className="bottom-status">
            <span>
              <Check size={14} />
              {saved}
            </span>
            <span>
              {count} cards <i /> {sheets.length} sheets <i /> {g.capacity} cards per full sheet
            </span>
            <span>
              CriProx v{__APP_VERSION__} · Made for playtesting{' '}
              <span className="little-spark">✧</span>
            </span>
          </div>
          {sheet && (
            <div className="dimension-note">
              Current artwork area:{' '}
              <strong>{formatDimensions(sheet.width, sheet.height, project.settings.units)}</strong>
              <span>Display units do not change the printed size.</span>
            </div>
          )}
        </main>
      </div>
      <input
        hidden
        ref={imageInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        onChange={(e) => uploadImages(e.target.files)}
      />
      <input
        hidden
        ref={projectInput}
        type="file"
        accept=".json"
        onChange={(e) => openProject(e.target.files?.[0])}
      />
      {toast && (
        <div role="status" className="toast">
          <CheckCircle2 size={18} />
          <span>{toast}</span>
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal === 'projects' && window.criprox?.projects && (
        <ProjectsModal
          snapshot={projectLibrary}
          activeProjectId={activeProjectId}
          busy={libraryBusy}
          close={() => setModal(null)}
          refresh={() => void refreshProjectLibrary()}
          changeDirectory={() => void changeProjectsDirectory()}
          reveal={() => void revealProjectsDirectory()}
          open={(projectId) => void openManagedProject(projectId)}
          remove={(item) => void deleteManagedProject(item)}
          saveCurrent={() => void saveCurrentProject()}
          importBackup={() => {
            setModal(null);
            projectInput.current?.click();
          }}
          exportBackup={() => void exportProjectBackup()}
          newProject={() => setModal('new')}
        />
      )}
      {modal === 'registered' && (
        <RegisteredPrint
          project={project}
          close={() => setModal(null)}
          openGuide={() => setModal('guide')}
          notify={setToast}
          updateSettings={settings}
          updateBackArtwork={uploadBackArtwork}
          selectBackArtwork={chooseBackArtwork}
        />
      )}
      {modal === 'import' && (
        <ImportModal close={() => setModal(null)} add={add} remaining={500 - count} />
      )}
      {modal === 'search' && (
        <CardSearchModal close={() => setModal(null)} add={addCard} remaining={500 - count} />
      )}
      {modal === 'guide' && <Guide close={() => setModal(null)} />}
      {ENABLE_DESIGN_SPACE_EXPORT && modal === 'export' && count > 0 && (
        <ExportModal
          project={project}
          sheets={sheets}
          current={currentPage}
          close={() => setModal(null)}
          notify={setToast}
        />
      )}
      {modal === 'new' && (
        <Modal
          title="Start a fresh project?"
          subtitle="Save the current project first if you want to keep this deck."
          close={() => setModal(null)}
        >
          <div className="modal-footer">
            <button className="secondary" onClick={() => setModal(null)}>
              <ArrowLeft size={16} /> Keep editing
            </button>
            <button
              className="primary"
              onClick={() => {
                setProject({ ...EMPTY_PROJECT, settings: { ...DEFAULT_SETTINGS } });
                rememberActiveProject(null);
                setSelected(null);
                setInspecting(null);
                setPage(0);
                setSearch('');
                setModal(null);
              }}
            >
              <FilePlus2 size={16} /> Start fresh
            </button>
          </div>
        </Modal>
      )}
      {modal === 'clear' && (
        <Modal
          title="Clear the deck list?"
          subtitle={`Remove all ${count} card${count === 1 ? '' : 's'} from this project.`}
          close={() => setModal(null)}
        >
          <div className="confirm-copy">
            Your sheet dimensions, print settings, captured Cricut template, and card-back setup
            will stay in place.
          </div>
          <div className="modal-footer">
            <button className="secondary" onClick={() => setModal(null)}>
              Keep cards
            </button>
            <button
              className="danger-button"
              onClick={() => {
                setProject((current) => ({ ...current, entries: [] }));
                setSelected(null);
                setInspecting(null);
                setPage(0);
                setSearch('');
                setModal(null);
                setToast('Deck list cleared.');
              }}
            >
              <Trash2 size={16} /> Clear deck
            </button>
          </div>
        </Modal>
      )}
      {inspectedEntry && inspecting && (
        <ArtworkInspector
          entry={inspectedEntry}
          copy={inspecting.copy}
          customArt={customArt}
          proxyLabel={project.settings.proxyLabel}
          backsEnabled={project.settings.backsEnabled}
          close={() => setInspecting(null)}
          choosePrinting={(card) => {
            editCopy(inspecting, { card, face: 0 });
            setToast('Scryfall printing applied to one copy.');
          }}
          chooseCustomArt={(card) => {
            applyArtwork(inspecting, inspectedEntry, card);
            setToast('Custom artwork applied to one copy.');
          }}
          uploadCustomArt={async (file) => {
            applyArtwork(
              inspecting,
              inspectedEntry,
              await cardFromArtwork(file, inspectedEntry.card),
            );
            setToast('Custom artwork applied to one copy.');
          }}
          chooseMpcArt={(card) => {
            applyArtwork(inspecting, inspectedEntry, card);
            setToast('MPC Autofill artwork applied to one copy.');
          }}
          changeFace={(face) => editCopy(inspecting, { face })}
        />
      )}
    </div>
  );
}
