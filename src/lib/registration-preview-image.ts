import type { RegistrationProfile } from './registration';
import { PT_PER_MM } from './registration';
import { fullTemplate } from './registration';
import type { Settings } from './types';

/** Remove the magenta setup slots from a captured-page thumbnail while preserving its real marks. */
export async function registrationPreviewImage(profile: RegistrationProfile, settings: Settings) {
  const image = new Image();
  image.src = profile.preview;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return profile.preview;
  ctx.drawImage(image, 0, 0);
  const sourceWidthMm = profile.pageWidthPt / PT_PER_MM,
    sourceHeightMm = profile.pageHeightPt / PT_PER_MM,
    full = fullTemplate(settings),
    x0 = Math.max(0, Math.floor(((profile.leftMm - 1) / sourceWidthMm) * canvas.width)),
    y0 = Math.max(0, Math.floor(((profile.topMm - 1) / sourceHeightMm) * canvas.height)),
    x1 = Math.min(
      canvas.width,
      Math.ceil(((profile.leftMm + full.width + 1) / sourceWidthMm) * canvas.width),
    ),
    y1 = Math.min(
      canvas.height,
      Math.ceil(((profile.topMm + full.height + 1) / sourceHeightMm) * canvas.height),
    ),
    pixels = ctx.getImageData(x0, y0, x1 - x0, y1 - y0);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const red = pixels.data[index],
      green = pixels.data[index + 1],
      blue = pixels.data[index + 2];
    if (red > 140 && blue > 120 && green < 220 && red > green * 1.2 && blue > green * 1.1) {
      pixels.data[index] = 255;
      pixels.data[index + 1] = 255;
      pixels.data[index + 2] = 255;
      pixels.data[index + 3] = 255;
    }
  }
  ctx.putImageData(pixels, x0, y0);
  const preview = canvas.toDataURL('image/png');
  canvas.width = canvas.height = 0;
  return preview;
}
