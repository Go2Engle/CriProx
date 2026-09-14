import type { Settings } from './types';

export function paperWorkflow(settings: Pick<Settings, 'paper' | 'profile'>) {
  if (settings.paper === 'a4')
    return {
      designSpacePaper: 'A4',
      systemPaper: 'A4',
      usesLetterHack: false,
    } as const;
  return {
    designSpacePaper: 'Tabloid (11 × 17 in)',
    systemPaper: 'US Letter',
    usesLetterHack: true,
  } as const;
}
