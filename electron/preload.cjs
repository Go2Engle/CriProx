const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'criprox',
  Object.freeze({
    platform: process.platform,
    mpcRequest: (path, method, body) => ipcRenderer.invoke('mpc-request', { path, method, body }),
    deckRequest: (provider, id) => ipcRenderer.invoke('deck-request', { provider, id }),
    saveProject: (defaultName, data) => ipcRenderer.invoke('save-project', { defaultName, data }),
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
