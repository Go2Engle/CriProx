import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FACTORY_PROJECT_DEFAULTS,
  projectDefaultsFrom,
  projectFromDefaults,
  validateProjectDefaults,
} from '../src/lib/project-defaults';
import { DEFAULT_SETTINGS, type CardFace, type Project } from '../src/lib/types';

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
