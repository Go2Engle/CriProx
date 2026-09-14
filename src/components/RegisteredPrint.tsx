import { useEffect, useRef, useState } from 'react';
import { get, set } from 'idb-keyval';
import {
  CheckCircle2,
  Download,
  FileUp,
  ImagePlus,
  LoaderCircle,
  Printer,
  Ruler,
  X,
} from 'lucide-react';
import { fixedBleedMm, type CardFace, type Project, type Settings } from '../lib/types';
import { formatDimensions, formatMeasurement } from '../lib/units';
import {
  BACK_ALIGNMENT_SQUARE_MM,
  backAlignmentCorrection,
  fullTemplate,
  registrationKey,
  templateId,
  type RegistrationProfile,
} from '../lib/registration';
import { captureProfile, downloadSetup, printRegisteredPdf } from '../lib/registered-pdf';
import { preparePdfJob } from '../lib/pdf-worker';
import { download } from '../lib/export';
import MpcArtworkSearch from './MpcArtworkSearch';
import FrontBleedControl from './FrontBleedControl';
import PdfPagePreview from './PdfPagePreview';
import { paperWorkflow } from '../lib/paper-workflow';
export default function RegisteredPrint({
  project,
  close,
  notify,
  updateSettings,
  updateBackArtwork,
  selectBackArtwork,
}: {
  project: Project;
  close: () => void;
  notify: (text: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  updateBackArtwork: (file?: File) => Promise<void>;
  selectBackArtwork: (face: CardFace) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    input = useRef<HTMLInputElement>(null),
    backInput = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<RegistrationProfile>(),
    [busy, setBusy] = useState('Loading template…'),
    [error, setError] = useState('');
  const [pdf, setPdf] = useState<Uint8Array>(),
    [backPdf, setBackPdf] = useState<Uint8Array>(),
    [preparedMode, setPreparedMode] = useState<'front' | 'manual' | 'duplex'>('front'),
    [preparedKind, setPreparedKind] = useState<'cards' | 'size' | 'alignment'>('cards');
  const [horizontalSquares, setHorizontalSquares] = useState(0),
    [horizontalDirection, setHorizontalDirection] = useState<'left' | 'right'>('right'),
    [verticalSquares, setVerticalSquares] = useState(0),
    [verticalDirection, setVerticalDirection] = useState<'up' | 'down'>('down');
  const key = registrationKey(project.settings),
    full = fullTemplate(project.settings),
    id = templateId(project.settings),
    printPaper = paperWorkflow(project.settings);
  useEffect(() => {
    dialog.current?.showModal();
    let active = true;
    get<RegistrationProfile>(`registration:${key}`)
      .then((p) => {
        if (active && p?.version === 1 && p.key === key && p.pdf instanceof Uint8Array)
          setProfile(p);
      })
      .catch(() => {
        if (active)
          setError('Could not load a saved template. Import the original Design Space PDF again.');
      })
      .finally(() => {
        if (active) setBusy('');
      });
    return () => {
      active = false;
    };
  }, [key]);
  async function setup() {
    setBusy('Creating setup image…');
    setError('');
    try {
      await downloadSetup(project.settings);
      notify('Setup PNG downloaded. Upload it once in Design Space.');
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy('');
    }
  }
  async function capture(file?: File) {
    if (!file) return;
    setBusy('Checking page size and cut slots…');
    setError('');
    setPdf(undefined);
    setBackPdf(undefined);
    try {
      if (file.size > 25_000_000) throw new Error('Use a template PDF under 25 MB.');
      const next = await captureProfile(
        new Uint8Array(await file.arrayBuffer()),
        project.settings,
        file.name,
      );
      await set(`registration:${key}`, next);
      setProfile(next);
      notify('Template captured. Run a test cut before printing a full deck.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read this PDF.');
    } finally {
      setBusy('');
      if (input.current) input.current.value = '';
    }
  }
  async function prepare(calibration: boolean) {
    if (!profile) return;
    setBusy('Building registered pages…');
    setError('');
    setPdf(undefined);
    setBackPdf(undefined);
    try {
      const result = await preparePdfJob(
        { kind: 'registered', project, profile, calibration },
        setBusy,
      );
      setPdf(result.pdf);
      setBackPdf(result.backPdf);
      setPreparedMode(result.mode);
      setPreparedKind(calibration ? 'size' : 'cards');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate registered pages.');
    } finally {
      setBusy('');
    }
  }
  async function prepareAlignment() {
    setBusy('Building front-to-back alignment pages…');
    setError('');
    setPdf(undefined);
    setBackPdf(undefined);
    try {
      const result = await preparePdfJob({ kind: 'alignment', project }, setBusy);
      setPdf(result.pdf);
      setBackPdf(result.backPdf);
      setPreparedMode(result.mode);
      setPreparedKind('alignment');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the alignment test.');
    } finally {
      setBusy('');
    }
  }
  function applyAlignment() {
    const correction = backAlignmentCorrection(
        horizontalSquares,
        horizontalDirection,
        verticalSquares,
        verticalDirection,
      ),
      backOffsetX = project.settings.backOffsetX + correction.x,
      backOffsetY = project.settings.backOffsetY + correction.y;
    if (Math.abs(backOffsetX) > 5 || Math.abs(backOffsetY) > 5) {
      setError('The measured correction exceeds the supported 5 mm alignment range.');
      return;
    }
    changePrintSettings({ backOffsetX, backOffsetY });
    setHorizontalSquares(0);
    setVerticalSquares(0);
    notify(
      `Back alignment updated to X ${backOffsetX >= 0 ? '+' : ''}${formatMeasurement(backOffsetX, project.settings.units)}, Y ${backOffsetY >= 0 ? '+' : ''}${formatMeasurement(backOffsetY, project.settings.units)}.`,
    );
  }
  function offsetDescription(value: number, horizontal: boolean) {
    if (Math.abs(value) < 0.001) return 'centered';
    return `${formatMeasurement(Math.abs(value), project.settings.units)} ${
      horizontal ? (value < 0 ? 'left' : 'right') : value < 0 ? 'up' : 'down'
    }`;
  }
  function changePrintSettings(patch: Partial<Settings>) {
    setPdf(undefined);
    setBackPdf(undefined);
    updateSettings(patch);
  }
  async function print(bytes?: Uint8Array) {
    if (!bytes) return;
    setBusy('Preparing print dialog…');
    setError('');
    try {
      await printRegisteredPdf(bytes, setBusy);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not open the print dialog. Download the PDF instead.',
      );
    } finally {
      setBusy('');
    }
  }
  async function uploadBack(file?: File) {
    if (!file) return;
    setBusy('Reading card-back artwork…');
    setError('');
    setPdf(undefined);
    setBackPdf(undefined);
    try {
      await updateBackArtwork(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read card-back artwork.');
    } finally {
      setBusy('');
      if (backInput.current) backInput.current.value = '';
    }
  }
  function chooseMpcBack(face: CardFace) {
    setPdf(undefined);
    setBackPdf(undefined);
    selectBackArtwork(face);
  }
  function savePdf(bytes: Uint8Array | undefined, suffix: string) {
    if (!bytes) return;
    download(new Blob([bytes.slice().buffer], { type: 'application/pdf' }), `${id}-${suffix}.pdf`);
  }
  return (
    <dialog
      ref={dialog}
      className="modal wide registered-modal"
      aria-labelledby="registered-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="modal-heading">
        <div>
          <div className="registration-tag">REUSABLE TEMPLATE · EXPERIMENTAL</div>
          <h2 id="registered-title">Print from CriProx</h2>
          <p>Capture Cricut’s marks once. Change your cards whenever you like.</p>
        </div>
        <button
          className="icon-button"
          aria-label="Close registered printing"
          disabled={!!busy}
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      <div className="registered-content">
        <div className="registration-summary">
          <div>
            <strong>{id}</strong>
            <span>
              {full.placements.length} fixed slots ·{' '}
              {project.settings.paper === 'letter' ? 'US Letter' : 'A4'} ·{' '}
              {formatDimensions(
                project.settings.width,
                project.settings.height,
                project.settings.units,
              )}{' '}
              cards
            </span>
          </div>
          <span className="mini-badge">
            {project.settings.machine === 'maker'
              ? 'MAKER'
              : project.settings.machine === 'explore'
                ? 'EXPLORE'
                : 'JOY XTRA'}
          </span>
        </div>
        <div className="registration-preferences">
          <div>
            <label>Display units</label>
            <div className="segmented unit-toggle" aria-label="Registered print display units">
              <button
                className={project.settings.units === 'in' ? 'selected' : ''}
                onClick={() => changePrintSettings({ units: 'in' })}
              >
                Inches
              </button>
              <button
                className={project.settings.units === 'mm' ? 'selected' : ''}
                onClick={() => changePrintSettings({ units: 'mm' })}
              >
                Millimeters
              </button>
            </div>
          </div>
          <FrontBleedControl settings={project.settings} change={changePrintSettings} />
        </div>
        <div className={`back-print-panel ${project.settings.backsEnabled ? 'enabled' : ''}`}>
          <label className="switch-row back-toggle">
            <span>
              Print card backs
              <small>Optional · off by default</small>
            </span>
            <input
              type="checkbox"
              checked={project.settings.backsEnabled}
              onChange={(event) => changePrintSettings({ backsEnabled: event.target.checked })}
            />
            <span className="switch" />
          </label>
          {project.settings.backsEnabled && (
            <div className="back-options">
              <div className="back-artwork-control">
                {project.backArtwork ? (
                  <img
                    src={project.backArtwork.preview}
                    alt="Selected card-back artwork"
                    className={project.settings.backRotation === 180 ? 'back-art-rotated' : ''}
                  />
                ) : (
                  <div className="back-art-placeholder">
                    <ImagePlus size={22} />
                    <span>No back art</span>
                  </div>
                )}
                <div>
                  <strong>
                    {project.backArtwork ? 'Card-back artwork ready' : 'Add card-back artwork'}
                  </strong>
                  <small>One shared design is used for every card.</small>
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => backInput.current?.click()}
                  >
                    <ImagePlus size={14} />
                    {project.backArtwork ? 'Replace artwork' : 'Upload artwork'}
                  </button>
                </div>
              </div>
              <MpcArtworkSearch
                type="CARDBACK"
                choose={(artwork) => chooseMpcBack({ ...artwork.face, name: artwork.name })}
              />
              <label className="switch-row back-bleed-toggle">
                <span>
                  Bleed on card backs
                  <small>
                    {project.settings.backBleedEnabled ? 'On' : 'Off'} · fixed{' '}
                    {formatMeasurement(fixedBleedMm(project.settings), project.settings.units)}{' '}
                    extension
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={project.settings.backBleedEnabled}
                  onChange={(event) =>
                    changePrintSettings({ backBleedEnabled: event.target.checked })
                  }
                />
                <span className="switch" />
              </label>
              <div className="back-fields">
                <label>
                  Printing method
                  <select
                    value={project.settings.backPrintMode}
                    onChange={(event) => {
                      const backPrintMode = event.target.value as Settings['backPrintMode'];
                      changePrintSettings({
                        backPrintMode,
                        backRotation: backPrintMode === 'manual' ? 180 : 0,
                      });
                    }}
                  >
                    <option value="manual">Manual refeed · default</option>
                    <option value="duplex">Automatic duplex printer</option>
                  </select>
                </label>
                <label>
                  Paper flip
                  <select
                    value={project.settings.backFlip}
                    onChange={(event) =>
                      changePrintSettings({
                        backFlip: event.target.value as Settings['backFlip'],
                      })
                    }
                  >
                    <option value="long-edge">Flip on long edge</option>
                    <option value="short-edge">Flip on short edge</option>
                  </select>
                </label>
                <label>
                  Back orientation
                  <select
                    value={project.settings.backRotation}
                    onChange={(event) =>
                      changePrintSettings({
                        backRotation: Number(event.target.value) as Settings['backRotation'],
                      })
                    }
                  >
                    <option value="180">Rotate 180° · manual refeed</option>
                    <option value="0">Keep artwork upright</option>
                  </select>
                </label>
              </div>
              <div className="back-offsets">
                {(['backOffsetX', 'backOffsetY'] as const).map((axis) => (
                  <label key={axis}>
                    <span>
                      {axis === 'backOffsetX' ? 'Back alignment X' : 'Back alignment Y'}
                      <strong>
                        {project.settings[axis] > 0 ? '+' : ''}
                        {formatMeasurement(project.settings[axis], project.settings.units)}
                      </strong>
                    </span>
                    <input
                      type="range"
                      min="-5"
                      max="5"
                      step="0.25"
                      value={project.settings[axis]}
                      onChange={(event) =>
                        changePrintSettings({ [axis]: Number(event.target.value) })
                      }
                    />
                  </label>
                ))}
              </div>
              <div className="back-alignment-tool">
                <div>
                  <strong>Front-to-back alignment test</strong>
                  <p>
                    Print the front target on plain paper, refeed the same sheet, and print the back
                    target. Hold it to a light with the <strong>back side facing you</strong>. The
                    arrows confirm orientation; each small grid square is {BACK_ALIGNMENT_SQUARE_MM}{' '}
                    mm.
                  </p>
                </div>
                <button className="secondary" disabled={!!busy} onClick={prepareAlignment}>
                  <Ruler size={15} /> Prepare alignment test
                </button>
                <div className="alignment-measurements">
                  <label>
                    <span>Magenta back grid is</span>
                    <select
                      aria-label="Horizontal alignment squares"
                      value={horizontalSquares}
                      onChange={(event) => setHorizontalSquares(Number(event.target.value))}
                    >
                      {Array.from({ length: 11 }, (_, index) => index / 2).map((value) => (
                        <option key={value} value={value}>
                          {value} square{value === 1 ? '' : 's'}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Horizontal alignment direction"
                      value={horizontalDirection}
                      onChange={(event) =>
                        setHorizontalDirection(event.target.value as 'left' | 'right')
                      }
                    >
                      <option value="left">left</option>
                      <option value="right">right</option>
                    </select>
                    <span>of the dark grid</span>
                  </label>
                  <label>
                    <span>Magenta back grid is</span>
                    <select
                      aria-label="Vertical alignment squares"
                      value={verticalSquares}
                      onChange={(event) => setVerticalSquares(Number(event.target.value))}
                    >
                      {Array.from({ length: 11 }, (_, index) => index / 2).map((value) => (
                        <option key={value} value={value}>
                          {value} square{value === 1 ? '' : 's'}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="Vertical alignment direction"
                      value={verticalDirection}
                      onChange={(event) =>
                        setVerticalDirection(event.target.value as 'up' | 'down')
                      }
                    >
                      <option value="up">above</option>
                      <option value="down">below</option>
                    </select>
                    <span>the dark grid</span>
                  </label>
                </div>
                <button
                  className="primary apply-alignment"
                  disabled={!!busy || (!horizontalSquares && !verticalSquares)}
                  onClick={applyAlignment}
                >
                  Apply measured correction
                </button>
                <div className="alignment-offset-summary">
                  <div
                    className="alignment-offset-visual"
                    aria-label={`Current back compensation: ${offsetDescription(project.settings.backOffsetX, true)} and ${offsetDescription(project.settings.backOffsetY, false)}`}
                  >
                    <span className="alignment-target front-target" />
                    <span
                      className="alignment-target back-target"
                      style={{
                        left: `calc(50% + ${project.settings.backOffsetX * 5}px)`,
                        top: `calc(50% + ${project.settings.backOffsetY * 5}px)`,
                      }}
                    />
                  </div>
                  <div>
                    <strong>Current back compensation</strong>
                    <span>
                      X: {offsetDescription(project.settings.backOffsetX, true)} · Y:{' '}
                      {offsetDescription(project.settings.backOffsetY, false)}
                    </span>
                    <small>
                      Prepare a fresh test after applying. Measurements reset to prevent applying
                      the same correction twice.
                    </small>
                  </div>
                </div>
              </div>
              <p className="back-help">
                {project.settings.backPrintMode === 'manual'
                  ? 'CriProx will make separate front and back PDFs. Print the fronts, refeed the same sheets, then print the backs.'
                  : `CriProx will alternate front and back pages. Enable duplex and ${project.settings.backFlip === 'long-edge' ? 'long-edge' : 'short-edge'} binding in the printer dialog.`}{' '}
                Back pages contain artwork only—no Cricut registration marks or cut lines. The front
                and back bleed settings apply independently. Back orientation rotates the artwork
                only; it does not move the cards or change the cut template.
              </p>
            </div>
          )}
        </div>
        <div className="registration-step">
          <span className="step-number">1</span>
          <div>
            <h3>Create your reusable cut job</h3>
            <p>
              Download the magenta setup image. Upload it to Design Space as one flat Print Then Cut
              image, preserve transparency, and set both dimensions to{' '}
              <strong>{formatDimensions(full.width, full.height, project.settings.units)}</strong>.
              Save the project as <strong>{id}</strong>.
              {printPaper.usesLetterHack && (
                <>
                  {' '}
                  Before Make, choose <strong>{printPaper.designSpacePaper}</strong> as the Print
                  Then Cut page size in Design Space.
                </>
              )}
            </p>
            <button className="secondary" disabled={!!busy} onClick={setup}>
              <Download size={15} /> Download setup PNG
            </button>
          </div>
        </div>
        <div className="registration-step">
          <span className="step-number">2</span>
          <div>
            <h3>Capture the actual sensor marks</h3>
            <p>
              In Design Space, choose Make → Send to Printer. Turn <strong>bleed off</strong>, use
              the system print dialog, and{' '}
              {printPaper.usesLetterHack ? (
                <>
                  change the printer paper to <strong>{printPaper.systemPaper}</strong>. Save a{' '}
                  <strong>one-page portrait PDF at 100% / Actual size</strong>; cancel if it becomes
                  two pages or clips any of the four sensor marks.
                </>
              ) : (
                <>save a full-page, portrait PDF at actual size.</>
              )}{' '}
              Import that PDF here. We check the slot pattern and size before storing it locally.
            </p>
            <button className="secondary" disabled={!!busy} onClick={() => input.current?.click()}>
              <FileUp size={15} />
              {profile ? 'Replace captured PDF' : 'Import Design Space PDF'}
            </button>
            {profile && (
              <div className="capture-success">
                <CheckCircle2 size={16} />
                <span>
                  {profile.name}
                  <small>
                    Geometry checked · captured {new Date(profile.capturedAt).toLocaleDateString()}{' '}
                    · hardware unverified
                  </small>
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="registration-step">
          <span className="step-number">3</span>
          <div>
            <h3>Print here, then use the saved cut job</h3>
            <p>
              Prepare and inspect your pages below. Print at <strong>100% / Actual size</strong>,
              with no fit, shrink, headers, or margins. If backs are enabled, print their artwork
              onto the same sheets; those back pages do not contain registration marks or cut lines.
              In Design Space, reopen this exact saved project and mat, select{' '}
              <strong>Already Printed / Skip printing</strong> when available, then load the sheet
              front-side up and cut.
            </p>
            <div className="registration-actions">
              <button
                className="secondary"
                disabled={!!busy || !profile || !project.entries.length}
                onClick={() => prepare(true)}
              >
                <Ruler size={15} />
                Prepare size-check sheet
              </button>
              <button
                className="primary"
                disabled={
                  !!busy ||
                  !profile ||
                  !project.entries.length ||
                  (project.settings.backsEnabled && !project.backArtwork)
                }
                onClick={() => prepare(false)}
              >
                Prepare card sheets
              </button>
            </div>
          </div>
        </div>
        <div className="soft-info">
          <Ruler size={18} />
          <span>
            Every page keeps all {full.placements.length} slots, including the last page. Unused
            slots print white and will still be cut. Change paper, spacing, machine, or layout and a
            new captured template is required. Card-back settings and alignment offsets reuse the
            current cut template; CriProx never creates a second Cricut template for the back side.
          </span>
        </div>
        <p className="guide-limit">
          Captured marks are preserved from your PDF, not independently generated. This is outside
          Cricut’s recommended print flow and still needs sensor and measurement tests on your
          machine. Recapture after changes to the saved mat, Design Space, or printer setup. Direct
          printing rasterizes at 300 DPI; the PDF keeps the captured marks’ original content and the
          selected artwork DPI. Artwork bleed extends into the surrounding card spacing without
          changing the cut pattern.
        </p>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        {busy && (
          <div role="status" className="loading">
            <LoaderCircle className="spin" size={19} />
            {busy}
          </div>
        )}
        {pdf && (
          <div className="registered-preview">
            <PdfPagePreview pdf={pdf} backPdf={backPdf} mode={preparedMode} />
            <div>
              <strong>
                {preparedKind === 'alignment'
                  ? 'Back alignment guide'
                  : preparedKind === 'size'
                    ? 'Size-check sheet'
                    : 'Card sheets'}{' '}
                ready to review
              </strong>
              <p>
                {preparedKind === 'alignment'
                  ? 'Print the front target first, then the matching back target on the same sheet. '
                  : 'Review every sheet using the page selector or arrows. Confirm the front marks are unobstructed and check the matching backs. '}
                {preparedMode === 'manual' &&
                  'Print fronts first, refeed those sheets, then print the matching backs in the same order.'}
                {preparedMode === 'duplex' &&
                  `Enable duplex with ${project.settings.backFlip === 'long-edge' ? 'long-edge' : 'short-edge'} binding in the system print dialog.`}
              </p>
              {preparedMode === 'manual' ? (
                <>
                  <button
                    className="secondary"
                    disabled={!!busy || !pdf}
                    onClick={() =>
                      savePdf(
                        pdf,
                        preparedKind === 'alignment'
                          ? 'alignment-front'
                          : preparedKind === 'size'
                            ? 'size-check'
                            : 'fronts',
                      )
                    }
                  >
                    <Download size={15} />{' '}
                    {preparedKind === 'alignment'
                      ? 'Download front test PDF'
                      : 'Download fronts PDF'}
                  </button>
                  <button
                    className="secondary"
                    disabled={!!busy || !backPdf}
                    onClick={() =>
                      savePdf(backPdf, preparedKind === 'alignment' ? 'alignment-back' : 'backs')
                    }
                  >
                    <Download size={15} />{' '}
                    {preparedKind === 'alignment' ? 'Download back test PDF' : 'Download backs PDF'}
                  </button>
                  <button className="primary" disabled={!!busy || !pdf} onClick={() => print(pdf)}>
                    <Printer size={15} />{' '}
                    {preparedKind === 'alignment' ? 'Print front test' : 'Print fronts'}
                  </button>
                  <button
                    className="primary"
                    disabled={!!busy || !backPdf}
                    onClick={() => print(backPdf)}
                  >
                    <Printer size={15} />{' '}
                    {preparedKind === 'alignment'
                      ? 'Print back test after refeed'
                      : 'Print backs after refeed'}
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="secondary"
                    disabled={!!busy || !pdf}
                    onClick={() =>
                      savePdf(
                        pdf,
                        preparedMode === 'duplex'
                          ? preparedKind === 'alignment'
                            ? 'alignment-duplex'
                            : 'duplex'
                          : preparedKind === 'size'
                            ? 'size-check'
                            : 'cards',
                      )
                    }
                  >
                    <Download size={15} />
                    {preparedMode === 'duplex' ? 'Download duplex PDF' : 'Download registered PDF'}
                  </button>
                  <button className="primary" disabled={!!busy || !pdf} onClick={() => print(pdf)}>
                    <Printer size={15} />
                    {preparedMode === 'duplex' ? 'Open duplex print dialog' : 'Open print dialog'}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
      <input
        hidden
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(e) => capture(e.target.files?.[0])}
      />
      <input
        hidden
        ref={backInput}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={(e) => uploadBack(e.target.files?.[0])}
      />
      <div className="modal-footer">
        <span className="muted">A saved template replaces artwork uploads for each deck.</span>
        <button className="secondary" disabled={!!busy} onClick={close}>
          Done
        </button>
      </div>
    </dialog>
  );
}
