const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'criprox',
  Object.freeze({
    platform: process.platform,
    mpcRequest: (path, method, body) => ipcRenderer.invoke('mpc-request', { path, method, body }),
    deckRequest: (provider, id) => ipcRenderer.invoke('deck-request', { provider, id }),
    saveProject: (defaultName, data) => ipcRenderer.invoke('save-project', { defaultName, data }),
    projects: Object.freeze({
      list: () => ipcRenderer.invoke('list-projects'),
      chooseDirectory: () => ipcRenderer.invoke('choose-projects-directory'),
      save: (projectId, data) => ipcRenderer.invoke('save-managed-project', { projectId, data }),
      open: (projectId) => ipcRenderer.invoke('open-managed-project', projectId),
      delete: (projectId) => ipcRenderer.invoke('delete-managed-project', projectId),
      reveal: () => ipcRenderer.invoke('reveal-project-library'),
    }),
    releases: Object.freeze({
      check: () => ipcRenderer.invoke('release-check'),
      open: (releaseUrl) => ipcRenderer.invoke('open-release-page', releaseUrl),
    }),
    windowControls: Object.freeze({
      minimize: () => ipcRenderer.invoke('window-control', 'minimize'),
      toggleMaximize: () => ipcRenderer.invoke('window-control', 'maximize'),
      close: () => ipcRenderer.invoke('window-control', 'close'),
      isMaximized: () => ipcRenderer.invoke('window-is-maximized'),
      onMaximizedChange: (callback) => {
        const listener = (_event, maximized) => callback(Boolean(maximized));
        ipcRenderer.on('window-maximized-change', listener);
        return () => ipcRenderer.removeListener('window-maximized-change', listener);
      },
    }),
  }),
);
