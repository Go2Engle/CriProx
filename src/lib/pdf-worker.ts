import type { Project } from './types';
import type { RegistrationProfile } from './registration';
import {
  buildBackAlignmentPdfs,
  buildRegisteredBackPdf,
  buildRegisteredPdf,
  combineDuplexPdfs,
} from './registered-pdf';
import {
  buildManualCutCalibrationPdf,
  buildManualCutPdf,
  manualCutTemplatePng,
} from './manual-cut';

export type PreparedPdfJob = {
  pdf: Uint8Array;
  backPdf?: Uint8Array;
  cutPng?: Uint8Array;
  mode: 'front' | 'manual' | 'duplex';
};

export type PdfWorkerPayload =
  | {
      kind: 'registered';
      project: Project;
      profile: RegistrationProfile;
      calibration: boolean;
    }
  | { kind: 'alignment'; project: Project }
  | { kind: 'manual-calibration'; project: Project }
  | { kind: 'manual-nine'; project: Project };

export type PdfWorkerRequest = PdfWorkerPayload & { id: string };

export type PdfWorkerResponse =
  | { id: string; type: 'progress'; text: string }
  | { id: string; type: 'complete'; result: PreparedPdfJob }
  | { id: string; type: 'error'; message: string };

export async function executePdfJob(
  request: PdfWorkerRequest,
  progress: (text: string) => void,
): Promise<PreparedPdfJob> {
  if (request.kind === 'manual-calibration') {
    progress('Building manual cut calibration sheet…');
    return { pdf: await buildManualCutCalibrationPdf(request.project), mode: 'front' };
  }
  if (request.kind === 'manual-nine') {
    const cutPng = await manualCutTemplatePng(request.project.settings),
      fronts = await buildManualCutPdf(request.project, progress);
    if (!request.project.settings.backsEnabled) return { pdf: fronts, cutPng, mode: 'front' };
    const backs = await buildManualCutPdf(request.project, progress, true);
    if (request.project.settings.backPrintMode === 'duplex') {
      progress('Combining duplex pages…');
      return {
        pdf: await combineDuplexPdfs(request.project, fronts, backs),
        cutPng,
        mode: 'duplex',
      };
    }
    return { pdf: fronts, backPdf: backs, cutPng, mode: 'manual' };
  }
  if (request.kind === 'alignment') {
    const alignment = await buildBackAlignmentPdfs(request.project);
    if (request.project.settings.backPrintMode === 'duplex') {
      progress('Combining duplex pages…');
      return {
        pdf: await combineDuplexPdfs(request.project, alignment.front, alignment.back),
        mode: 'duplex',
      };
    }
    return { pdf: alignment.front, backPdf: alignment.back, mode: 'manual' };
  }

  const fronts = await buildRegisteredPdf(
    request.project,
    request.profile,
    progress,
    request.calibration,
  );
  if (!request.project.settings.backsEnabled) return { pdf: fronts, mode: 'front' };
  const backs = await buildRegisteredBackPdf(
    request.project,
    request.profile,
    progress,
    request.calibration,
  );
  if (request.project.settings.backPrintMode === 'duplex') {
    progress('Combining duplex pages…');
    return {
      pdf: await combineDuplexPdfs(request.project, fronts, backs),
      mode: 'duplex',
    };
  }
  return { pdf: fronts, backPdf: backs, mode: 'manual' };
}

function nextPaint() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export async function preparePdfJob(
  request: PdfWorkerPayload,
  progress: (text: string) => void,
): Promise<PreparedPdfJob> {
  const job = { ...request, id: crypto.randomUUID() } as PdfWorkerRequest;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
    await nextPaint();
    return executePdfJob(job, progress);
  }
  return new Promise<PreparedPdfJob>((resolve, reject) => {
    const worker = new Worker(new URL('../workers/pdf.worker.ts', import.meta.url), {
      type: 'module',
    });
    const finish = () => worker.terminate();
    worker.onmessage = ({ data }: MessageEvent<PdfWorkerResponse>) => {
      if (data.id !== job.id) return;
      if (data.type === 'progress') progress(data.text);
      else if (data.type === 'complete') {
        finish();
        resolve(data.result);
      } else {
        finish();
        reject(new Error(data.message));
      }
    };
    worker.onerror = (event) => {
      finish();
      reject(new Error(event.message || 'The PDF worker stopped unexpectedly.'));
    };
    worker.postMessage(job);
  });
}
