import type { Settings } from './types';

export function paperWorkflow(settings: Pick<Settings, 'paper' | 'profile'>) {
  if (settings.paper === 'a4')
    return {
      designSpacePaper: 'A4',
      systemPaper: 'A4',
      usesLetterHack: false,
      capturesTabloid: false,
    } as const;
  if (settings.profile === 'nine')
    return {
      designSpacePaper: 'US Letter',
      systemPaper: 'US Letter',
      usesLetterHack: false,
      capturesTabloid: false,
    } as const;
  if (settings.profile === 'eight')
    return {
      designSpacePaper: 'Tabloid (11 × 17 in)',
      systemPaper: 'Tabloid (11 × 17 in)',
      usesLetterHack: true,
      capturesTabloid: true,
    } as const;
  return {
    designSpacePaper: 'Tabloid (11 × 17 in)',
    systemPaper: 'US Letter',
    usesLetterHack: true,
    capturesTabloid: false,
  } as const;
}
