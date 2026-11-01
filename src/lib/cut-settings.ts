import {
  materialForSettings,
  passPressures,
  validateMaterial,
  type MaterialProfile,
} from '../../electron/cutter/materials.cjs';
export {
  MAX_CUT_PASSES,
  BUILTIN_MATERIALS,
  materialForSettings,
  passPressures,
  directCutIssue,
  validateMaterial,
} from '../../electron/cutter/materials.cjs';
export type { MaterialProfile } from '../../electron/cutter/materials.cjs';
export const CUT_PRESSURES = ['light', 'medium', 'hard'] as const;
export type CutPressure = (typeof CUT_PRESSURES)[number];
export type CutSettings = {
  cutPressure: CutPressure;
  cutPasses: number;
  cutMaterial: string;
  cutProfile?: MaterialProfile;
};
export const DEFAULT_CUT_SETTINGS: CutSettings = {
  cutPressure: 'medium',
  cutPasses: 1,
  cutMaterial: 'white-sticker-paper',
};
export const CUT_PRESSURE_LABELS: Record<CutPressure, string> = {
  light: 'Light',
  medium: 'Medium',
  hard: 'Hard',
};
export function readCutSettings(value: {
  cutPressure?: unknown;
  cutPasses?: unknown;
  cutMaterial?: unknown;
  cutProfile?: unknown;
}): CutSettings {
  const settings = {
    cutPressure:
      value.cutPressure === undefined ? DEFAULT_CUT_SETTINGS.cutPressure : value.cutPressure,
    cutPasses: value.cutPasses === undefined ? DEFAULT_CUT_SETTINGS.cutPasses : value.cutPasses,
    cutMaterial:
      value.cutMaterial === undefined ? DEFAULT_CUT_SETTINGS.cutMaterial : value.cutMaterial,
    ...(value.cutProfile === undefined ? {} : { cutProfile: validateMaterial(value.cutProfile) }),
  } as CutSettings;
  materialForSettings(settings);
  passPressures(settings);
  return settings;
}
export function selectMaterial(profile: MaterialProfile): CutSettings {
  const snapshot = validateMaterial(profile);
  return {
    cutMaterial: snapshot.id,
    cutProfile: snapshot,
    cutPressure: 'medium',
    cutPasses: snapshot.passes,
  };
}
export function cutPressureGrams(value: CutSettings) {
  return passPressures(readCutSettings(value))[0];
}
export function cutSettingsSummary(value: CutSettings) {
  const settings = readCutSettings(value),
    profile = materialForSettings(settings);
  return `${CUT_PRESSURE_LABELS[settings.cutPressure]} pressure · ${settings.cutPasses} ${settings.cutPasses === 1 ? 'pass' : 'passes'} · ${profile.name} · ${passPressures(settings).join(' / ')} g · ${profile.machineName} · ${profile.bladeName}`;
}
