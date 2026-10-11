import assert from 'node:assert/strict';
import test from 'node:test';
import {
  canMoveProjectToFolder,
  explorerProjects,
  projectFolder,
} from '../src/lib/project-explorer';

const projects: ProjectSummary[] = [
  { id: 'draft', name: 'Deck 10', cardCount: 5, artworkCount: 1, updatedAt: '2026-01-03' },
  {
    id: 'Commander/Budget/deck',
    name: 'Deck 2',
    cardCount: 100,
    artworkCount: 1,
    updatedAt: '2026-01-02',
  },
  { id: 'Commander/other', name: 'Elves', cardCount: 60, artworkCount: 1, updatedAt: '2026-01-01' },
];

test('project drops accept existing destinations and reject same-folder, stale and unknown targets', () => {
  const library = {
    projects,
    folders: [
      { id: 'Commander', name: 'Commander', parent: '' },
      { id: 'Commander/Budget', name: 'Budget', parent: 'Commander' },
    ],
  };
  assert.equal(canMoveProjectToFolder(library, 'draft', 'Commander'), true);
  assert.equal(canMoveProjectToFolder(library, projects[1].id, ''), true);
  assert.equal(canMoveProjectToFolder(library, projects[1].id, 'Commander'), true);
  assert.equal(canMoveProjectToFolder(library, projects[1].id, 'Commander/Budget'), false);
  assert.equal(canMoveProjectToFolder(library, 'draft', ''), false);
  assert.equal(canMoveProjectToFolder(library, 'missing', 'Commander'), false);
  assert.equal(canMoveProjectToFolder(library, 'draft', '../outside'), false);
  assert.equal(canMoveProjectToFolder(library, null, 'Commander'), false);
  assert.equal(canMoveProjectToFolder(null, 'draft', 'Commander'), false);
});

test('folder browsing scopes projects while search spans the whole library', () => {
  assert.equal(projectFolder(projects[1].id), 'Commander/Budget');
  assert.deepEqual(
    explorerProjects(projects, '', '', false, 'updated').map((item) => item.id),
    ['draft'],
  );
  assert.deepEqual(
    explorerProjects(projects, 'Commander', '', false, 'updated').map((item) => item.name),
    ['Elves'],
  );
  assert.deepEqual(
    explorerProjects(projects, '', '  BUDGET deck ', false, 'updated').map((item) => item.name),
    ['Deck 2'],
  );
  assert.deepEqual(explorerProjects(projects, '', 'missing', true, 'updated'), []);
});

test('all-project sorting orders by recent save, natural name or card count without mutating the library', () => {
  assert.deepEqual(
    explorerProjects(projects, '', '', true, 'name').map((item) => item.name),
    ['Deck 2', 'Deck 10', 'Elves'],
  );
  assert.deepEqual(
    explorerProjects(projects, '', '', true, 'cards').map((item) => item.cardCount),
    [100, 60, 5],
  );
  assert.deepEqual(
    explorerProjects(projects, '', '   ', true, 'updated').map((item) => item.name),
    ['Deck 10', 'Deck 2', 'Elves'],
  );
  assert.equal(projects[0].name, 'Deck 10');
});
