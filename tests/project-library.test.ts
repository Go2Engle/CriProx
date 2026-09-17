import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import test from 'node:test';
import { DEFAULT_SETTINGS } from '../src/lib/types';

const require = createRequire(import.meta.url);
const {
  PROJECT_FILE,
  assertProjectId,
  deleteProject,
  importProjects,
  listProjects,
  openProject,
  projectDirectoryName,
  saveProject,
} = require('../electron/project-library.cjs') as {
  PROJECT_FILE: string;
  assertProjectId: (value: unknown) => string;
  deleteProject: (
    root: string,
    projectId: string,
    moveToTrash: (directory: string) => Promise<void>,
  ) => Promise<void>;
  importProjects: (sourceRoot: string, destinationRoot: string) => Promise<ProjectSummary[]>;
  listProjects: (root: string) => Promise<ProjectSummary[]>;
  openProject: (root: string, projectId: string) => Promise<unknown>;
  projectDirectoryName: (name: string) => string;
  saveProject: (
    root: string,
    request: { projectId: string | null; data: string },
  ) => Promise<ProjectSummary>;
};

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRfoAAAAASUVORK5CYII=';
const project = {
  version: 1 as const,
  name: 'My Commander: Deck / 2026',
  settings: DEFAULT_SETTINGS,
  entries: [
    {
      id: 'entry-1',
      quantity: 2,
      face: 0,
      card: {
        id: 'card-1',
        name: 'Local card',
        set: 'local',
        setName: 'Your artwork',
        collector: '',
        faces: [{ name: 'Local card', image: tinyPng, preview: tinyPng }],
      },
    },
  ],
};

test('project folder names and identifiers are portable and path-safe', () => {
  assert.equal(projectDirectoryName(project.name), 'my-commander-deck-2026');
  assert.equal(projectDirectoryName('Crème brûlée'), 'creme-brulee');
  assert.equal(projectDirectoryName('...'), 'untitled-project');
  assert.equal(assertProjectId('safe-project-2'), 'safe-project-2');
  for (const unsafe of ['../escape', '/absolute', 'two words', '', 'UPPER'])
    assert.throws(() => assertProjectId(unsafe));
});

test('managed projects save custom artwork as assets and hydrate it when opened', async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'criprox-library-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const first = await saveProject(root, { projectId: null, data: JSON.stringify(project) });
  assert.equal(first.id, 'my-commander-deck-2026');
  assert.equal(first.cardCount, 2);

  const projectFile = path.join(root, first.id, PROJECT_FILE);
  const stored = JSON.parse(await fs.readFile(projectFile, 'utf8'));
  const storedImage = stored.entries[0].card.faces[0].image as string;
  assert.match(storedImage, /^assets\/[a-f0-9]{24}\.png$/);
  assert.equal(stored.entries[0].card.faces[0].preview, storedImage);
  assert.deepEqual(await fs.readdir(path.join(root, first.id, 'assets')), [
    path.basename(storedImage),
  ]);

  const opened = (await openProject(root, first.id)) as typeof project;
  assert.equal(opened.entries[0].card.faces[0].image, tinyPng);
  assert.equal(opened.entries[0].card.faces[0].preview, tinyPng);

  const renamed = { ...project, name: 'Renamed deck' };
  await saveProject(root, { projectId: first.id, data: JSON.stringify(renamed) });
  const projects = await listProjects(root);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].id, first.id);
  assert.equal(projects[0].name, 'Renamed deck');

  await fs.writeFile(path.join(root, first.id, storedImage), 'corrupted');
  await assert.rejects(
    saveProject(root, { projectId: first.id, data: JSON.stringify(project) }),
    /corrupted/,
  );
});

test('managed projects allocate a non-destructive suffix for duplicate names', async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'criprox-library-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  const first = await saveProject(root, { projectId: null, data: JSON.stringify(project) });
  const second = await saveProject(root, { projectId: null, data: JSON.stringify(project) });
  assert.equal(first.id, 'my-commander-deck-2026');
  assert.equal(second.id, 'my-commander-deck-2026-2');
});

test('legacy project import copies hydrated projects and keeps the originals', async (t) => {
  const sourceRoot = await fs.mkdtemp(path.join(tmpdir(), 'criprox-documents-library-'));
  const destinationRoot = await fs.mkdtemp(path.join(tmpdir(), 'criprox-app-library-'));
  t.after(() =>
    Promise.all([
      fs.rm(sourceRoot, { recursive: true, force: true }),
      fs.rm(destinationRoot, { recursive: true, force: true }),
    ]),
  );

  const source = await saveProject(sourceRoot, {
    projectId: null,
    data: JSON.stringify(project),
  });
  const imported = await importProjects(sourceRoot, destinationRoot);

  assert.equal(imported.length, 1);
  assert.equal(imported[0].name, project.name);
  assert.equal((await listProjects(sourceRoot)).length, 1);
  const opened = (await openProject(destinationRoot, imported[0].id)) as typeof project;
  assert.equal(opened.entries[0].card.faces[0].image, tinyPng);
  assert.equal(source.id, imported[0].id);
});

test(
  'managed project reads reject symlinked project and artwork files',
  { skip: process.platform === 'win32' },
  async (t) => {
    const root = await fs.mkdtemp(path.join(tmpdir(), 'criprox-library-'));
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const saved = await saveProject(root, { projectId: null, data: JSON.stringify(project) });
    const directory = path.join(root, saved.id);
    const projectFile = path.join(directory, PROJECT_FILE);
    const stored = JSON.parse(await fs.readFile(projectFile, 'utf8'));
    const artworkFile = path.join(directory, stored.entries[0].card.faces[0].image);
    const realArtworkFile = `${artworkFile}.real`;

    await fs.rename(artworkFile, realArtworkFile);
    await fs.symlink(path.basename(realArtworkFile), artworkFile);
    await assert.rejects(openProject(root, saved.id), /Managed artwork is invalid/);
    await fs.unlink(artworkFile);
    await fs.rename(realArtworkFile, artworkFile);

    const realProjectFile = `${projectFile}.real`;
    await fs.rename(projectFile, realProjectFile);
    await fs.symlink(path.basename(realProjectFile), projectFile);
    await assert.rejects(openProject(root, saved.id), /Project data is invalid/);
  },
);

test('project deletion delegates the validated project folder to a recoverable trash action', async (t) => {
  const root = await fs.mkdtemp(path.join(tmpdir(), 'criprox-library-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'unrelated-folder'));
  let unrelatedWasDeleted = false;
  await assert.rejects(
    deleteProject(root, 'unrelated-folder', async () => {
      unrelatedWasDeleted = true;
    }),
  );
  assert.equal(unrelatedWasDeleted, false);

  const saved = await saveProject(root, { projectId: null, data: JSON.stringify(project) });
  const expectedDirectory = path.join(root, saved.id);
  let deletedDirectory = '';

  await deleteProject(root, saved.id, async (directory) => {
    deletedDirectory = directory;
    await fs.rename(directory, `${directory}.trashed`);
  });

  assert.equal(deletedDirectory, expectedDirectory);
  assert.deepEqual(await listProjects(root), []);
});
