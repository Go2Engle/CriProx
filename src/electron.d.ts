export {};

declare global {
  const __APP_VERSION__: string;

  type ReleaseUpdate = {
    currentVersion: string;
    latestVersion: string;
    releaseUrl: string;
  };

  interface Window {
    criprox?: {
      platform?: 'darwin' | 'win32' | 'linux';
      mpcRequest: (path: string, method: 'GET' | 'POST', body?: unknown) => Promise<unknown>;
      saveProject?: (defaultName: string, data: string) => Promise<boolean>;
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
