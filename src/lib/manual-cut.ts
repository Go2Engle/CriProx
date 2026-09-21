import { PDFDocument, PrintScaling, rgb, StandardFonts } from 'pdf-lib';
import { renderSheet } from './export';
import { mmToPx, type Sheet } from './layout';
import { backBleedMm, backOuterBleedMm, frontBleedMm, type Project, type Settings } from './types';
import { fixedSheets, fullTemplate, PT_PER_MM } from './registration';
import { mirroredBackSheet } from './registered-pdf';
import { needsSharedCardBack } from './entries';
import { withDpi } from './png';

type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;
type RenderContext = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export const MANUAL_CUT_INSET_MM = 6.35;
export const MANUAL_CUT_TEMPLATE_DPI = 300;
export const MANUAL_CUT_CALIBRATION_SQUARE_MM = 1;

export function manualCutCorrectionLabel(
  settings: Pick<Settings, 'manualCutCorrectionX' | 'manualCutCorrectionY'>,
) {
  const signed = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)} mm`;
  return `X ${signed(settings.manualCutCorrectionX)}, Y ${signed(settings.manualCutCorrectionY)}`;
}

export function manualCutCorrectionFileTag(
  settings: Pick<Settings, 'manualCutCorrectionX' | 'manualCutCorrectionY'>,
) {
  const safe = (value: number) =>
    `${value >= 0 ? 'p' : 'm'}${Math.abs(value).toFixed(2).replace('.', '_')}`;
  return `x-${safe(settings.manualCutCorrectionX)}-y-${safe(settings.manualCutCorrectionY)}`;
}

export function manualCutPaper(settings: Pick<Settings, 'paper'>) {
  return settings.paper === 'letter'
    ? { width: 215.9, height: 279.4, name: 'US Letter' }
    : { width: 210, height: 297, name: 'A4' };
}

export function manualCutPlacement(settings: Settings, back = false) {
  if (settings.profile !== 'nine')
    throw new Error('Select the manual nine-card layout before preparing a manual cut.');
  const paper = manualCutPaper(settings),
    full = fullTemplate(settings);
  if (
    full.width + MANUAL_CUT_INSET_MM > paper.width ||
    full.height + MANUAL_CUT_INSET_MM > paper.height
  )
    throw new Error('The nine-card layout does not fit the selected paper at the required inset.');
  // Design Space fixes the Basic Cut group at the quarter-inch mat inset. To move a
  // physical cut right/down relative to the artwork, move the printed artwork by the
  // same amount left/up. Mirror that corrected front origin for back-side printing.
  const frontLeft = MANUAL_CUT_INSET_MM - settings.manualCutCorrectionX,
    frontTop = MANUAL_CUT_INSET_MM - settings.manualCutCorrectionY;
  return {
    paper,
    full,
    left:
      (back && settings.backFlip === 'long-edge'
        ? paper.width - frontLeft - full.width
        : frontLeft) + (back ? settings.backOffsetX : 0),
    top:
      (back && settings.backFlip === 'short-edge'
        ? paper.height - frontTop - full.height
        : frontTop) + (back ? settings.backOffsetY : 0),
  };
}

function manualCutRasterBounds(
  placement: ReturnType<typeof manualCutPlacement>,
  outerBleed: number,
) {
  return {
    left: placement.left - outerBleed,
    top: placement.top - outerBleed,
    width: placement.full.width + outerBleed * 2,
    height: placement.full.height + outerBleed * 2,
  };
}

export function manualCutFirstSlotBounds(settings: Settings) {
  const placement = manualCutPlacement(settings),
    target = placement.full.placements[0];
  return {
    left: placement.left + target.x,
    top: placement.top + target.y,
    width: target.width,
    height: target.height,
  };
}

export function manualCutCorrection(
  horizontalSquares: number,
  horizontalDirection: 'left' | 'right',
  verticalSquares: number,
  verticalDirection: 'up' | 'down',
) {
  if (
    !Number.isFinite(horizontalSquares) ||
    !Number.isFinite(verticalSquares) ||
    horizontalSquares < 0 ||
    verticalSquares < 0
  )
    throw new Error('Calibration measurements must be positive numbers.');
  return {
    x:
      horizontalSquares *
      MANUAL_CUT_CALIBRATION_SQUARE_MM *
      (horizontalDirection === 'left' ? 1 : -1),
    y: verticalSquares * MANUAL_CUT_CALIBRATION_SQUARE_MM * (verticalDirection === 'up' ? 1 : -1),
  };
}

export async function buildManualCutCalibrationPdf(project: Project): Promise<Uint8Array> {
  const placement = manualCutPlacement(project.settings),
    outerBleed = frontBleedMm(project.settings),
    output = await PDFDocument.create(),
    page = output.addPage([placement.paper.width * PT_PER_MM, placement.paper.height * PT_PER_MM]),
    regular = await output.embedFont(StandardFonts.Helvetica),
    bold = await output.embedFont(StandardFonts.HelveticaBold),
    target = manualCutFirstSlotBounds(project.settings),
    calibrationSheet = { ...placement.full, placements: [placement.full.placements[0]] },
    art = await output.embedPng(
      await renderSheet(
        printableSheet(calibrationSheet, outerBleed),
        { ...project.settings, proxyLabel: false },
        'manual',
        outerBleed,
        outerBleed,
      ),
    ),
    raster = manualCutRasterBounds(placement, outerBleed),
    left = target.left,
    top = target.top,
    right = left + target.width,
    bottom = top + target.height,
    gridColor = rgb(0.72, 0.08, 0.58),
    dark = rgb(0.12, 0.12, 0.15),
    copy = rgb(0.3, 0.28, 0.33),
    outerX = Math.max(1, Math.min(5, Math.floor(left - 0.5))),
    outerY = Math.max(1, Math.min(5, Math.floor(top - 0.5))),
    inner = 5;
  page.drawRectangle({
    x: 0,
    y: 0,
    width: placement.paper.width * PT_PER_MM,
    height: placement.paper.height * PT_PER_MM,
    color: rgb(1, 1, 1),
  });
  page.drawImage(art, {
    x: raster.left * PT_PER_MM,
    y: (placement.paper.height - raster.top - raster.height) * PT_PER_MM,
    width: raster.width * PT_PER_MM,
    height: raster.height * PT_PER_MM,
  });
  const line = (
    x1: number,
    top1: number,
    x2: number,
    top2: number,
    thickness = 0.12,
    color = gridColor,
  ) =>
    page.drawLine({
      start: { x: x1 * PT_PER_MM, y: (placement.paper.height - top1) * PT_PER_MM },
      end: { x: x2 * PT_PER_MM, y: (placement.paper.height - top2) * PT_PER_MM },
      thickness: thickness * PT_PER_MM,
      color,
    });
  const horizontalBand = (edge: number, outside: number) => {
    for (let offset = -outside; offset <= inner; offset += MANUAL_CUT_CALIBRATION_SQUARE_MM)
      line(
        left + 9,
        edge + offset,
        right - 9,
        edge + offset,
        offset === 0 ? 0.5 : 0.12,
        offset === 0 ? dark : gridColor,
      );
    for (let x = left + 9, index = 0; x <= right - 9; x += 1, index += 1)
      line(x, edge - outside, x, edge + inner, index % 5 === 0 ? 0.2 : 0.08);
  };
  const verticalBand = (edge: number, outside: number) => {
    for (let offset = -outside; offset <= inner; offset += MANUAL_CUT_CALIBRATION_SQUARE_MM)
      line(
        edge + offset,
        top + 9,
        edge + offset,
        bottom - 9,
        offset === 0 ? 0.5 : 0.12,
        offset === 0 ? dark : gridColor,
      );
    for (let y = top + 9, index = 0; y <= bottom - 9; y += 1, index += 1)
      line(edge - outside, y, edge + inner, y, index % 5 === 0 ? 0.2 : 0.08);
  };
  horizontalBand(top, outerY);
  horizontalBand(bottom, 5);
  verticalBand(left, outerX);
  verticalBand(right, 5);
  const drawTopText = (
    text: string,
    x: number,
    textTop: number,
    size: number,
    font = regular,
    color = copy,
  ) =>
    page.drawText(text, {
      x: x * PT_PER_MM,
      y: (placement.paper.height - textTop) * PT_PER_MM - size,
      size,
      font,
      color,
    });
  drawTopText('MANUAL CUT CALIBRATION', left + 11, top + 14, 9, bold, dark);
  drawTopText('Use the existing saved 9-card', left + 11, top + 21, 7);
  drawTopText('Basic Cut project.', left + 11, top + 26, 7);
  drawTopText('Each magenta square is 1 mm.', left + 11, top + 34, 7);
  drawTopText('LEFT EDGE: record blade line', left + 11, top + 43, 7, bold);
  drawTopText('left or right of the dark edge.', left + 11, top + 48, 7);
  drawTopText('TOP EDGE: record blade line', left + 11, top + 56, 7, bold);
  drawTopText('above or below the dark edge.', left + 11, top + 61, 7);
  drawTopText('Measure straight edges, not corners.', left + 11, top + 69, 7);
  drawTopText('Right and bottom should match.', left + 11, top + 75, 7, bold);
  drawTopText('If not: check scale, rotation, and loading.', left + 11, top + 80, 6.5);
  drawTopText(
    `Current correction: X ${project.settings.manualCutCorrectionX.toFixed(2)} mm, Y ${project.settings.manualCutCorrectionY.toFixed(2)} mm`,
    left,
    bottom + 10,
    7,
    regular,
    gridColor,
  );
  drawTopText(
    'Print at 100% / Actual size. Place page flush at the mat grid origin.',
    left,
    bottom + 18,
    8,
  );
  drawTopText(
    'Cut with the unchanged 9-card project; the other eight cuts land on blank paper.',
    left,
    bottom + 24,
    8,
  );
  output.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  output.setTitle(
    `${project.name} - Manual cut calibration - ${manualCutCorrectionLabel(project.settings)}`,
  );
  output.setSubject(
    'One-millimeter plain-paper target for measuring manual Cricut Basic Cut translation.',
  );
  return output.save();
}

function renderCanvas(width: number, height: number): RenderCanvas {
  const canvas =
    typeof document === 'undefined'
      ? new OffscreenCanvas(width, height)
      : document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function pngBytes(canvas: RenderCanvas) {
  const blob =
    'convertToBlob' in canvas
      ? await canvas.convertToBlob({ type: 'image/png' })
      : await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob(
            (result) =>
              result ? resolve(result) : reject(new Error('Could not encode the cut template.')),
            'image/png',
          ),
        );
  return new Uint8Array(await blob.arrayBuffer());
}

export async function manualCutTemplatePng(settings: Settings): Promise<Uint8Array> {
  const { full } = manualCutPlacement(settings),
    canvas = renderCanvas(
      mmToPx(full.width, MANUAL_CUT_TEMPLATE_DPI),
      mmToPx(full.height, MANUAL_CUT_TEMPLATE_DPI),
    ),
    ctx = canvas.getContext('2d') as RenderContext | null;
  if (!ctx) throw new Error('Could not create the cut template.');
  ctx.scale(canvas.width / full.width, canvas.height / full.height);
  ctx.fillStyle = '#000000';
  for (const placement of full.placements) {
    ctx.beginPath();
    ctx.roundRect(placement.x, placement.y, placement.width, placement.height, settings.radius);
    ctx.fill();
  }
  const png = withDpi(await pngBytes(canvas), MANUAL_CUT_TEMPLATE_DPI);
  canvas.width = canvas.height = 0;
  return png;
}

function printableSheet(sheet: Sheet, padding: number): Sheet {
  if (!padding) return sheet;
  return {
    ...sheet,
    width: sheet.width + padding * 2,
    height: sheet.height + padding * 2,
    placements: sheet.placements.map((placement) => ({
      ...placement,
      x: placement.x + padding,
      y: placement.y + padding,
    })),
  };
}

export async function buildManualCutPdf(
  project: Project,
  progress: (text: string) => void,
  back = false,
): Promise<Uint8Array> {
  if (back && needsSharedCardBack(project.entries) && !project.backArtwork)
    throw new Error(
      'Upload shared card-back artwork for the single-sided cards before preparing back pages.',
    );
  const placement = manualCutPlacement(project.settings, back),
    sheets = fixedSheets(project.entries, project.settings);
  if (!sheets.length) throw new Error('Add at least one card.');
  if (sheets.length > 24) throw new Error('Use up to 24 sheets per manual cut job.');
  const output = await PDFDocument.create();
  for (const [index, sourceSheet] of sheets.entries()) {
    progress(`Preparing ${back ? 'back ' : ''}sheet ${index + 1} of ${sheets.length}…`);
    const page = output.addPage([
        placement.paper.width * PT_PER_MM,
        placement.paper.height * PT_PER_MM,
      ]),
      sheet = back ? mirroredBackSheet(sourceSheet, placement.full, project) : sourceSheet,
      innerBleed = back ? backBleedMm(project.settings) : frontBleedMm(project.settings),
      outerBleed = back ? backOuterBleedMm(project.settings) : innerBleed,
      raster = manualCutRasterBounds(placement, outerBleed),
      art = await output.embedPng(
        await renderSheet(
          printableSheet(sheet, outerBleed),
          { ...project.settings, proxyLabel: back ? false : project.settings.proxyLabel },
          false,
          innerBleed,
          outerBleed,
        ),
      );
    page.drawRectangle({
      x: 0,
      y: 0,
      width: placement.paper.width * PT_PER_MM,
      height: placement.paper.height * PT_PER_MM,
      color: rgb(1, 1, 1),
    });
    page.drawImage(art, {
      x: raster.left * PT_PER_MM,
      y: (placement.paper.height - raster.top - raster.height) * PT_PER_MM,
      width: raster.width * PT_PER_MM,
      height: raster.height * PT_PER_MM,
    });
  }
  output.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  output.setTitle(
    `${project.name} - Manual 9-card cut${back ? ' - Backs' : ''} - ${manualCutCorrectionLabel(project.settings)}`,
  );
  output.setSubject(
    'Experimental manual mat-alignment layout. Print at actual size and validate alignment on plain paper.',
  );
  return output.save();
}
