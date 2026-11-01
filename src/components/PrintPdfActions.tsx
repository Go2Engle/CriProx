import { useEffect, useRef, useState } from 'react';
import { Printer } from 'lucide-react';
import { printPdf } from '../lib/direct-print';

export default function PrintPdfActions({
  pdf,
  backPdf,
  mode,
  backFlip = 'long-edge',
}: {
  pdf: Uint8Array;
  backPdf?: Uint8Array;
  mode: 'front' | 'manual' | 'duplex';
  backFlip?: 'long-edge' | 'short-edge';
}) {
  const [busy, setBusy] = useState(''),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  useEffect(() => {
    setMessage('');
    setError('');
    return () => abort.current?.abort();
  }, [pdf, backPdf]);
  async function print(bytes: Uint8Array) {
    if (abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    setBusy('Preparing print…');
    setError('');
    setMessage('');
    try {
      const result = await printPdf(
        bytes,
        mode === 'duplex' ? (backFlip === 'short-edge' ? 'shortEdge' : 'longEdge') : 'simplex',
        setBusy,
        controller.signal,
      );
      setMessage(
        result.status === 'submitted'
          ? 'Sent to the printer. Check the printed sheet before cutting.'
          : result.status === 'cancelled'
            ? 'Printing cancelled.'
            : 'Print dialog opened. Confirm the settings there.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not print the sheets.');
    } finally {
      abort.current = null;
      setBusy('');
    }
  }
  return (
    <section className="direct-print-actions" aria-label="Print sheets">
      <div className="registration-actions">
        <button className="primary" disabled={!!busy} onClick={() => void print(pdf)}>
          <Printer size={16} />
          {mode === 'manual'
            ? 'Print fronts…'
            : mode === 'duplex'
              ? 'Print double-sided…'
              : 'Print sheets…'}
        </button>
        {mode === 'manual' && backPdf && (
          <button className="secondary" disabled={!!busy} onClick={() => void print(backPdf)}>
            <Printer size={16} />
            Print backs…
          </button>
        )}
        {busy && !busy.startsWith('Choose a printer') && (
          <button className="secondary" onClick={() => abort.current?.abort()}>
            Cancel preparation
          </button>
        )}
      </div>
      <p className="muted">
        Prints the prepared pages with their registration marks at 300 DPI. Choose the matching
        paper size, 100% / Actual size, no fit-to-page, and no headers or footers in the print
        dialog.
        {mode === 'manual'
          ? ' Print fronts first, then refeed the sheets and print backs.'
          : mode === 'duplex'
            ? ` Use ${backFlip} duplex binding.`
            : ''}
      </p>
      {(busy || message) && <p role="status">{busy || message}</p>}
      {error && (
        <p className="workflow-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
