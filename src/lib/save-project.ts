import type { Project } from './types';
import { download } from './export';

type WritableFile = {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
};
type SaveFileHandle = { createWritable: () => Promise<WritableFile> };
type SaveFilePicker = (options: {
  suggestedName: string;
  types: Array<{ description: string; accept: Record<string, string[]> }>;
}) => Promise<SaveFileHandle>;

export function projectFilename(name: string) {
  return `${name.replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'project'}.criprox.json`;
}

export async function saveProjectAs(project: Project): Promise<boolean> {
  const data = JSON.stringify(project, null, 2);
  const defaultName = projectFilename(project.name);
  if (window.criprox?.saveProject) return window.criprox.saveProject(defaultName, data);

  const picker = (window as typeof window & { showSaveFilePicker?: SaveFilePicker })
    .showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker.call(window, {
        suggestedName: defaultName,
        types: [
          {
            description: 'CriProx project',
            accept: { 'application/json': ['.criprox.json'] },
          },
        ],
      });
      const writable = await handle.createWritable();
      await writable.write(data);
      await writable.close();
      return true;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return false;
      throw error;
    }
  }

  download(new Blob([data], { type: 'application/json' }), defaultName);
  return true;
}
