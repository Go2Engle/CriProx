import { useEffect, useRef, useState } from 'react';
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  PDFPageProxy,
  RenderTask,
} from 'pdfjs-dist';
import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react';
import { pdfRenderer } from '../lib/registered-pdf';
import { pdfPreviewPages } from '../lib/pdf-preview-pages';
import './PdfPagePreview.css';

export default function PdfPagePreview({
  pdf,
  backPdf,
  mode,
}: {
  pdf: Uint8Array;
  backPdf?: Uint8Array;
  mode: 'front' | 'manual' | 'duplex';
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [documents, setDocuments] = useState<PDFDocumentProxy[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pages = pdfPreviewPages(documents[0]?.numPages ?? 0, documents[1]?.numPages ?? 0, mode);
  const selected = pages[index];

  useEffect(() => {
    let active = true;
    const tasks: PDFDocumentLoadingTask[] = [];
    setDocuments([]);
    setIndex(0);
    setLoading(true);
    setError('');
    void (async () => {
      const renderer = await pdfRenderer();
      if (!active) return;
      const sources = mode === 'manual' && backPdf ? [pdf, backPdf] : [pdf];
      tasks.push(...sources.map((bytes) => renderer.getDocument({ data: bytes.slice() })));
      const opened = await Promise.all(tasks.map((task) => task.promise));
      if (active) setDocuments(opened);
    })().catch((reason: unknown) => {
      if (!active) return;
      setError(reason instanceof Error ? reason.message : 'Could not load the PDF preview.');
      setLoading(false);
    });
    return () => {
      active = false;
      for (const task of tasks) void task.destroy().catch(() => {});
    };
  }, [pdf, backPdf, mode]);

  useEffect(() => {
    if (!selected || !canvas.current) return;
    let active = true;
    let render: RenderTask | undefined;
    let page: PDFPageProxy | undefined;
    // Render offscreen first so quickly changing pages cannot leave stale artwork visible.
    const target = document.createElement('canvas');
    setLoading(true);
    setError('');
    void (async () => {
      page = await documents[selected.document].getPage(selected.page);
      if (!active) return;
      const viewport = page.getViewport({ scale: 1.5 });
      target.width = Math.ceil(viewport.width);
      target.height = Math.ceil(viewport.height);
      render = page.render({ canvas: target, viewport });
      await render.promise;
      if (!active || !canvas.current) return;
      canvas.current.width = target.width;
      canvas.current.height = target.height;
      canvas.current.getContext('2d')!.drawImage(target, 0, 0);
      setLoading(false);
    })()
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : 'Could not render this page.');
        setLoading(false);
      })
      .finally(() => {
        page?.cleanup();
        target.width = target.height = 0;
      });
    return () => {
      active = false;
      render?.cancel();
    };
  }, [documents, selected?.document, selected?.page]);

  return (
    <div className="pdf-page-preview">
      <div className="pdf-page-navigation">
        <button
          className="icon-button"
          aria-label="Previous preview page"
          disabled={!index}
          onClick={() => setIndex(index - 1)}
        >
          <ChevronLeft size={18} />
        </button>
        <label>
          Preview page
          <select
            aria-label="Preview page"
            value={index}
            disabled={!pages.length}
            onChange={(event) => setIndex(Number(event.target.value))}
          >
            {!pages.length && <option value={0}>Loading pages…</option>}
            {pages.map((page, position) => (
              <option key={position} value={position}>
                {page.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="icon-button"
          aria-label="Next preview page"
          disabled={index >= pages.length - 1}
          onClick={() => setIndex(index + 1)}
        >
          <ChevronRight size={18} />
        </button>
      </div>
      <div className="pdf-preview-sheet" aria-busy={loading}>
        <canvas
          ref={canvas}
          role="img"
          aria-label={selected ? `${selected.label} PDF preview` : 'PDF preview'}
          style={{ visibility: loading || error ? 'hidden' : 'visible' }}
        />
        {loading && (
          <div className="pdf-preview-status" role="status">
            <LoaderCircle className="spin" size={20} /> Loading preview…
          </div>
        )}
        {error && (
          <div className="pdf-preview-status error-box" role="alert">
            {error}
          </div>
        )}
      </div>
      {pages.length > 0 && (
        <p aria-live="polite">
          {selected?.label} · Page {index + 1} of {pages.length}
        </p>
      )}
    </div>
  );
}
