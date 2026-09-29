import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grid, layout } from '../src/lib/layout';
import { validateProject } from '../src/lib/project';
import { DEFAULT_SETTINGS, type Entry, type Project } from '../src/lib/types';

const entry: Entry = {
  id: 'a',
  quantity: 5,
  face: 0,
  card: { id: 'c', name: 'Card', set: 'local', setName: 'Local', collector: '1', faces: [] },
};
const settings = { ...DEFAULT_SETTINGS, machine: 'silhouette' as const };

test('Silhouette four-card packing keeps artwork within a compact group', () => {
  assert.equal(grid(settings).capacity, 4);
  const sheets = layout([entry], settings);
  assert.equal(sheets.length, 2);
  assert.deepEqual([sheets[0].width, sheets[0].height], [127, 177]);
  assert.equal(sheets[0].placements.length, 4);
  assert.equal(sheets[1].placements.length, 1);
});

test('Silhouette eight-card layout keeps the Letter experiment at full card size', () => {
  const eight = { ...settings, profile: 'eight' as const, paper: 'letter' as const };
  const sheets = layout([{ ...entry, quantity: 9 }], eight);
  assert.equal(grid(eight).capacity, 8);
  assert.deepEqual([sheets[0].width, sheets[0].height], [177, 255]);
  assert.equal(sheets[0].placements.length, 8);
  assert.equal(sheets[1].placements.length, 1);
  const project: Project = { version: 1, name: 'Eight', entries: [], settings: eight };
  assert.equal(validateProject(project).settings.profile, 'eight');
  assert.throws(() => validateProject({ ...project, settings: { ...eight, paper: 'a4' } }));
});

test('Silhouette project and handoff remain distinct from Cricut registration', () => {
  const project: Project = { version: 1, name: 'Deck', entries: [], settings: { ...settings } };
  assert.equal(validateProject(project).settings.machine, 'silhouette');
  assert.throws(() => validateProject({ ...project, settings: { ...settings, profile: 'nine' } }));
  assert.throws(() =>
    validateProject({ ...project, settings: { ...settings, backsEnabled: true } }),
  );
});
