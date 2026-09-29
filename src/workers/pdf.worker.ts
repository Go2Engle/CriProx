/// <reference lib="webworker" />

import { executePdfJob, type PdfWorkerRequest, type PdfWorkerResponse } from '../lib/pdf-worker';
import { setUpscaylRunner } from '../lib/upscale';

declare const self: DedicatedWorkerGlobalScope;

const pendingUpscayl = new Map<
  string,
  { resolve: (output: Uint8Array) => void; reject: (error: Error) => void }
>();
let activeJobId = '';
setUpscaylRunner(
  (nativeId, input) =>
    new Promise<Uint8Array>((resolve, reject) => {
      pendingUpscayl.set(nativeId, { resolve, reject });
      self.postMessage({ id: activeJobId, type: 'upscayl-request', nativeId, input }, [
        input.buffer,
      ]);
    }),
);

self.onmessage = async (
  event: MessageEvent<
    | PdfWorkerRequest
    | { id: string; type: 'upscayl-result'; nativeId: string; output?: Uint8Array; error?: string }
  >,
) => {
  // Dedicated worker messages come through the parent's implicit port, which
  // has an empty origin. Reject synthetic or unexpected cross-context events.
  if (event.origin !== '') return;
  const { data } = event;
  if (!data || typeof data.id !== 'string') return;
  if (!('kind' in data)) {
    if (data.type !== 'upscayl-result' || data.id !== activeJobId) return;
    const pending = pendingUpscayl.get(data.nativeId);
    if (!pending) return;
    pendingUpscayl.delete(data.nativeId);
    if (data.output) pending.resolve(data.output);
    else pending.reject(new Error(data.error || 'Upscayl failed.'));
    return;
  }
  activeJobId = data.id;
  const progress = (text: string) =>
    self.postMessage({ id: data.id, type: 'progress', text } satisfies PdfWorkerResponse);
  try {
    const result = await executePdfJob(data, progress);
    const transfer: Transferable[] = [result.pdf.buffer as ArrayBuffer];
    if (result.backPdf) transfer.push(result.backPdf.buffer as ArrayBuffer);
    if (result.cutPng) transfer.push(result.cutPng.buffer as ArrayBuffer);
    self.postMessage(
      { id: data.id, type: 'complete', result } satisfies PdfWorkerResponse,
      transfer,
    );
  } catch (error) {
    self.postMessage({
      id: data.id,
      type: 'error',
      message: error instanceof Error ? error.message : 'Could not generate the PDF.',
    } satisfies PdfWorkerResponse);
  }
};

export {};
