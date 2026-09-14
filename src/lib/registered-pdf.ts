import { PDFDocument, PrintScaling, rgb, StandardFonts } from 'pdf-lib';
import { backBleedMm, frontBleedMm, type Project, type Settings } from './types';
import { renderSheet, download } from './export';
import { mmToPx, type Sheet } from './layout';
import { withDpi } from './png';
import {
  CAPTURE_COLOR,
  BACK_ALIGNMENT_SQUARE_MM,
  alignmentArtworkDirection,
  PT_PER_MM,
  detectTemplate,
  fixedSheets,
  fullTemplate,
  mirrorBackPlacements,
  registrationKey,
  templateId,
  type RegistrationProfile,
} from './registration';
export async function pdfRenderer() {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url,
  ).href;
  return pdfjs;
}
export async function setupPng(settings: Settings): Promise<Uint8Array> {
  const sheet = fullTemplate(settings),
    dpi = 300;
  const canvas = document.createElement('canvas');
  canvas.width = mmToPx(sheet.width, dpi);
  canvas.height = mmToPx(sheet.height, dpi);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(canvas.width / sheet.width, canvas.height / sheet.height);
  ctx.fillStyle = CAPTURE_COLOR;
  for (const p of sheet.placements) {
    ctx.beginPath();
    ctx.roundRect(p.x, p.y, p.width, p.height, settings.radius);
    ctx.fill();
  }
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode setup PNG.')))),
  );
  canvas.width = canvas.height = 0;
  return withDpi(new Uint8Array(await blob.arrayBuffer()), dpi);
}
export async function downloadSetup(settings: Settings) {
  const id = templateId(settings),
    png = await setupPng(settings);
  download(new Blob([png.slice().buffer], { type: 'image/png' }), `${id}-setup.png`);
}
export async function captureProfile(
  pdf: Uint8Array,
  settings: Settings,
  name: string,
): Promise<RegistrationProfile> {
  if (pdf.length > 25_000_000) throw new Error('Use a template PDF under 25 MB.');
  const source = await PDFDocument.load(pdf);
  if (source.getPageCount() !== 1) throw new Error('Capture exactly one full template page.');
  const page = source.getPage(0),
    size = page.getSize(),
    crop = page.getCropBox(),
    media = page.getMediaBox();
  const expected = settings.paper === 'letter' ? [215.9, 279.4] : [210, 297];
  if (
    page.getRotation().angle !== 0 ||
    crop.x !== 0 ||
    crop.y !== 0 ||
    media.x !== 0 ||
    media.y !== 0 ||
    Math.abs(crop.width - size.width) > 0.01 ||
    Math.abs(crop.height - size.height) > 0.01
  )
    throw new Error('Use an uncropped, unrotated portrait PDF with a normal page origin.');
  if (
    Math.abs(size.width / PT_PER_MM - expected[0]) > 0.5 ||
    Math.abs(size.height / PT_PER_MM - expected[1]) > 0.5
  )
    throw new Error(
      `Wrong paper size. Capture a portrait ${settings.paper === 'letter' ? 'US Letter' : 'A4'} page without cropping.`,
    );
  const pdfjs = await pdfRenderer();
  const task = pdfjs.getDocument({ data: pdf.slice() });
  try {
    const doc = await task.promise,
      rendered = await doc.getPage(1);
    if (rendered.userUnit !== 1)
      throw new Error('This PDF uses a nonstandard page scale. Recapture at actual size.');
    const viewport = rendered.getViewport({ scale: 300 / 72 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    await rendered.render({ canvas, canvasContext: ctx, viewport, background: '#ffffff' }).promise;
    const position = detectTemplate(
      ctx.getImageData(0, 0, canvas.width, canvas.height).data,
      canvas.width,
      canvas.height,
      size.width / PT_PER_MM,
      size.height / PT_PER_MM,
      settings,
    );
    const thumb = document.createElement('canvas');
    thumb.width = 380;
    thumb.height = Math.round((380 * size.height) / size.width);
    thumb.getContext('2d')!.drawImage(canvas, 0, 0, thumb.width, thumb.height);
    const preview = thumb.toDataURL('image/png');
    canvas.width = canvas.height = 0;
    return {
      version: 1,
      key: registrationKey(settings),
      name,
      capturedAt: new Date().toISOString(),
      pdf,
      pageWidthPt: size.width,
      pageHeightPt: size.height,
      ...position,
      preview,
    };
  } finally {
    await task.destroy();
  }
}
export async function buildRegisteredPdf(
  project: Project,
  profile: RegistrationProfile,
  progress: (text: string) => void,
  calibration = false,
): Promise<Uint8Array> {
  if (profile.key !== registrationKey(project.settings))
    throw new Error(
      'This template belongs to different sheet settings. Capture or select a matching template.',
    );
  const pages = fixedSheets(project.entries, project.settings),
    full = fullTemplate(project.settings);
  if (!pages.length) throw new Error('Add at least one card.');
  if (pages.length > 24) throw new Error('Use up to 24 sheets per registered print job.');
  const output = await PDFDocument.create();
  const source = await PDFDocument.load(profile.pdf);
  // Embed only the page's visual content. Do not carry source document scripts,
  // attachments, annotations or forms into generated print files.
  const master = await output.embedPage(source.getPage(0));
  const pageList = calibration ? [full] : pages;
  for (const [index, sheet] of pageList.entries()) {
    progress(`Preparing registered sheet ${index + 1} of ${pageList.length}…`);
    const page = output.addPage([profile.pageWidthPt, profile.pageHeightPt]);
    page.drawPage(master, { x: 0, y: 0, width: profile.pageWidthPt, height: profile.pageHeightPt });
    const bleed = calibration ? 0 : frontBleedMm(project.settings),
      x = profile.leftMm * PT_PER_MM,
      y = profile.pageHeightPt - (profile.topMm + full.height) * PT_PER_MM;
    const pad = 0.18 * PT_PER_MM; // Erase raster edge fuzz only; capture checks a 0.4 mm guard.
    page.drawRectangle({
      x: x - pad,
      y: y - pad,
      width: full.width * PT_PER_MM + pad * 2,
      height: full.height * PT_PER_MM + pad * 2,
      color: rgb(1, 1, 1),
    });
    const printableSheet = bleed
      ? {
          ...sheet,
          width: full.width + bleed * 2,
          height: full.height + bleed * 2,
          placements: sheet.placements.map((placement) => ({
            ...placement,
            x: placement.x + bleed,
            y: placement.y + bleed,
          })),
        }
      : sheet;
    const art = await output.embedPng(
      await renderSheet(printableSheet, project.settings, calibration, bleed),
    );
    page.drawImage(art, {
      x: x - bleed * PT_PER_MM,
      y: y - bleed * PT_PER_MM,
      width: (full.width + bleed * 2) * PT_PER_MM,
      height: (full.height + bleed * 2) * PT_PER_MM,
    });
  }
  output.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  output.setTitle(
    `${project.name} - ${templateId(project.settings)}${calibration ? ' - Size check' : ''}`,
  );
  output.setSubject(
    'Experimental registered print: captured Design Space marks, fixed cut geometry. Validate on your machine.',
  );
  return output.save();
}
function mirroredBackSheet(sheet: Sheet, full: Sheet, project: Project): Sheet {
  const back = project.backArtwork;
  const mirrored = mirrorBackPlacements(
    sheet,
    full,
    project.settings.backFlip,
    project.settings.backRotation,
  );
  return {
    ...mirrored,
    placements: mirrored.placements.map((placement) => ({
      ...placement,
      ...(back
        ? {
            entry: {
              ...placement.entry,
              face: 0,
              card: {
                ...placement.entry.card,
                id: `back-${placement.entry.card.id}`,
                name: 'Card back',
                set: 'back',
                setName: 'Project card back',
                collector: '',
                faces: [back],
              },
            },
          }
        : {}),
    })),
  };
}
export async function buildRegisteredBackPdf(
  project: Project,
  profile: RegistrationProfile,
  progress: (text: string) => void,
  calibration = false,
): Promise<Uint8Array> {
  if (profile.key !== registrationKey(project.settings))
    throw new Error('This template belongs to different sheet settings.');
  if (!calibration && !project.backArtwork)
    throw new Error('Upload card-back artwork before preparing back pages.');
  const pages = fixedSheets(project.entries, project.settings),
    full = fullTemplate(project.settings);
  if (!pages.length) throw new Error('Add at least one card.');
  const output = await PDFDocument.create();
  const pageList = calibration ? [full] : pages;
  const pageWidthMm = profile.pageWidthPt / PT_PER_MM,
    pageHeightMm = profile.pageHeightPt / PT_PER_MM;
  for (const [index, sourceSheet] of pageList.entries()) {
    progress(`Preparing back sheet ${index + 1} of ${pageList.length}…`);
    const page = output.addPage([profile.pageWidthPt, profile.pageHeightPt]);
    const sheet = mirroredBackSheet(sourceSheet, full, project),
      bleed = calibration ? 0 : backBleedMm(project.settings),
      left =
        (project.settings.backFlip === 'long-edge'
          ? pageWidthMm - profile.leftMm - full.width
          : profile.leftMm) + project.settings.backOffsetX,
      top =
        (project.settings.backFlip === 'short-edge'
          ? pageHeightMm - profile.topMm - full.height
          : profile.topMm) + project.settings.backOffsetY;
    const printableSheet = bleed
      ? {
          ...sheet,
          width: full.width + bleed * 2,
          height: full.height + bleed * 2,
          placements: sheet.placements.map((placement) => ({
            ...placement,
            x: placement.x + bleed,
            y: placement.y + bleed,
          })),
        }
      : sheet;
    const art = await output.embedPng(
      await renderSheet(
        printableSheet,
        { ...project.settings, proxyLabel: false },
        calibration,
        bleed,
      ),
    );
    page.drawImage(art, {
      x: (left - bleed) * PT_PER_MM,
      y: profile.pageHeightPt - (top + full.height + bleed) * PT_PER_MM,
      width: (full.width + bleed * 2) * PT_PER_MM,
      height: (full.height + bleed * 2) * PT_PER_MM,
    });
  }
  output.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  output.setTitle(`${project.name} - ${templateId(project.settings)} - Backs`);
  output.setSubject(
    calibration
      ? 'Back-only alignment guide. Print after the registered front size-check page; no Cricut marks or cut paths are included.'
      : 'Back artwork for the matching registered front pages. Print at actual size; no Cricut marks or cut paths are included.',
  );
  return output.save();
}
async function buildAlignmentPage(project: Project, back: boolean): Promise<Uint8Array> {
  const output = await PDFDocument.create(),
    paper = project.settings.paper === 'letter' ? [215.9, 279.4] : [210, 297],
    pageWidthMm = paper[0],
    pageHeightMm = paper[1],
    page = output.addPage([pageWidthMm * PT_PER_MM, pageHeightMm * PT_PER_MM]),
    regular = await output.embedFont(StandardFonts.Helvetica),
    bold = await output.embedFont(StandardFonts.HelveticaBold),
    color = back ? rgb(0.72, 0.08, 0.58) : rgb(0.12, 0.12, 0.15),
    gridSquares = 30,
    gridSizeMm = gridSquares * BACK_ALIGNMENT_SQUARE_MM,
    centerX = pageWidthMm / 2 + (back ? project.settings.backOffsetX : 0),
    centerY = pageHeightMm / 2 - (back ? project.settings.backOffsetY : 0),
    left = centerX - gridSizeMm / 2,
    bottom = centerY - gridSizeMm / 2;
  const line = (x1: number, y1: number, x2: number, y2: number, thickness = 0.12) =>
    page.drawLine({
      start: { x: x1 * PT_PER_MM, y: y1 * PT_PER_MM },
      end: { x: x2 * PT_PER_MM, y: y2 * PT_PER_MM },
      thickness: thickness * PT_PER_MM,
      color,
    });
  for (let index = 0; index <= gridSquares; index++) {
    const offset = index * BACK_ALIGNMENT_SQUARE_MM,
      thickness = index === gridSquares / 2 ? 0.45 : index % 5 === 0 ? 0.28 : 0.14;
    line(left + offset, bottom, left + offset, bottom + gridSizeMm, thickness);
    line(left, bottom + offset, left + gridSizeMm, bottom + offset, thickness);
  }
  page.drawCircle({
    x: centerX * PT_PER_MM,
    y: centerY * PT_PER_MM,
    size: 1.6 * PT_PER_MM,
    borderColor: color,
    borderWidth: 0.35 * PT_PER_MM,
  });
  const artworkDirection = alignmentArtworkDirection(project.settings, back),
    arrowGap = gridSizeMm / 2 + 3,
    arrowLength = 9,
    wingLength = 3,
    wingSpread = 2.5;
  if (artworkDirection === 'right' || artworkDirection === 'left') {
    const sign = artworkDirection === 'right' ? 1 : -1,
      arrowStart = centerX + sign * arrowGap,
      arrowEnd = arrowStart + sign * arrowLength,
      arrowWing = arrowEnd - sign * wingLength;
    line(arrowStart, centerY, arrowEnd, centerY, 0.55);
    line(arrowEnd, centerY, arrowWing, centerY - wingSpread, 0.55);
    line(arrowEnd, centerY, arrowWing, centerY + wingSpread, 0.55);
  } else {
    const sign = artworkDirection === 'up' ? 1 : -1,
      arrowStart = centerY + sign * arrowGap,
      arrowEnd = arrowStart + sign * arrowLength,
      arrowWing = arrowEnd - sign * wingLength;
    line(centerX, arrowStart, centerX, arrowEnd, 0.55);
    line(centerX, arrowEnd, centerX - wingSpread, arrowWing, 0.55);
    line(centerX, arrowEnd, centerX + wingSpread, arrowWing, 0.55);
  }
  const title = back ? 'BACK ALIGNMENT TEST' : 'FRONT ALIGNMENT TEST',
    titleSize = 15,
    titleWidth = bold.widthOfTextAtSize(title, titleSize);
  page.drawText(title, {
    x: (page.getWidth() - titleWidth) / 2,
    y: page.getHeight() - 35 * PT_PER_MM,
    size: titleSize,
    font: bold,
    color,
  });
  const instructions = back
    ? 'Hold this BACK side toward you and compare the magenta target to the dark front target.'
    : 'Print at 100% on plain paper. Refeed this sheet and print the matching back test.';
  page.drawText(instructions, {
    x: 24 * PT_PER_MM,
    y: page.getHeight() - 45 * PT_PER_MM,
    size: 9,
    font: regular,
    color: rgb(0.3, 0.3, 0.34),
    maxWidth: page.getWidth() - 48 * PT_PER_MM,
  });
  const footer = `Each small square is ${BACK_ALIGNMENT_SQUARE_MM} mm. Each arrow shows that PDF side's artwork top.`,
    footerWidth = regular.widthOfTextAtSize(footer, 8);
  page.drawText(footer, {
    x: (page.getWidth() - footerWidth) / 2,
    y: 24 * PT_PER_MM,
    size: 8,
    font: regular,
    color: rgb(0.38, 0.38, 0.42),
  });
  if (back) {
    const note = `Back artwork setting: ${project.settings.backRotation === 180 ? 'Rotate 180 degrees' : 'Keep upright'}`,
      noteWidth = regular.widthOfTextAtSize(note, 8);
    page.drawText(note, {
      x: (page.getWidth() - noteWidth) / 2,
      y: 16 * PT_PER_MM,
      size: 8,
      font: regular,
      color,
    });
  }
  output.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  output.setTitle(`${project.name} - Front to back alignment - ${back ? 'Back' : 'Front'}`);
  output.setSubject('Plain-paper front-to-back printer alignment test. Print at actual size.');
  return output.save();
}
export async function buildBackAlignmentPdfs(project: Project) {
  return {
    front: await buildAlignmentPage(project, false),
    back: await buildAlignmentPage(project, true),
  };
}
export async function combineDuplexPdfs(
  project: Project,
  fronts: Uint8Array,
  backs: Uint8Array,
): Promise<Uint8Array> {
  const frontDocument = await PDFDocument.load(fronts),
    backDocument = await PDFDocument.load(backs);
  if (frontDocument.getPageCount() !== backDocument.getPageCount())
    throw new Error('Front and back page counts do not match.');
  const output = await PDFDocument.create();
  for (let index = 0; index < frontDocument.getPageCount(); index++) {
    const [front] = await output.copyPages(frontDocument, [index]),
      [back] = await output.copyPages(backDocument, [index]);
    output.addPage(front);
    output.addPage(back);
  }
  output.catalog.getOrCreateViewerPreferences().setPrintScaling(PrintScaling.None);
  output.setTitle(`${project.name} - ${templateId(project.settings)} - Duplex`);
  output.setSubject(
    `Alternating registered fronts and card backs. Print duplex using ${project.settings.backFlip === 'long-edge' ? 'long-edge' : 'short-edge'} binding at actual size.`,
  );
  return output.save();
}
export async function printRegisteredPdf(
  pdf: Uint8Array,
  progress: (text: string) => void,
): Promise<void> {
  const pdfjs = await pdfRenderer(),
    task = pdfjs.getDocument({ data: pdf.slice() });
  const frame = document.createElement('iframe');
  frame.title = 'CriProx registered print';
  frame.style.cssText = 'position:fixed;width:1px;height:1px;left:-10000px;top:0;border:0';
  document.body.append(frame);
  try {
    const doc = await task.promise,
      target = frame.contentDocument!;
    const first = await doc.getPage(1),
      size = first.getViewport({ scale: 1 });
    const w = size.width / PT_PER_MM,
      h = size.height / PT_PER_MM;
    const style = target.createElement('style');
    style.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; } html,body{margin:0;padding:0;} img{display:block;width:${w}mm;height:${h}mm;break-after:page;page-break-after:always;} img:last-child{break-after:auto;page-break-after:auto;}`;
    target.head.append(style);
    for (let n = 1; n <= doc.numPages; n++) {
      progress(`Preparing printer page ${n} of ${doc.numPages}…`);
      const page = await doc.getPage(n),
        viewport = page.getViewport({ scale: 300 / 72 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const img = target.createElement('img');
      img.src = canvas.toDataURL('image/png');
      target.body.append(img);
      await img.decode();
      canvas.width = canvas.height = 0;
    }
    // Keep the frame alive while the browser/native print dialog uses it.
    frame.contentWindow!.addEventListener('afterprint', () => frame.remove(), { once: true });
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 600000);
  } catch (error) {
    frame.remove();
    throw error;
  } finally {
    await task.destroy();
  }
}
