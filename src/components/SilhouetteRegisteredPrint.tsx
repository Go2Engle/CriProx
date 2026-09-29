import { useEffect, useRef, useState } from 'react';
import { get, set } from 'idb-keyval';
import { CheckCircle2, Download, FileUp, LoaderCircle, Ruler, X } from 'lucide-react';
import type { Project, Settings } from '../lib/types';
import { formatDimensions } from '../lib/units';
import {
  fullTemplate,
  registrationKey,
  templateId,
  type RegistrationProfile,
} from '../lib/registration';
import { captureProfile, downloadSetup } from '../lib/registered-pdf';
import { preparePdfJob } from '../lib/pdf-worker';
import { download } from '../lib/export';
import { SILHOUETTE_EIGHT_REGISTRATION_INSET_IN, silhouetteDxf } from '../lib/silhouette';
import FrontBleedControl from './FrontBleedControl';
import PdfPagePreview from './PdfPagePreview';

export default function SilhouetteRegisteredPrint({
  project,
  close,
  onCapture,
  openOneOff,
  notify,
  updateSettings,
}: {
  project: Project;
  close: () => void;
  onCapture: () => void;
  openOneOff: () => void;
  notify: (text: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const pdfAbort = useRef<AbortController | null>(null);
  const [profile, setProfile] = useState<RegistrationProfile>();
  const [busy, setBusy] = useState('Loading template…');
  const [error, setError] = useState('');
  const [pdf, setPdf] = useState<Uint8Array>();
  const [preparedKind, setPreparedKind] = useState<'cards' | 'size'>('cards');
  const [upscaleScryfall, setUpscaleScryfall] = useState(false);
  const key = registrationKey(project.settings);
  const id = templateId(project.settings);
  const full = fullTemplate(project.settings);
  const slotCount = full.placements.length;
  const library = window.criprox?.registrationTemplates;

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    let active = true;
    setProfile(undefined);
    setBusy('Loading template…');
    void (async () => {
      try {
        if (library) {
          const stored = await library.load(id, slotCount, 'silhouette');
          if (stored) {
            const restored = await captureProfile(
              new Uint8Array(stored.pdf),
              project.settings,
              stored.name,
            );
            restored.capturedAt = stored.capturedAt;
            await set(`registration:${key}`, restored).catch(() => {});
            if (active) setProfile(restored);
            return;
          }
        }
        const saved = await get<RegistrationProfile>(`registration:${key}`);
        if (saved?.version === 1 && saved.key === key && saved.pdf instanceof Uint8Array) {
          if (library) {
            const stored = await library.save(
              id,
              slotCount,
              saved.pdf.slice().buffer,
              'silhouette',
            );
            saved.name = stored.name;
            saved.capturedAt = stored.capturedAt;
          }
          if (active) setProfile(saved);
        }
      } catch (cause) {
        if (active)
          setError(cause instanceof Error ? cause.message : 'Could not load the saved template.');
      } finally {
        if (active) setBusy('');
      }
    })();
    return () => {
      active = false;
    };
  }, [key, id, slotCount]);

  async function setup() {
    setBusy('Creating setup image…');
    setError('');
    try {
      await downloadSetup(project.settings);
      notify('Setup PNG downloaded. Place it in Silhouette Studio at the stated dimensions.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not create the setup image.');
    } finally {
      setBusy('');
    }
  }
  function cutPaths() {
    download(
      new Blob([silhouetteDxf(full, project.settings)], { type: 'application/dxf' }),
      `${id}-setup-cut-paths.dxf`,
    );
  }
  async function capture(file?: File) {
    if (!file) return;
    setBusy('Checking page size, cut slots, and surrounding marks…');
    setError('');
    setPdf(undefined);
    try {
      if (file.size > 25_000_000) throw new Error('Use a template PDF under 25 MB.');
      const next = await captureProfile(
        new Uint8Array(await file.arrayBuffer()),
        project.settings,
        file.name,
      );
      if (library) {
        const stored = await library.save(id, slotCount, next.pdf.slice().buffer, 'silhouette');
        next.name = stored.name;
        next.capturedAt = stored.capturedAt;
      }
      await set(`registration:${key}`, next);
      setProfile(next);
      onCapture();
      notify('Silhouette template captured. Run a plain-paper test cut before using card stock.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read this PDF.');
    } finally {
      setBusy('');
      if (input.current) input.current.value = '';
    }
  }
  async function prepare(calibration: boolean) {
    if (!profile) return;
    const controller = new AbortController();
    pdfAbort.current = controller;
    setBusy('Building registered pages…');
    setError('');
    setPdf(undefined);
    try {
      const result = await preparePdfJob(
        { kind: 'registered', project, profile, calibration, upscaleScryfall },
        setBusy,
        controller.signal,
      );
      setPdf(result.pdf);
      setPreparedKind(calibration ? 'size' : 'cards');
    } catch (cause) {
      if (!(cause instanceof DOMException && cause.name === 'AbortError'))
        setError(cause instanceof Error ? cause.message : 'Could not generate registered pages.');
    } finally {
      pdfAbort.current = null;
      setBusy('');
    }
  }
  function savePdf() {
    if (!pdf) return;
    download(
      new Blob([pdf.slice().buffer], { type: 'application/pdf' }),
      `${id}-${preparedKind === 'size' ? 'size-check' : 'cards'}.pdf`,
    );
  }

  return (
    <dialog
      ref={dialog}
      className="modal wide registered-modal"
      aria-labelledby="silhouette-registered-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="modal-heading">
        <div>
          <div className="registration-tag">SILHOUETTE · REUSABLE TEMPLATE · EXPERIMENTAL</div>
          <h2 id="silhouette-registered-title">Create registered print PDF</h2>
          <p>
            Capture Silhouette Studio’s marks once, then place new artwork inside that saved print.
          </p>
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
              {slotCount} fixed slots · {project.settings.paper === 'letter' ? 'US Letter' : 'A4'} ·{' '}
              {formatDimensions(
                project.settings.width,
                project.settings.height,
                project.settings.units,
              )}{' '}
              cards
            </span>
          </div>
          <span className="mini-badge">SILHOUETTE</span>
        </div>
        {slotCount === 8 && (
          <div className="warning-box" role="status">
            Eight cards occupy 177 × 255 mm. In Studio, set Left, Top, Right, and Bottom Inset to{' '}
            <strong>{SILHOUETTE_EIGHT_REGISTRATION_INSET_IN} in each</strong> (about 10 mm). Check
            that all eight cards, complete marks, and print and cut borders fit at actual size.
            This layout still needs a measured test cut.
          </div>
        )}
        <div className="registration-preferences">
          <FrontBleedControl
            settings={project.settings}
            change={(patch) => {
              setPdf(undefined);
              updateSettings(patch);
            }}
          />
        </div>
        <label className="switch-row upscale-toggle">
          <span>
            Upscale Scryfall card images (high detail)
            <small>
              Optional · off by default. Choose 600+ DPI in Sheet setup and inspect fine text before
              printing.
            </small>
          </span>
          <input
            type="checkbox"
            checked={upscaleScryfall}
            disabled={!!busy}
            onChange={(event) => {
              setUpscaleScryfall(event.target.checked);
              setPdf(undefined);
            }}
          />
          <span className="switch" />
        </label>
        <div className="registration-step">
          <span className="step-number">1</span>
          <div>
            <h3>Create the saved Studio cut job</h3>
            <p>
              Download the magenta setup PNG. In Silhouette Studio, set your actual paper and mat,
              turn on Registration Marks
              {slotCount === 8 && (
                <>
                  , with Left Inset, Top Inset, Right Inset, and Bottom Inset each set to{' '}
                  <strong>{SILHOUETTE_EIGHT_REGISTRATION_INSET_IN} in</strong>
                </>
              )}
              , and place the PNG at{' '}
              <strong>{formatDimensions(full.width, full.height, project.settings.units)}</strong>{' '}
              without rotating or splitting its {slotCount} cards. Use Studio’s PNG trace for{' '}
              {slotCount} cut paths, or import the matching DXF cut paths and set the PNG to No Cut.
              Check that only {slotCount} rounded paths will cut. Save this Studio project as{' '}
              <strong>{id}</strong>.
            </p>
            <button className="secondary" disabled={!!busy} onClick={() => void setup()}>
              <Download size={15} /> Download setup PNG
            </button>{' '}
            <button className="secondary" disabled={!!busy} onClick={cutPaths}>
              <Download size={15} /> Optional DXF cut paths
            </button>
          </div>
        </div>
        <div className="registration-step">
          <span className="step-number">2</span>
          <div>
            <h3>Capture Studio’s printed marks</h3>
            <p>
              Turn Studio Print Bleed off for this setup print. Print the saved project to a{' '}
              <strong>one-page portrait PDF at 100% / Actual size</strong>, with all registration
              marks visible and no printer scaling. Import that PDF here. CriProx checks the magenta
              slots and surrounding marks, then saves this template for the same {slotCount}-card
              layout.
            </p>
            <button className="secondary" disabled={!!busy} onClick={() => input.current?.click()}>
              <FileUp size={15} /> {profile ? 'Replace captured PDF' : 'Import Studio PDF'}
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
            <h3>Print new artwork, then cut from the saved job</h3>
            <p>
              Prepare the card PDF, inspect each page, and print it from a dedicated PDF application
              at <strong>100% / Actual size</strong>. Reopen the unchanged saved Studio project and
              send its existing cut paths to the machine without printing it again. Keep the same
              paper size, mat, registration settings (including all four insets), and orientation.
              Test one sheet on plain paper
              first.
            </p>
            <div className="registration-actions">
              <button
                className="secondary"
                disabled={!!busy || !profile || !project.entries.length}
                onClick={() => void prepare(true)}
              >
                <Ruler size={15} /> Prepare size-check sheet
              </button>
              <button
                className="primary"
                disabled={!!busy || !profile || !project.entries.length}
                onClick={() => void prepare(false)}
              >
                Prepare card sheets
              </button>
            </div>
          </div>
        </div>
        <p className="guide-limit">
          CriProx preserves the captured Studio marks; it does not generate them. This reuse
          workflow needs a measured sensor and cut test on your machine. Recapture after changing
          the Studio job, registration settings, paper, mat, machine, or printer setup. Unused slots
          on a partial final page remain in the saved cut job.
        </p>
        <button
          className="text-button"
          disabled={!!busy || !project.entries.length}
          onClick={openOneOff}
        >
          Use the one-off PNG/DXF export instead
        </button>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        {busy && (
          <div role="status" className="loading">
            <LoaderCircle className="spin" size={19} />
            {busy}
            {pdfAbort.current && (
              <button className="secondary compact" onClick={() => pdfAbort.current?.abort()}>
                Cancel
              </button>
            )}
          </div>
        )}
        {pdf && (
          <div className="registered-preview">
            <PdfPagePreview pdf={pdf} mode="front" />
            <div>
              <strong>
                {preparedKind === 'size' ? 'Size-check sheet' : 'Card sheets'} ready to review
              </strong>
              <p>
                Confirm the registration marks are unobstructed, then print the saved PDF at 100% /
                Actual size.
              </p>
              <button className="primary" onClick={savePdf}>
                <Download size={15} /> Save registered PDF
              </button>
            </div>
          </div>
        )}
      </div>
      <input
        hidden
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        onChange={(event) => void capture(event.target.files?.[0])}
      />
      <div className="modal-footer">
        <span className="muted">
          The {slotCount}-card template loads automatically when this exact cut layout is selected.
        </span>
        <button className="secondary" disabled={!!busy} onClick={close}>
          Done
        </button>
      </div>
    </dialog>
  );
}
