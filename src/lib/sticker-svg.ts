import { Parser } from 'htmlparser2';

const tags = new Set([
  'svg',
  'g',
  'path',
  'rect',
  'circle',
  'ellipse',
  'line',
  'polyline',
  'polygon',
  'defs',
  'clipPath',
  'linearGradient',
  'radialGradient',
  'stop',
  'title',
  'desc',
  'text',
  'tspan',
]);
const attrs = new Set([
  'xmlns',
  'xmlns:xlink',
  'id',
  'aria-label',
  'width',
  'height',
  'viewBox',
  'preserveAspectRatio',
  'transform',
  'd',
  'x',
  'y',
  'x1',
  'x2',
  'y1',
  'y2',
  'cx',
  'cy',
  'r',
  'rx',
  'ry',
  'points',
  'fill',
  'fill-rule',
  'fill-opacity',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-linecap',
  'stroke-linejoin',
  'stroke-miterlimit',
  'stroke-dasharray',
  'stroke-dashoffset',
  'opacity',
  'clip-path',
  'clip-rule',
  'clipPathUnits',
  'style',
  'offset',
  'stop-color',
  'stop-opacity',
  'gradientUnits',
  'gradientTransform',
  'spreadMethod',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'text-anchor',
  'dominant-baseline',
  'letter-spacing',
  'word-spacing',
  'dx',
  'dy',
  'version',
]);

/** Only passive, self-contained drawing primitives reach a browser image or hidden measuring SVG. */
export function validateStickerSvg(source: string): void {
  if (source.length > 10_000_000 || /<!DOCTYPE|<!ENTITY/i.test(source))
    throw new Error('Use a self-contained SVG under 10 MB without document entities.');
  let elements = 0,
    root = '';
  const parser = new Parser(
    {
      onopentag(name, attributes) {
        if (!elements++) root = name;
        if (elements > 100_000 || !tags.has(name))
          throw new Error(
            `Unsupported SVG element: ${name}. Export a plain SVG with text converted to paths, or use PNG.`,
          );
        for (const [key, value] of Object.entries(attributes)) {
          if (!attrs.has(key))
            throw new Error(`Unsupported SVG attribute: ${key}. Export a plain SVG or use PNG.`);
          if (key === 'xmlns' && value !== 'http://www.w3.org/2000/svg')
            throw new Error('Invalid SVG namespace.');
          if (key === 'xmlns:xlink' && value !== 'http://www.w3.org/1999/xlink')
            throw new Error('Invalid SVG namespace.');
          const withoutInternalRefs = value.replace(/url\(\s*(['"]?)#[a-zA-Z_][\w.-]*\1\s*\)/g, '');
          if (
            /url|\\|@import|expression\s*\(|javascript:|data:|https?:|\/\//i.test(
              withoutInternalRefs,
            ) &&
            !key.startsWith('xmlns')
          )
            throw new Error('SVG external resources and executable styles are not supported.');
          if (
            key === 'style' &&
            !value
              .split(';')
              .filter((v) => v.trim())
              .every((declaration) => {
                const split = declaration.indexOf(':');
                return (
                  split > 0 &&
                  attrs.has(declaration.slice(0, split).trim()) &&
                  !['style', 'xmlns', 'xmlns:xlink'].includes(declaration.slice(0, split).trim())
                );
              })
          )
            throw new Error('SVG contains unsupported styling. Export a plain SVG or use PNG.');
        }
      },
    },
    { xmlMode: true, decodeEntities: true },
  );
  parser.write(source);
  parser.end();
  if (root !== 'svg') throw new Error('Expected an SVG drawing.');
}

function mmLength(value: string | null): number | undefined {
  const match = value?.match(/^([\d.]+)\s*(mm|cm|in|pt|px)?$/);
  if (!match) return;
  const factor = { mm: 1, cm: 10, in: 25.4, pt: 25.4 / 72, px: 25.4 / 96 }[match[2] || 'px']!;
  const length = Number(match[1]) * factor;
  return Number.isFinite(length) && length > 0 ? length : undefined;
}
type SvgArtwork = { name: string; image: string; sizeMm?: { width: number; height: number } };

async function rasterize(
  root: SVGSVGElement,
  name: string,
  width: number,
  height: number,
): Promise<SvgArtwork> {
  if (![width, height].every((n) => Number.isFinite(n) && n > 0 && n <= 500))
    throw new Error('SVG dimensions must be between 0 and 500 mm.');
  const scale = Math.min(600 / 25.4, 6000 / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  root.setAttribute('width', String(canvas.width));
  root.setAttribute('height', String(canvas.height));
  const url = URL.createObjectURL(
    new Blob([new XMLSerializer().serializeToString(root)], { type: 'image/svg+xml' }),
  );
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Could not render the SVG.'));
      image.src = url;
    });
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { name, image: canvas.toDataURL('image/png'), sizeMm: { width, height } };
  } finally {
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}

export async function importStickerSvg(file: File, splitGroups = false): Promise<SvgArtwork[]> {
  if (file.size > 10_000_000) throw new Error('Use an SVG under 10 MB.');
  const source = await file.text();
  validateStickerSvg(source);
  const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
  if (parsed.querySelector('parsererror')) throw new Error('The SVG is not valid XML.');
  const root = parsed.documentElement as unknown as SVGSVGElement;
  const view = (root.getAttribute('viewBox') || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = mmLength(root.getAttribute('width')) ?? (view[2] * 25.4) / 96,
    height = mmLength(root.getAttribute('height')) ?? (view[3] * 25.4) / 96;
  if (!splitGroups) {
    // Without a viewBox the drawing uses CSS pixels, even when the outer size is in millimeters.
    if (!root.hasAttribute('viewBox'))
      root.setAttribute('viewBox', `0 0 ${(width * 96) / 25.4} ${(height * 96) / 25.4}`);
    return [await rasterize(root, file.name, width, height)];
  }
  if (view.length !== 4 || view.some((n) => !Number.isFinite(n)) || view[2] <= 0 || view[3] <= 0)
    throw new Error('Grouped SVG import requires a viewBox with physical dimensions.');
  const groups = Array.from(root.children).filter((node) => node.localName === 'g');
  if (
    !groups.length ||
    groups.length > 500 ||
    Array.from(root.children).some(
      (node) => !['g', 'defs', 'title', 'desc'].includes(node.localName),
    )
  )
    throw new Error(
      'Put each label in its own top-level group (up to 500), or import individual files.',
    );
  const measure = document.importNode(root, true);
  measure.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none';
  measure.setAttribute('aria-hidden', 'true');
  document.body.append(measure);
  try {
    const measured = Array.from(measure.children).filter(
      (node) => node.localName === 'g',
    ) as SVGGraphicsElement[];
    const result: SvgArtwork[] = [];
    let totalBytes = 0;
    for (const [index, group] of groups.entries()) {
      const localBox = measured[index].getBBox();
      const matrix = measured[index].transform.baseVal.consolidate()?.matrix;
      const corners = [
        [localBox.x, localBox.y],
        [localBox.x + localBox.width, localBox.y],
        [localBox.x, localBox.y + localBox.height],
        [localBox.x + localBox.width, localBox.y + localBox.height],
      ].map(([x, y]) =>
        matrix
          ? { x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f }
          : { x, y },
      );
      const left = Math.min(...corners.map((p) => p.x)),
        top = Math.min(...corners.map((p) => p.y));
      const box = {
        x: left,
        y: top,
        width: Math.max(...corners.map((p) => p.x)) - left,
        height: Math.max(...corners.map((p) => p.y)) - top,
      };
      const drawing = root.cloneNode(false) as SVGSVGElement;
      drawing.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
      for (const node of Array.from(root.children))
        if (node.localName === 'defs') drawing.append(node.cloneNode(true));
      const local = group.cloneNode(true) as Element;
      // Keep the group's transform and crop to transformed bounds, including rotation or scale.
      drawing.append(local);
      const artwork = await rasterize(
        drawing,
        group.id || `${file.name} ${index + 1}`,
        (box.width * width) / view[2],
        (box.height * height) / view[3],
      );
      totalBytes += artwork.image.length;
      if (totalBytes > 50_000_000)
        throw new Error('The rendered labels exceed 50 MB. Import smaller batches.');
      result.push(artwork);
    }
    return result;
  } finally {
    measure.remove();
  }
}
