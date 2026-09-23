import type { CardFace, Project } from './types';

type ManagedProjectSaveResult = {
  project: ProjectSummary;
  snapshot: ProjectLibrarySnapshot;
};

export type ManagedProjectBridge = {
  beginSave: (
    projectId: string | null,
    name: string,
  ) => Promise<{ saveId: string; projectId: string }>;
  writeAsset: (saveId: string, dataUrl: string) => Promise<string>;
  finishSave: (saveId: string, data: string) => Promise<ManagedProjectSaveResult>;
  abortSave: (saveId: string) => Promise<void>;
  open: (projectId: string) => Promise<string>;
  readAsset: (projectId: string, relativePath: string) => Promise<string>;
};

function cloneForManagedSave(project: Project): Project {
  return {
    ...project,
    settings: { ...project.settings },
    entries: project.entries.map((entry) => ({
      ...entry,
      card: {
        ...entry.card,
        faces: entry.card.faces.map((face) => ({ ...face })),
      },
    })),
    backArtwork: project.backArtwork ? { ...project.backArtwork } : undefined,
  };
}

export async function saveManagedProject(
  bridge: ManagedProjectBridge,
  projectId: string | null,
  project: Project,
): Promise<ManagedProjectSaveResult> {
  const { saveId } = await bridge.beginSave(projectId, project.name);
  try {
    const stored = cloneForManagedSave(project);
    const assets = new Map<string, Promise<string>>();

    async function externalize(value: string) {
      if (!value.startsWith('data:')) return value;
      let pending = assets.get(value);
      if (!pending) {
        pending = bridge.writeAsset(saveId, value);
        assets.set(value, pending);
      }
      return pending;
    }

    async function externalizeFace(face: CardFace) {
      face.image = await externalize(face.image);
      face.preview = await externalize(face.preview);
    }

    for (const entry of stored.entries)
      for (const face of entry.card.faces) await externalizeFace(face);
    if (stored.backArtwork) await externalizeFace(stored.backArtwork);

    return await bridge.finishSave(saveId, JSON.stringify(stored));
  } catch (error) {
    await bridge.abortSave(saveId).catch(() => {});
    throw error;
  }
}

export async function openManagedProject(
  bridge: ManagedProjectBridge,
  projectId: string,
): Promise<unknown> {
  const project = JSON.parse(await bridge.open(projectId)) as Project;
  const assets = new Map<string, Promise<string>>();

  async function hydrate(value: string) {
    if (!value.startsWith('assets/')) return value;
    let pending = assets.get(value);
    if (!pending) {
      pending = bridge.readAsset(projectId, value);
      assets.set(value, pending);
    }
    return pending;
  }

  async function hydrateFace(face: CardFace) {
    face.image = await hydrate(face.image);
    face.preview = await hydrate(face.preview);
  }

  for (const entry of project.entries || []) {
    if (!Array.isArray(entry?.card?.faces)) continue;
    for (const face of entry.card.faces) await hydrateFace(face);
  }
  if (project.backArtwork) await hydrateFace(project.backArtwork);
  return project;
}
