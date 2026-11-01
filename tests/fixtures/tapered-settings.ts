import { newStickerProject } from '../../src/lib/stickers';
export const TAPERED_SETTINGS = {
  ...newStickerProject().settings,
  layout: 'tapered' as const,
  areaWidth: 180,
  areaHeight: 250,
  width: 42.5,
  height: 14.5,
  gap: 2,
  radius: 1,
  dpi: 600 as const,
};
