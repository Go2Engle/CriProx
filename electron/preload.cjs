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
      importDocuments: () => ipcRenderer.invoke('import-documents-projects'),
      beginSave: (projectId, name) =>
        ipcRenderer.invoke('begin-managed-project-save', { projectId, name }),
      writeAsset: (saveId, dataUrl) =>
        ipcRenderer.invoke('write-managed-project-asset', { saveId, dataUrl }),
      finishSave: (saveId, data) =>
        ipcRenderer.invoke('finish-managed-project-save', { saveId, data }),
      abortSave: (saveId) => ipcRenderer.invoke('abort-managed-project-save', saveId),
      open: (projectId) => ipcRenderer.invoke('open-managed-project', projectId),
      readAsset: (projectId, relativePath) =>
        ipcRenderer.invoke('read-managed-project-asset', { projectId, relativePath }),
      delete: (projectId) => ipcRenderer.invoke('delete-managed-project', projectId),
      reveal: () => ipcRenderer.invoke('reveal-project-library'),
    }),
    registrationTemplates: Object.freeze({
      load: (templateId, slotCount) =>
        ipcRenderer.invoke('load-registration-template', { templateId, slotCount }),
      save: (templateId, slotCount, pdf) =>
        ipcRenderer.invoke('save-registration-template', { templateId, slotCount, pdf }),
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
