import JSZip from 'jszip';
import { download, renderSheet } from './export';
import { mmToPx, type Sheet } from './layout';
import type { Project, Settings } from './types';

type Point = { x: number; y: number };

export const SILHOUETTE_EIGHT_REGISTRATION_INSET_IN = '0.394';

function roundedOutline(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): Point[] {
  const r = Math.min(radius, width / 2, height / 2);
  if (r === 0)
    return [
      { x, y },
      { x: x + width, y },
      { x: x + width, y: y + height },
      { x, y: y + height },
    ];
  const corners = [
    { x: x + width - r, y: y + r, start: -90 },
    { x: x + width - r, y: y + height - r, start: 0 },
    { x: x + r, y: y + height - r, start: 90 },
    { x: x + r, y: y + r, start: 180 },
  ];
  return corners.flatMap((corner) =>
    Array.from({ length: 7 }, (_, i) => {
      const angle = ((corner.start + i * 15) * Math.PI) / 180;
      return { x: corner.x + r * Math.cos(angle), y: corner.y + r * Math.sin(angle) };
    }),
  );
}

/** Millimeter DXF cut paths for Silhouette Studio Basic Edition. */
export function silhouetteDxf(sheet: Sheet, settings: Pick<Settings, 'radius'>): string {
  const lines = [
    '0',
    'SECTION',
    '2',
    'HEADER',
    '9',
    '$ACADVER',
    '1',
    'AC1015',
    '9',
    '$INSUNITS',
    '70',
    '4',
    '0',
    'ENDSEC',
    '0',
    'SECTION',
    '2',
    'ENTITIES',
  ];
  const number = (value: number) => Number(value.toFixed(5)).toString();
  for (const placement of sheet.placements) {
    const vertices = roundedOutline(
      placement.x,
      placement.y,
      placement.width,
      placement.height,
      settings.radius,
    );
    lines.push('0', 'LWPOLYLINE', '8', 'CUT', '90', String(vertices.length), '70', '1');
    for (const point of vertices)
      lines.push('10', number(point.x), '20', number(sheet.height - point.y));
  }
  lines.push('0', 'ENDSEC', '0', 'EOF');
  return `${lines.join('\n')}\n`;
}

export function silhouetteInstructions(project: Project, sheets: Sheet[]): string {
  const paper = project.settings.paper === 'letter' ? 'US Letter' : 'A4';
  const eightCardInset = project.settings.profile === 'eight'
    ? ` Set Left Inset, Top Inset, Right Inset, and Bottom Inset to ${SILHOUETTE_EIGHT_REGISTRATION_INSET_IN} in each (about 10 mm). Keep those settings in the saved job when printing and cutting.`
    : '';
  return (
    `CRIPROX — SILHOUETTE STUDIO PRINT & CUT\n\n` +
    `This package has one artwork PNG and one DXF cut-path file per sheet. It does not contain registration marks or a native Studio project. Silhouette Studio supplies those when it prints the job. DXF opens in the free Basic Edition; PNG opens in all editions.${project.settings.profile === 'eight' ? ' This eight-card Letter layout is experimental; check its print and cut borders at actual size.' : ''}\n\n` +
    `FOR EACH SHEET\n` +
    `1. In Silhouette Studio, set the page to ${paper}, portrait, and choose the mat you will actually use. Turn on Registration Marks in Page Setup.${eightCardInset}\n` +
    `2. Open the sheet artwork PNG and set its width and height to the exact sheet dimensions below. Keep the image proportions and transparent gaps. If Studio auto-traces the transparent PNG, set those PNG cut lines to No Cut or turn off PNG Autotrace under Preferences > Import.\n` +
    `3. Import the matching DXF. It contains one closed rounded cut path per card. Set the DXF group to the same width and height as the artwork group, then align both groups by their top-left card corners. Do not resize either group after alignment.\n` +
    `4. Place the aligned groups together inside Studio's print border, cut border, and registration-mark exclusion zones. If they do not fit at full size, do not print that sheet or shrink the cards. In the Send panel, cut only the DXF paths, not the PNG's traced edge. Keep DXF lines from printing. Studio's Print Bleed option can extend artwork past the cut edge.\n` +
    `5. Print from this same Studio project at 100% / Actual size with no fit-to-page scaling. Keep the printed registration marks complete. Load the printed page with the selected mat and cut from that unchanged project.\n` +
    `6. First run a plain-paper test. Measure a card: ${project.settings.width} × ${project.settings.height} mm with ${project.settings.radius} mm corners. Adjust Studio calibration or placement if needed before using card stock.\n\n` +
    `SHEET DIMENSIONS\n` +
    sheets
      .map(
        (sheet) =>
          `Sheet ${sheet.index + 1}: ${sheet.width} × ${sheet.height} mm; ${sheet.placements.length} cards; ` +
          `${mmToPx(sheet.width, project.settings.dpi)} × ${mmToPx(sheet.height, project.settings.dpi)} px at ${project.settings.dpi} DPI.`,
      )
      .join('\n') +
    `\n\nThe cut paths are vector geometry, but Studio import can change scale or placement. Verify dimensions after import. The selected DPI cannot restore detail absent from source images. This workflow has not been hardware-validated.\n`
  );
}

export async function exportSilhouetteBundle(
  project: Project,
  sheets: Sheet[],
  progress: (message: string) => void,
): Promise<void> {
  if (
    project.settings.machine !== 'silhouette' ||
    !['expanded', 'eight'].includes(project.settings.profile)
  )
    throw new Error('Choose Silhouette Studio and a supported card layout first.');
  if (project.settings.backsEnabled)
    throw new Error(
      'Silhouette Studio export currently supports front sheets only. Turn off Print card backs.',
    );
  if (!sheets.length) throw new Error('Add at least one card to export.');
  if (sheets.length > 24)
    throw new Error(
      'Export up to 24 sheets at a time. Choose the current sheet for a larger project.',
    );
  const zip = new JSZip();
  for (const [i, sheet] of sheets.entries()) {
    progress(`Rendering sheet ${i + 1} of ${sheets.length}…`);
    const name = `sheet-${String(sheet.index + 1).padStart(2, '0')}`;
    zip.file(`${name}-artwork.png`, await renderSheet(sheet, project.settings));
    zip.file(`${name}-cut-paths.dxf`, silhouetteDxf(sheet, project.settings));
  }
  zip.file('START-HERE.txt', silhouetteInstructions(project, sheets));
  progress('Packing your export…');
  download(
    await zip.generateAsync({ type: 'blob', compression: 'STORE' }),
    `${project.name.replace(/[^a-z0-9_-]+/gi, '-').slice(0, 60) || 'criprox'}-silhouette.zip`,
  );
}
