const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld(
  'criprox',
  Object.freeze({
    platform: process.platform,
    mpcRequest: (path, method, body) => ipcRenderer.invoke('mpc-request', { path, method, body }),
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
