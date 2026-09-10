import { PRINT_DPI_OPTIONS, type Project } from './types';
const supportedImage = (url: unknown) =>
  typeof url === 'string' &&
  /^(https:\/\/(cards\.scryfall\.io\/|cdn\.mpcautofill\.com\/images\/google_drive\/(full|large)\/)|data:image\/(png|jpeg|webp);base64,)/.test(
    url,
  );
export function validateProject(value: unknown): Project {
  const p = value as Project;
  if (
    !p ||
    p.version !== 1 ||
    typeof p.name !== 'string' ||
    p.name.length > 100 ||
    !Array.isArray(p.entries) ||
    !p.settings
  )
    throw new Error('This is not a supported CriProx project.');
  const s = p.settings;
  // Projects saved before display units and artwork bleed were added stay valid.
  s.units ??= s.paper === 'letter' ? 'in' : 'mm';
  s.bleed ??= 0;
  s.backBleedEnabled ??= true;
  s.backsEnabled ??= false;
  s.backPrintMode ??= 'manual';
  s.backFlip ??= 'long-edge';
  s.backRotation ??= s.backPrintMode === 'manual' ? 180 : 0;
  s.backOffsetX ??= 0;
  s.backOffsetY ??= 0;
  if (
    !['mm', 'in'].includes(s.units) ||
    !['letter', 'a4'].includes(s.paper) ||
    !['maker', 'explore', 'joy-xtra'].includes(s.machine) ||
    !['conservative', 'expanded'].includes(s.profile) ||
    !PRINT_DPI_OPTIONS.includes(s.dpi) ||
    typeof s.backBleedEnabled !== 'boolean' ||
    typeof s.backsEnabled !== 'boolean' ||
    !['manual', 'duplex'].includes(s.backPrintMode) ||
    !['long-edge', 'short-edge'].includes(s.backFlip) ||
    ![0, 180].includes(s.backRotation) ||
    typeof s.proxyLabel !== 'boolean'
  )
    throw new Error('Invalid sheet settings.');
  for (const [n, min, max] of [
    [s.width, 40, 100],
    [s.height, 40, 120],
    [s.gap, 1, 10],
    [s.radius, 0, 6],
    [s.bleed, 0, 1.5],
    [s.backOffsetX, -5, 5],
    [s.backOffsetY, -5, 5],
  ]) {
    if (!Number.isFinite(n) || n < min || n > max)
      throw new Error('Card dimensions are outside the supported range.');
  }
  if (s.bleed > s.gap / 2)
    throw new Error('Artwork bleed must fit within half of the card spacing.');
  if (
    p.backArtwork &&
    (typeof p.backArtwork.name !== 'string' ||
      ![p.backArtwork.image, p.backArtwork.preview].every((url) => supportedImage(url)))
  )
    throw new Error('Unsupported card-back artwork in project.');
  const ids = new Set<string>();
  for (const entry of p.entries) {
    const c = entry.card;
    if (
      typeof entry.id !== 'string' ||
      ids.has(entry.id) ||
      !Number.isInteger(entry.quantity) ||
      entry.quantity < 1 ||
      entry.quantity > 100 ||
      !c ||
      !['id', 'name', 'set', 'setName', 'collector'].every(
        (key) => typeof c[key as keyof typeof c] === 'string',
      ) ||
      !Array.isArray(c.faces) ||
      !c.faces.length ||
      c.faces.length > 2 ||
      !Number.isInteger(entry.face) ||
      entry.face < 0 ||
      entry.face >= c.faces.length
    )
      throw new Error('Invalid card entry.');
    ids.add(entry.id);
    for (const face of c.faces) {
      if (
        typeof face.name !== 'string' ||
        ![face.image, face.preview].every((url) => supportedImage(url))
      )
        throw new Error('Unsupported card image in project.');
    }
  }
  if (p.entries.reduce((sum, e) => sum + e.quantity, 0) > 500)
    throw new Error('Projects can contain up to 500 cards.');
  return p;
}
