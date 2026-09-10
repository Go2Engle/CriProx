import RegisteredPrint from './components/RegisteredPrint';
import FrontBleedControl from './components/FrontBleedControl';
import MpcArtworkSearch from './components/MpcArtworkSearch';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  CircleHelp,
  Copy,
  Download,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  Grid2X2,
  ImagePlus,
  Layers3,
  LoaderCircle,
  Minus,
  Maximize2,
  Plus,
  Printer,
  RotateCcw,
  Ruler,
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
import { DEFAULT_SETTINGS, EMPTY_PROJECT, PRINT_DPI_OPTIONS } from './lib/types';
import { envelope, grid, layout, type Sheet } from './lib/layout';
import { parseDeck } from './lib/deck';
import { resolveDeck, variants } from './lib/scryfall';
import { download, exportBundle } from './lib/export';
import { validateProject } from './lib/project';
import sampleCards from './sample.json';
import { formatDimensions, formatMeasurement } from './lib/units';
import { mpcArtworkAsCard } from './lib/mpc';

// The original Design Space ZIP export remains available for a future workflow,
// but Print from CriProx is the only export action shown in the interface.
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
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? 'modal wide' : 'modal'}
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
function ImportModal({
  add,
  remaining,
  close,
}: {
  add: (entries: Entry[]) => void;
  remaining: number;
  close: () => void;
}) {
  const [text, setText] = useState(''),
    [busy, setBusy] = useState(''),
    [error, setError] = useState('');
  const parsed = parseDeck(text);
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
    if (parsed.cards.reduce((n, c) => n + c.quantity, 0) > remaining) {
      setError(`There is room for ${remaining} more cards in this project.`);
      return;
    }
    setBusy('Finding your cards…');
    try {
      const result = await resolveDeck(parsed.cards, setBusy);
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
        const foundLines = new Set(result.found.map((f) => f.line.line));
        setText(
          text
            .split(/\r?\n/)
            .filter((_, i) => !foundLines.has(i + 1))
            .join('\n'),
        );
        setError(
          `${result.found.length} entries added. Could not find:\n${result.missing.join('\n')}\nCheck spelling or the set and collector number, then retry.`,
        );
      } else close();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <Modal
      title="Bring your deck"
      subtitle="Paste a list. We’ll find the cards and arrange your sheets."
      close={() => {
        if (!busy) close();
      }}
    >
      <div className="import-content">
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
          onChange={(e) => setText(e.target.value)}
          placeholder={'1 Sol Ring\n4 Lightning Bolt\n1 Counterspell (MH2) 267'}
        />
        <div className="import-hint">
          <span>Quantity + card name · optional (SET) number</span>
          <span>{parsed.cards.reduce((n, c) => n + c.quantity, 0)} cards</span>
        </div>
        <div className="soft-info">
          <Sparkles size={17} />
          <span>
            Card data comes from Scryfall. Choose a different printing after import. All listed
            sections are included.
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
        <button className="primary" disabled={!!busy || !text.trim()} onClick={importCards}>
          {busy ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}{' '}
          {busy || 'Add to project'}
        </button>
      </div>
    </Modal>
  );
}
function VariantsModal({
  entry,
  choose,
  close,
}: {
  entry: Entry;
  choose: (card: Card) => void;
  close: () => void;
}) {
  const [cards, setCards] = useState<Card[]>([]),
    [next, setNext] = useState<string>(),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [filter, setFilter] = useState('');
  useEffect(() => {
    let active = true;
    variants(entry.card)
      .then((r) => {
        if (active) {
          setCards(r.cards);
          setNext(r.next);
        }
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [entry.card]);
  async function more() {
    setBusy(true);
    setError('');
    try {
      const result = await variants(entry.card, next);
      setCards((c) => [...c, ...result.cards]);
      setNext(result.next);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  const shown = cards.filter((c) =>
    `${c.setName} ${c.set} ${c.collector}`.toLowerCase().includes(filter.toLowerCase()),
  );
  return (
    <Modal wide title={`Choose a printing`} subtitle={entry.card.name} close={close}>
      <div className="variant-content">
        <div className="search-field">
          <Search size={17} />
          <input
            aria-label="Filter loaded printings"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter loaded printings by set or number…"
          />
        </div>
        {error && (
          <div role="alert" className="error-box">
            {error}
            <button className="text-button" onClick={more}>
              Retry
            </button>
          </div>
        )}
        <div className="variant-grid">
          {shown.map((card) => (
            <button
              key={card.id}
              className={`variant-card ${entry.card.id === card.id ? 'chosen' : ''}`}
              onClick={() => {
                choose(card);
                close();
              }}
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
        {!busy && !shown.length && !error && (
          <p className="empty-message">No loaded printings match this filter.</p>
        )}
        {busy && (
          <div className="loading">
            <LoaderCircle className="spin" size={20} /> Finding printings…
          </div>
        )}
        {next && !busy && (
          <button className="secondary load-more" onClick={more}>
            Load more printings
          </button>
        )}
      </div>
      <div className="modal-footer">
        <span className="muted">{cards.length} printings loaded · Scryfall</span>
        <button className="secondary" onClick={close}>
          Done
        </button>
      </div>
    </Modal>
  );
}
function Guide({ close }: { close: () => void }) {
  return (
    <Modal
      title="Print from CriProx"
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
              CriProx prints your cards into a verified template captured from Design Space. The
              saved Cricut project supplies the matching cut paths.
            </p>
          </div>
        </div>
        {[
          [
            'Create the reusable template',
            'Open Print from CriProx and download its one-time setup image. Upload it into Design Space as a flat Print Then Cut image and set the exact dimensions shown.',
          ],
          [
            'Capture Cricut’s print',
            'Print that setup project from Design Space to a PDF at actual size. Import the PDF back into Print from CriProx so the app can verify and save its registration marks.',
          ],
          [
            'Print your card sheets',
            'Print from CriProx at 100% with no fit or shrink scaling. Artwork bleed and optional card backs are added here without changing the captured cut geometry.',
          ],
          [
            'Run the saved Cricut cut',
            'Return to the same saved Design Space project, choose Already Printed or skip printing when available, and cut the CriProx sheet. Measure a test card before printing a full deck.',
          ],
        ].map(([title, description], i) => (
          <div className="guide-step" key={title}>
            <span>{i + 1}</span>
            <div>
              <h3>{title}</h3>
              <p>{description}</p>
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
            Expanded layout is experimental. Confirm it fits your machine and paper in Design Space
            without resizing.
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
  customArt,
  proxyLabel,
  close,
  choosePrinting,
  chooseCustomArt,
  uploadCustomArt,
  chooseMpcArt,
  changeFace,
}: {
  entry: Entry;
  customArt: Card[];
  proxyLabel: boolean;
  close: () => void;
  choosePrinting: () => void;
  chooseCustomArt: (card: Card) => void;
  uploadCustomArt: (file: File) => Promise<void>;
  chooseMpcArt: (card: Card) => void;
  changeFace: (face: number) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
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
          <p>Change this card’s artwork without changing its quantity or position on the sheet.</p>
          {entry.card.faces.length > 1 && (
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
          )}
          <div className="inspector-actions">
            {entry.card.oracleId && (
              <button className="secondary" onClick={choosePrinting}>
                <Layers3 size={16} /> Choose another printing
              </button>
            )}
            <button className="primary" disabled={busy} onClick={() => input.current?.click()}>
              {busy ? <LoaderCircle className="spin" size={16} /> : <ImagePlus size={16} />}
              {busy ? 'Reading artwork…' : 'Upload custom art'}
            </button>
          </div>
          <MpcArtworkSearch
            type="CARD"
            initialQuery={entry.card.name}
            choose={(artwork) => chooseMpcArt(mpcArtworkAsCard(artwork, entry.card.name))}
          />
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          {customArt.length > 0 && (
            <div className="project-artwork">
              <div>
                <strong>Artwork already in this project</strong>
                <span>Select an image to use for this card.</span>
              </div>
              <div className="project-art-grid">
                {customArt.map((card) => (
                  <button key={card.id} onClick={() => chooseCustomArt(card)}>
                    <img src={card.faces[0].preview} alt={card.name} />
                    <span>{card.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
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
        <span className="muted">Changes apply to every copy of this card entry.</span>
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
  select: (id: string) => void;
  inspect: (id: string) => void;
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
                onClick={() => (mode === 'cuts' ? select(p.entry.id) : inspect(p.entry.id))}
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
      'import' | 'guide' | 'export' | 'new' | 'clear' | 'registered' | null
    >(null),
    [variantEntry, setVariantEntry] = useState<Entry | null>(null);
  const [selected, setSelected] = useState<string | null>(null),
    [inspecting, setInspecting] = useState<string | null>(null),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(0),
    [mode, setMode] = useState('art'),
    [zoom, setZoom] = useState(100),
    [toast, setToast] = useState(''),
    [uploading, setUploading] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null),
    projectInput = useRef<HTMLInputElement>(null);
  const saveQueue = useRef(Promise.resolve());
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
    g = grid(project.settings);
  const activeEntry = project.entries.find((e) => e.id === selected);
  const inspectedEntry = project.entries.find((e) => e.id === inspecting);
  const customArt = project.entries
    .filter((entry) => entry.id !== inspecting && ['local', 'custom'].includes(entry.card.set))
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
  function inspect(id: string) {
    setSelected(id);
    setInspecting(id);
  }
  function applyArtwork(entry: Entry, artwork: Card) {
    const face = artwork.faces[0];
    editEntry(entry.id, {
      face: 0,
      card: {
        ...entry.card,
        id: artwork.id,
        set: artwork.set,
        setName: artwork.setName,
        collector: artwork.collector,
        faces: [
          {
            name: entry.card.name,
            image: face.image,
            preview: face.preview,
          },
        ],
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
  async function openProject(file?: File) {
    if (!file) return;
    try {
      if (file.size > 100000000) throw new Error('Project files must be under 100 MB.');
      const next = validateProject(JSON.parse(await file.text()));
      setProject(next);
      setPage(0);
      setSelected(null);
      setToast('Project opened.');
    } catch (e) {
      setToast(errorText(e));
    } finally {
      if (projectInput.current) projectInput.current.value = '';
    }
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
          <span className="breadcrumb">
            Workspace <ChevronRight size={12} />
          </span>
          <input
            aria-label="Project name"
            maxLength={100}
            value={project.name}
            onChange={(e) => setProject((p) => ({ ...p, name: e.target.value }))}
          />
          <span className="local-badge">LOCAL</span>
        </div>
        <div className="top-actions">
          <button
            className="primary compact print-action"
            disabled={!loaded}
            onClick={() => setModal('registered')}
          >
            <Printer size={16} />
            <span className="print-action-long">Print from CriProx</span>
            <span className="print-action-short">Print</span>
          </button>
          <button
            className="icon-button top-help-action"
            title="How Print from CriProx works"
            aria-label="How Print from CriProx works"
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
            onClick={() => projectInput.current?.click()}
          >
            <FolderOpen size={16} /> Open
          </button>
          <button
            className="secondary compact"
            disabled={!loaded}
            onClick={() => {
              download(
                new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }),
                `${project.name.replace(/[^a-z0-9_-]+/gi, '-') || 'project'}.criprox.json`,
              );
              setToast('Project backup saved.');
            }}
          >
            <ArrowDownToLine size={16} /> Save project
          </button>
        </div>
      </header>
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
                    aria-label="Paste card list"
                    disabled={!loaded}
                    onClick={() => setModal('import')}
                  >
                    <Plus size={19} />
                  </button>
                </div>
              </div>
              <div className="library-controls">
                <button
                  className="primary import-button"
                  disabled={!loaded}
                  onClick={() => setModal('import')}
                >
                  <Upload size={16} /> Paste card list
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
                    className={`library-card ${selected === entry.id ? 'selected' : ''}`}
                  >
                    <button
                      className="card-select"
                      onClick={() => inspect(entry.id)}
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
                        onClick={() =>
                          entry.card.oracleId ? setVariantEntry(entry) : setSelected(entry.id)
                        }
                      >
                        {entry.card.oracleId ? 'Change printing' : 'Local artwork'}{' '}
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
                      onChange={(e) => settings({ machine: e.target.value as Settings['machine'] })}
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
                      onClick={() => settings({ paper: 'a4' })}
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
                      settings({ profile: e.target.value as Settings['profile'] });
                      setPage(0);
                    }}
                  >
                    <option value="expanded">6 slots · default</option>
                    <option value="conservative">4 slots · conservative area</option>
                  </select>
                  <p className="field-note">
                    {project.settings.profile === 'conservative'
                      ? `A conservative ${formatDimensions(171.45, 234.95, project.settings.units)} planning area.`
                      : `${formatDimensions(180, 220, project.settings.units)} candidate area. Verify in Design Space before printing.`}
                  </p>
                </div>
                <div className="setting-group slider-group">
                  <label htmlFor="gap">
                    Card spacing{' '}
                    <strong>
                      {formatMeasurement(project.settings.gap, project.settings.units)}
                    </strong>
                  </label>
                  <input
                    id="gap"
                    type="range"
                    min="1"
                    max="10"
                    step="0.5"
                    value={project.settings.gap}
                    onChange={(e) => {
                      const gap = Number(e.target.value);
                      settings({ gap, bleed: Math.min(project.settings.bleed, gap / 2) });
                    }}
                  />
                  <div className="range-labels">
                    <span>{formatMeasurement(1, project.settings.units)}</span>
                    <span>{formatMeasurement(10, project.settings.units)}</span>
                  </div>
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
                {project.settings.backsEnabled && (
                  <button
                    className="text-button back-configure"
                    onClick={() => setModal('registered')}
                  >
                    {project.backArtwork ? 'Configure back printing' : 'Add card-back artwork'}{' '}
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
                {activeEntry && (
                  <div className="selection-details">
                    <div className="section-label">SELECTED CARD</div>
                    <strong>{activeEntry.card.name}</strong>
                    <p>{activeEntry.card.setName}</p>
                    {activeEntry.card.faces.length > 1 && (
                      <label>
                        Card face
                        <select
                          aria-label="Card face"
                          value={activeEntry.face}
                          onChange={(e) =>
                            editEntry(activeEntry.id, { face: Number(e.target.value) })
                          }
                        >
                          {activeEntry.card.faces.map((face, i) => (
                            <option key={i} value={i}>
                              {face.name}
                            </option>
                          ))}
                        </select>
                      </label>
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
              <div className="setup-note">
                <ShieldCheck size={18} />
                <div>
                  <strong>Registration, captured from Cricut.</strong>
                  <p>Reuse your verified template when printing from CriProx.</p>
                  <button className="text-button" onClick={() => setModal('guide')}>
                    See the workflow <ArrowRight size={12} />
                  </button>
                </div>
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
              Made for playtesting <span className="little-spark">✧</span>
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
      {modal === 'registered' && (
        <RegisteredPrint
          project={project}
          close={() => setModal(null)}
          notify={setToast}
          updateSettings={settings}
          updateBackArtwork={uploadBackArtwork}
          selectBackArtwork={chooseBackArtwork}
        />
      )}
      {modal === 'import' && (
        <ImportModal close={() => setModal(null)} add={add} remaining={500 - count} />
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
          subtitle="Save a project backup first if you want to keep this deck."
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
                setVariantEntry(null);
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
      {inspectedEntry && (
        <ArtworkInspector
          entry={inspectedEntry}
          customArt={customArt}
          proxyLabel={project.settings.proxyLabel}
          close={() => setInspecting(null)}
          choosePrinting={() => setVariantEntry(inspectedEntry)}
          chooseCustomArt={(card) => {
            applyArtwork(inspectedEntry, card);
            setToast('Custom artwork applied.');
          }}
          uploadCustomArt={async (file) => {
            applyArtwork(inspectedEntry, await cardFromArtwork(file, inspectedEntry.card));
            setToast('Custom artwork applied.');
          }}
          chooseMpcArt={(card) => {
            applyArtwork(inspectedEntry, card);
            setToast('MPC Autofill artwork applied.');
          }}
          changeFace={(face) => editEntry(inspectedEntry.id, { face })}
        />
      )}
      {variantEntry && (
        <VariantsModal
          entry={variantEntry}
          choose={(card) => editEntry(variantEntry.id, { card, face: 0 })}
          close={() => setVariantEntry(null)}
        />
      )}
    </div>
  );
}
