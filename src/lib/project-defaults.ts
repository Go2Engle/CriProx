import { validateProject } from './project';
import { DEFAULT_SETTINGS, type CardFace, type Project, type Settings } from './types';

export type ProjectDefaults = {
  version: 1;
  settings: Settings;
  backArtwork?: CardFace;
};

export const FACTORY_PROJECT_DEFAULTS: ProjectDefaults = {
  version: 1,
  settings: { ...DEFAULT_SETTINGS },
};

const copyFace = (face?: CardFace) => (face ? { ...face } : undefined);

export function projectDefaultsFrom(project: Pick<Project, 'settings' | 'backArtwork'>) {
  return {
    version: 1 as const,
    settings: { ...project.settings },
    backArtwork: copyFace(project.backArtwork),
  };
}

export function projectFromDefaults(defaults: ProjectDefaults): Project {
  return {
    version: 1,
    name: 'Untitled deck',
    entries: [],
    settings: { ...defaults.settings },
    backArtwork: copyFace(defaults.backArtwork),
  };
}

export function validateProjectDefaults(value: unknown): ProjectDefaults {
  const candidate = value as Partial<ProjectDefaults> | null;
  if (!candidate || candidate.version !== 1 || !candidate.settings)
    throw new Error('These are not supported CriProx project defaults.');

  const project = validateProject({
    version: 1,
    name: 'Project defaults',
    entries: [],
    settings: { ...candidate.settings },
    backArtwork: copyFace(candidate.backArtwork),
  });
  return projectDefaultsFrom(project);
}
