const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld(
  'printPreview',
  Object.freeze({
    state: () => ipcRenderer.invoke('print-preview', 'state'),
    submit: (options) => ipcRenderer.invoke('print-preview', 'submit', options),
    cancel: () => ipcRenderer.invoke('print-preview', 'cancel'),
  }),
);
