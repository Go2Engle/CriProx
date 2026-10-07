import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FACTORY_PROJECT_DEFAULTS,
  manualGuideDefaultsMatch,
  projectDefaultsFrom,
  projectFromDefaults,
  sheetSettingsMatch,
  projectDefaultsMatch,
  updateDefaultSettings,
  defaultSettingsIssue,
  validateProjectDefaults,
  withManualGuideDefaults,
  withSheetSettingsDefaults,
} from '../src/lib/project-defaults';
import { DEFAULT_SETTINGS, type CardFace, type Project } from '../src/lib/types';
import { validateProject } from '../src/lib/project';

const backArtwork: CardFace = {
  name: 'Default back',
  image: 'https://cards.scryfall.io/default-back.png',
  preview: 'https://cards.scryfall.io/default-back.png',
};

test('project defaults capture every setting and optional shared back artwork', () => {
  const project: Project = {
    version: 1,
    name: 'Configured deck',
    entries: [],
    settings: {
      ...DEFAULT_SETTINGS,
      profile: 'nine',
      backsEnabled: true,
      backOffsetX: 0.75,
      backOffsetY: -0.5,
      manualCutCorrectionX: 1.25,
      manualCutCorrectionY: -1,
      dpi: 1200,
      upscaleScryfall: true,
      upscaleBackend: 'upscayl',
    },
    backArtwork,
  };

  const defaults = projectDefaultsFrom(project);
  assert.deepEqual(defaults.settings, project.settings);
  assert.deepEqual(defaults.backArtwork, backArtwork);

  const fresh = projectFromDefaults(defaults);
  assert.equal(fresh.name, 'Untitled deck');
  assert.deepEqual(fresh.entries, []);
  assert.deepEqual(fresh.settings, project.settings);
  assert.deepEqual(fresh.backArtwork, backArtwork);

  fresh.settings.dpi = 300;
  if (fresh.backArtwork) fresh.backArtwork.name = 'Changed';
  assert.equal(defaults.settings.dpi, 1200);
  assert.equal(defaults.backArtwork?.name, 'Default back');
});

test('stored project defaults use project validation and migration', () => {
  const validated = validateProjectDefaults({
    version: 1,
    settings: { ...DEFAULT_SETTINGS, radius: 3, backOffsetX: 0.5 },
  });
  assert.equal(validated.settings.radius, 2.5);
  assert.equal(validated.settings.backOffsetX, 0.5);
  assert.throws(() =>
    validateProjectDefaults({
      version: 1,
      settings: { ...DEFAULT_SETTINGS, manualCutCorrectionY: 20 },
    }),
  );
  assert.throws(() => validateProjectDefaults({ version: 2, settings: DEFAULT_SETTINGS }));
});

test('factory project defaults produce independent settings', () => {
  const first = projectFromDefaults(FACTORY_PROJECT_DEFAULTS);
  const second = projectFromDefaults(FACTORY_PROJECT_DEFAULTS);
  first.settings.units = 'mm';
  assert.equal(second.settings.units, 'in');
});

test('saving manual guide defaults changes only guide settings', () => {
  const defaults = projectDefaultsFrom({
    settings: { ...DEFAULT_SETTINGS, machine: 'maker', dpi: 600 },
    backArtwork,
  });
  const edited = {
    ...DEFAULT_SETTINGS,
    machine: 'manual' as const,
    profile: 'nine' as const,
    manualGuidesEnabled: false,
    manualGuideColor: '#39ff14',
    manualGuidePageColor: '#444444',
    manualGuideWidthPx: 2,
    manualGuidePlacement: 'inside' as const,
    manualGuideCardStyle: 'corners' as const,
    manualGuideLineStyle: 'dashed' as const,
    manualGuideCornerStyle: 'round' as const,
    manualGuideLengthMm: 12,
    manualGuidePageStyle: 'full' as const,
  };
  assert.equal(manualGuideDefaultsMatch(edited, defaults.settings), false);
  const updated = withManualGuideDefaults(defaults, edited);
  assert.equal(manualGuideDefaultsMatch(edited, updated.settings), true);
  assert.deepEqual(
    [
      updated.settings.manualGuidesEnabled,
      updated.settings.manualGuideColor,
      updated.settings.manualGuidePageColor,
      updated.settings.manualGuideWidthPx,
      updated.settings.manualGuidePlacement,
      updated.settings.manualGuideCardStyle,
      updated.settings.manualGuideLineStyle,
      updated.settings.manualGuideCornerStyle,
      updated.settings.manualGuideLengthMm,
      updated.settings.manualGuidePageStyle,
    ],
    [false, '#39ff14', '#444444', 2, 'inside', 'corners', 'dashed', 'round', 12, 'full'],
  );
  assert.equal(updated.settings.machine, 'maker');
  assert.equal(updated.settings.profile, 'expanded');
  assert.equal(updated.settings.dpi, 600);
  assert.deepEqual(updated.backArtwork, backArtwork);
  assert.equal(defaults.settings.manualGuideColor, DEFAULT_SETTINGS.manualGuideColor);
  assert.equal(defaults.settings.manualGuidePageColor, DEFAULT_SETTINGS.manualGuidePageColor);
  assert.deepEqual(projectFromDefaults(updated).settings, updated.settings);
  assert.equal(
    manualGuideDefaultsMatch(
      { ...edited, manualGuideColor: '#39FF14', manualGuidePageColor: '#444444' },
      updated.settings,
    ),
    true,
  );
});

test('saving sheet setup defaults includes layout, print, and guide settings', () => {
  const defaults = projectDefaultsFrom({
    settings: { ...DEFAULT_SETTINGS },
    backArtwork,
  });
  const current = {
    ...DEFAULT_SETTINGS,
    machine: 'manual' as const,
    profile: 'nine' as const,
    paper: 'a4' as const,
    units: 'mm' as const,
    dpi: 1200 as const,
    backsEnabled: true,
    manualGuideCardStyle: 'full' as const,
  };

  const saved = withSheetSettingsDefaults(defaults, current);

  assert.equal(sheetSettingsMatch(defaults.settings, current), false);
  assert.equal(sheetSettingsMatch(saved.settings, current), true);
  assert.deepEqual(saved.settings, current);
  assert.equal(saved.settings.backsEnabled, true);
  assert.deepEqual(saved.backArtwork, backArtwork);
  assert.deepEqual(validateProjectDefaults(saved), saved);
  current.backsEnabled = false;
  assert.equal(saved.settings.backsEnabled, true);
});

test('sheet setup comparison detects print and guide changes', () => {
  assert.equal(sheetSettingsMatch(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, dpi: 600 }), false);
  assert.equal(
    sheetSettingsMatch(DEFAULT_SETTINGS, { ...DEFAULT_SETTINGS, manualGuidePageStyle: 'full' }),
    false,
  );
});

test('edited defaults persist all preferences and keep disabled back artwork', () => {
  const defaults = projectDefaultsFrom({
    settings: { ...DEFAULT_SETTINGS, dpi: 900, backOffsetX: 0.75, manualGuideColor: '#39ff14' },
  });
  const customBack = {
    ...backArtwork,
    image: 'data:image/png;base64,YmFjaw==',
    trim: 'mpc' as const,
  };
  const saved = projectDefaultsFrom({
    settings: {
      ...defaults.settings,
      upscaleScryfall: true,
      upscaleBackend: 'upscayl',
      backsEnabled: true,
    },
    backArtwork: customBack,
  });
  const restored = validateProjectDefaults(JSON.parse(JSON.stringify(saved)));
  const fresh = projectFromDefaults(restored);
  assert.equal(fresh.settings.upscaleScryfall, true);
  assert.equal(fresh.settings.upscaleBackend, 'upscayl');
  assert.equal(fresh.settings.backsEnabled, true);
  assert.equal(fresh.settings.dpi, 900);
  assert.equal(fresh.settings.backOffsetX, 0.75);
  assert.equal(fresh.settings.manualGuideColor, '#39ff14');
  assert.deepEqual(fresh.backArtwork, customBack);
  customBack.name = 'Changed later';
  assert.equal(saved.backArtwork?.name, 'Default back');
  assert.equal(defaults.settings.upscaleScryfall, false);
  assert.equal(sheetSettingsMatch(defaults.settings, fresh.settings), false);

  const disabled = projectDefaultsFrom({
    ...restored,
    settings: { ...restored.settings, backsEnabled: false },
  });
  assert.deepEqual(projectFromDefaults(disabled).backArtwork, restored.backArtwork);
  assert.equal(disabled.settings.backsEnabled, false);
  const removed = projectDefaultsFrom({ ...disabled, backArtwork: undefined });
  assert.equal(projectFromDefaults(removed).backArtwork, undefined);
});

test('older projects and saved defaults migrate to disabled built-in upscaling', () => {
  const {
    upscaleScryfall: _enabled,
    upscaleBackend: _backend,
    ...legacySettings
  } = DEFAULT_SETTINGS;
  const restored = validateProjectDefaults({
    version: 1,
    settings: { ...legacySettings },
    backArtwork,
  });
  assert.equal(restored.settings.upscaleScryfall, false);
  assert.equal(restored.settings.upscaleBackend, 'built-in');
  assert.deepEqual(restored.backArtwork, backArtwork);
  const project = validateProject({
    version: 1,
    name: 'Old deck',
    entries: [],
    settings: { ...legacySettings },
  });
  assert.equal(project.settings.upscaleScryfall, false);
  assert.equal(project.settings.upscaleBackend, 'built-in');
  for (const patch of [{ upscaleScryfall: 'true' }, { upscaleBackend: 'unknown' }]) {
    assert.throws(
      () => validateProjectDefaults({ version: 1, settings: { ...DEFAULT_SETTINGS, ...patch } }),
      /Invalid sheet settings/,
    );
  }
});

test('factory reset clears upscaling choices and shared artwork', () => {
  const factory = projectFromDefaults(FACTORY_PROJECT_DEFAULTS);
  assert.equal(factory.settings.upscaleScryfall, false);
  assert.equal(factory.settings.upscaleBackend, 'built-in');
  assert.equal(factory.settings.backsEnabled, false);
  assert.equal(factory.backArtwork, undefined);
});

test('editing defaults keeps dependent machine, paper, and layout choices valid', () => {
  const seven = updateDefaultSettings(DEFAULT_SETTINGS, { profile: 'seven' });
  assert.equal(seven.gap, 0.1);
  assert.equal(seven.bleed, 0.05);
  assert.equal(validateProjectDefaults({ version: 1, settings: seven }).settings.profile, 'seven');
  for (const patch of [{ paper: 'a4' as const }, { machine: 'joy-xtra' as const }]) {
    const updated = updateDefaultSettings(seven, patch);
    assert.equal(updated.profile, 'expanded');
    assert.equal(updated.gap, 1);
    assert.equal(updated.bleed, 0.5);
    assert.doesNotThrow(() => validateProjectDefaults({ version: 1, settings: updated }));
  }
  const manual = updateDefaultSettings(seven, { machine: 'manual' });
  assert.equal(manual.profile, 'nine');
  assert.deepEqual([manual.width, manual.height, manual.gap, manual.radius], [63, 88, 1, 2.5]);
  assert.doesNotThrow(() => validateProjectDefaults({ version: 1, settings: manual }));
  assert.equal(updateDefaultSettings(manual, { machine: 'maker' }).profile, 'nine');
  assert.equal(
    updateDefaultSettings(DEFAULT_SETTINGS, { backPrintMode: 'duplex' }).backRotation,
    0,
  );
  assert.equal(
    updateDefaultSettings(DEFAULT_SETTINGS, { backPrintMode: 'duplex', backRotation: 180 })
      .backRotation,
    180,
  );
  assert.equal(updateDefaultSettings(seven, { bleed: 0, profile: 'eight' }).bleed, 0);
});

test('editable alignment values report invalid ranges', () => {
  assert.equal(defaultSettingsIssue(DEFAULT_SETTINGS), undefined);
  assert.match(
    defaultSettingsIssue({ ...DEFAULT_SETTINGS, backOffsetX: 6 })?.message || '',
    /Back alignment X/,
  );
  assert.equal(
    defaultSettingsIssue({ ...DEFAULT_SETTINGS, manualCutCorrectionY: -6 })?.group,
    'Alignment',
  );
});

test('unsaved comparison includes artwork replacement, removal, and all settings', () => {
  const defaults = projectDefaultsFrom({ settings: DEFAULT_SETTINGS, backArtwork });
  assert.equal(
    projectDefaultsMatch(defaults, projectDefaultsFrom(projectFromDefaults(defaults))),
    true,
  );
  assert.equal(projectDefaultsMatch(defaults, { ...defaults, backArtwork: undefined }), false);
  assert.equal(
    projectDefaultsMatch(defaults, { ...defaults, backArtwork: { ...backArtwork, trim: 'mpc' } }),
    false,
  );
  assert.equal(
    projectDefaultsMatch(defaults, {
      ...defaults,
      settings: { ...defaults.settings, backOffsetY: -0.25 },
    }),
    false,
  );
});
