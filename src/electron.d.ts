export {};

declare global {
  const __APP_VERSION__: string;

  type ReleaseUpdate = {
    currentVersion: string;
    latestVersion: string;
    releaseUrl: string;
  };

  type ProjectSummary = {
    id: string;
    name: string;
    cardCount: number;
    artworkCount: number;
    updatedAt: string;
  };

  type ProjectLibrarySnapshot = {
    root: string;
    isDefault: boolean;
    canImportDocumentsLibrary: boolean;
    projects: ProjectSummary[];
  };

  interface Window {
    criprox?: {
      platform?: 'darwin' | 'win32' | 'linux';
      mpcRequest: (path: string, method: 'GET' | 'POST', body?: unknown) => Promise<unknown>;
      deckRequest?: (provider: 'moxfield' | 'archidekt', id: string) => Promise<unknown>;
      saveProject?: (defaultName: string, data: string) => Promise<boolean>;
      projects?: {
        list: () => Promise<ProjectLibrarySnapshot>;
        chooseDirectory: () => Promise<ProjectLibrarySnapshot | null>;
        importDocuments: () => Promise<{
          imported: number;
          snapshot: ProjectLibrarySnapshot;
        }>;
        save: (
          projectId: string | null,
          data: string,
        ) => Promise<{ project: ProjectSummary; snapshot: ProjectLibrarySnapshot }>;
        open: (projectId: string) => Promise<string>;
        delete: (projectId: string) => Promise<ProjectLibrarySnapshot>;
        reveal: () => Promise<void>;
      };
      registrationTemplates?: {
        load: (
          templateId: string,
          slotCount: number,
        ) => Promise<{ name: string; capturedAt: string; pdf: ArrayBuffer } | null>;
        save: (
          templateId: string,
          slotCount: number,
          pdf: ArrayBuffer,
        ) => Promise<{ name: string; capturedAt: string }>;
      };
      releases?: {
        check: () => Promise<ReleaseUpdate | null>;
        open: (releaseUrl: string) => Promise<void>;
      };
      windowControls?: {
        minimize: () => Promise<boolean>;
        toggleMaximize: () => Promise<boolean>;
        close: () => Promise<boolean>;
        isMaximized: () => Promise<boolean>;
        onMaximizedChange: (callback: (maximized: boolean) => void) => () => void;
      };
    };
  }
}
