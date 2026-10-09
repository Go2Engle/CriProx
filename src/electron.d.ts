export {};

declare global {
  const __APP_VERSION__: string;

  type ReleaseUpdate = {
    currentVersion: string;
    latestVersion: string;
    releaseUrl: string;
    releaseNotes: string;
    releaseHeading: string;
    releaseNotesHtml: string;
    publishedAt: string | null;
    installerName: string | null;
    downloadSize: number | null;
    canDownload: boolean;
  };

  type UpdateState = {
    simulation?: string | null;
    currentVersion: string;
    status:
      | 'idle'
      | 'checking'
      | 'available'
      | 'up-to-date'
      | 'downloading'
      | 'verifying'
      | 'ready'
      | 'cancelled'
      | 'error';
    update: ReleaseUpdate | null;
    lastChecked: string | null;
    transferred: number;
    total: number;
    error: string;
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
      upscayl?: {
        detect: () => Promise<{ cacheKey: string } | null>;
        run: (id: string, input: Uint8Array) => Promise<Uint8Array>;
        cancel: (id: string) => Promise<void>;
      };
      projects?: {
        list: () => Promise<ProjectLibrarySnapshot>;
        chooseDirectory: () => Promise<ProjectLibrarySnapshot | null>;
        importDocuments: () => Promise<{
          imported: number;
          snapshot: ProjectLibrarySnapshot;
        }>;
        beginSave: (
          projectId: string | null,
          name: string,
        ) => Promise<{ saveId: string; projectId: string }>;
        writeAsset: (saveId: string, dataUrl: string) => Promise<string>;
        finishSave: (
          saveId: string,
          data: string,
        ) => Promise<{ project: ProjectSummary; snapshot: ProjectLibrarySnapshot }>;
        abortSave: (saveId: string) => Promise<void>;
        open: (projectId: string) => Promise<string>;
        readAsset: (projectId: string, relativePath: string) => Promise<string>;
        delete: (projectId: string) => Promise<ProjectLibrarySnapshot>;
        reveal: () => Promise<void>;
      };
      registrationTemplates?: {
        load: (
          templateId: string,
          slotCount: number,
          templateName?: string,
        ) => Promise<{ name: string; capturedAt: string; pdf: ArrayBuffer } | null>;
        save: (
          templateId: string,
          slotCount: number,
          pdf: ArrayBuffer,
          templateName?: string,
        ) => Promise<{ name: string; capturedAt: string }>;
      };
      releases?: {
        check: () => Promise<UpdateState>;
        state: () => Promise<UpdateState>;
        checkNow: () => Promise<UpdateState>;
        download: () => Promise<UpdateState>;
        cancel: () => Promise<UpdateState>;
        openInstaller: () => Promise<UpdateState>;
        copyMacCommand: () => Promise<void>;
        openTerminal: () => Promise<void>;
        onState: (callback: (state: UpdateState) => void) => () => void;
        open: (releaseUrl: string) => Promise<void>;
        openLink: (url: string) => Promise<void>;
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
