import assert from 'node:assert/strict';
import test from 'node:test';
import {
  openManagedProject,
  saveManagedProject,
  type ManagedProjectBridge,
} from '../src/lib/managed-project';
import { DEFAULT_SETTINGS, type Project } from '../src/lib/types';

function artwork(index: number) {
  return `data:image/png;base64,${Buffer.from(`artwork-${index}`).toString('base64')}`;
}

function largeCustomArtProject(count: number): Project {
  return {
    version: 1,
    name: 'Large custom deck',
    settings: { ...DEFAULT_SETTINGS },
    entries: Array.from({ length: count }, (_, index) => ({
      id: `entry-${index}`,
      quantity: 1,
      face: 0,
      card: {
        id: `card-${index}`,
        name: `Card ${index}`,
        set: 'local',
        setName: 'Your artwork',
        collector: '',
        faces: [
          {
            name: `Card ${index}`,
            image: artwork(index),
            preview: artwork(index),
          },
        ],
      },
    })),
  };
}

test('managed save streams large custom-art decks one unique asset at a time', async () => {
  const project = largeCustomArtProject(125);
  const written: string[] = [];
  let manifest = '';
  const bridge = {
    beginSave: async () => ({ saveId: 'save-1', projectId: 'large-custom-deck' }),
    writeAsset: async (_saveId: string, dataUrl: string) => {
      written.push(dataUrl);
      return `assets/${String(written.length).padStart(24, '0')}.png`;
    },
    finishSave: async (_saveId: string, data: string) => {
      manifest = data;
      return {
        project: {
          id: 'large-custom-deck',
          name: project.name,
          cardCount: project.entries.length,
          artworkCount: written.length,
          updatedAt: new Date(0).toISOString(),
        },
        snapshot: {
          root: '/projects',
          isDefault: true,
          canImportDocumentsLibrary: false,
          projects: [],
        },
      };
    },
    abortSave: async () => {},
  } as Pick<ManagedProjectBridge, 'beginSave' | 'writeAsset' | 'finishSave' | 'abortSave'>;

  await saveManagedProject(bridge as ManagedProjectBridge, null, project);

  assert.equal(written.length, 125);
  assert.equal(manifest.includes('data:image'), false);
  assert.equal(JSON.parse(manifest).entries.length, 125);
  assert.equal(project.entries[0].card.faces[0].image, artwork(0));
});

test('managed open hydrates each stored asset only once', async () => {
  const project = largeCustomArtProject(1);
  const relativePath = 'assets/000000000000000000000001.png';
  project.entries[0].card.faces[0].image = relativePath;
  project.entries[0].card.faces[0].preview = relativePath;
  let reads = 0;
  const bridge = {
    open: async () => JSON.stringify(project),
    readAsset: async () => {
      reads += 1;
      return artwork(1);
    },
  } as Pick<ManagedProjectBridge, 'open' | 'readAsset'>;

  const opened = (await openManagedProject(
    bridge as ManagedProjectBridge,
    'large-custom-deck',
  )) as Project;

  assert.equal(reads, 1);
  assert.equal(opened.entries[0].card.faces[0].image, artwork(1));
  assert.equal(opened.entries[0].card.faces[0].preview, artwork(1));
});
