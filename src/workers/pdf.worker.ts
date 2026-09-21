/// <reference lib="webworker" />

import { executePdfJob, type PdfWorkerRequest, type PdfWorkerResponse } from '../lib/pdf-worker';

declare const self: DedicatedWorkerGlobalScope;

self.onmessage = async ({ data }: MessageEvent<PdfWorkerRequest>) => {
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
