import { manualCutPlacement } from './manual-cut';
import { registeredOutputFrame } from './registered-pdf';
import { fullTemplate, PT_PER_MM, registrationKey, type RegistrationProfile } from './registration';
import type { Settings } from './types';

/** Approximation used only until Design Space marks have been captured. */
export const MOCK_REGISTRATION_MARKS = {
  offset: 8,
  thickness: 1.4,
  armLength: 22,
  cornerGap: 1.5,
} as const;

/** Preview page and artwork origin, in mm; captured frames match PDF export. */
export function sheetPreviewFrame(settings: Settings, profile?: RegistrationProfile) {
  if (settings.profile === 'nine') {
    const placement = manualCutPlacement(settings);
    return {
      paper: { w: placement.paper.width, h: placement.paper.height },
      left: placement.left,
      top: placement.top,
    };
  }
  if (profile?.key === registrationKey(settings)) {
    const frame = registeredOutputFrame(profile, settings),
      paper = { w: frame.pageWidthPt / PT_PER_MM, h: frame.pageHeightPt / PT_PER_MM };
    return {
      paper,
      left: frame.leftMm,
      top: frame.topMm,
      master: {
        left: frame.masterXPt / PT_PER_MM,
        top: paper.h - (frame.masterYPt + profile.pageHeightPt) / PT_PER_MM,
        width: profile.pageWidthPt / PT_PER_MM,
        height: profile.pageHeightPt / PT_PER_MM,
      },
    };
  }
  // A registered export needs a capture. Keep the uncaptured artwork and marks
  // within the output page, with the same slot geometry as the eventual export.
  const paper = settings.paper === 'letter' ? { w: 215.9, h: 279.4 } : { w: 210, h: 297 };
  const full = fullTemplate(settings);
  return {
    paper,
    left: (paper.w - full.width) / 2,
    top: Math.min(21.25, (paper.h - full.height) / 2),
  };
}
