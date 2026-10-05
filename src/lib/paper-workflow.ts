import type { Settings } from './types';

export function availableSheetProfiles(settings: Pick<Settings, 'paper' | 'machine'>) {
  const profiles: Settings['profile'][] = [];
  if (settings.machine !== 'manual') profiles.push('expanded');
  if (settings.machine === 'maker' || settings.machine === 'explore') {
    if (settings.paper === 'letter') profiles.push('seven');
    profiles.push('eight');
  }
  profiles.push('nine');
  return profiles;
}

export function paperWorkflow(settings: Pick<Settings, 'paper' | 'profile'>) {
  const outputPaper = settings.paper === 'letter' ? 'US Letter' : 'A4';
  if (settings.profile === 'nine')
    return {
      outputPaper,
      designSpacePaper: outputPaper,
      systemPaper: outputPaper,
      usesTabloidSetup: false,
      capturesTabloid: false,
    } as const;
  if (settings.profile === 'eight')
    return {
      outputPaper,
      designSpacePaper: 'Tabloid (11 × 17 in)',
      systemPaper: 'Tabloid (11 × 17 in)',
      usesTabloidSetup: true,
      capturesTabloid: true,
    } as const;
  return {
    outputPaper,
    designSpacePaper: 'Tabloid (11 × 17 in)',
    systemPaper: outputPaper,
    usesTabloidSetup: true,
    capturesTabloid: false,
  } as const;
}
