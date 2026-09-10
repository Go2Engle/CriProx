const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');

const mpcPaths = new Set(['/2/sources/', '/2/exploreSearch/']);
ipcMain.handle('mpc-request', async (_event, request) => {
  const { path: requestPath, method, body } = request || {};
  if (!mpcPaths.has(requestPath) || !['GET', 'POST'].includes(method))
    throw new Error('Unsupported MPC Autofill request.');
  const response = await fetch(new URL(requestPath, 'https://mpcfill.com/'), {
    method,
    headers: {
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || `MPC Autofill returned ${response.status}.`);
  return result;
});

function senderWindow(event) {
  const window = BrowserWindow.fromWebContents(event.sender);
  if (!window) throw new Error('Window is no longer available.');
  return window;
}

ipcMain.handle('window-control', (event, action) => {
  const window = senderWindow(event);
  if (action === 'minimize') window.minimize();
  else if (action === 'maximize') {
    if (window.isMinimized()) window.restore();
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  } else if (action === 'close') window.close();
  else throw new Error('Unsupported window action.');
  return window.isMaximized();
});

ipcMain.handle('window-is-maximized', (event) => senderWindow(event).isMaximized());

ipcMain.handle('save-project', async (event, request) => {
  const data = request?.data;
  if (typeof data !== 'string' || Buffer.byteLength(data) > 100_000_000)
    throw new Error('Project data is invalid or exceeds 100 MB.');
  const requestedName = typeof request?.defaultName === 'string' ? request.defaultName : 'project';
  const safeName = path.basename(requestedName).replace(/[^a-z0-9._-]+/gi, '-') || 'project';
  const defaultPath = safeName.endsWith('.criprox.json') ? safeName : `${safeName}.criprox.json`;
  const result = await dialog.showSaveDialog(senderWindow(event), {
    title: 'Save CriProx project',
    defaultPath,
    filters: [{ name: 'CriProx project', extensions: ['json'] }],
  });
  if (result.canceled || !result.filePath) return false;
  const target = result.filePath.toLowerCase().endsWith('.criprox.json')
    ? result.filePath
    : `${result.filePath.replace(/\.json$/i, '')}.criprox.json`;
  await fs.writeFile(target, data, 'utf8');
  return true;
});

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    minWidth: 900,
    minHeight: 660,
    frame: false,
    backgroundColor: '#f6f7f9',
    title: 'CriProx',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });
  const publishWindowState = () =>
    window.webContents.send('window-maximized-change', window.isMaximized());
  window.on('maximize', publishWindowState);
  window.on('unmaximize', publishWindowState);
  window.on('enter-full-screen', publishWindowState);
  window.on('leave-full-screen', publishWindowState);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\/(help\.cricut\.com|scryfall\.com|mpcfill\.com)\//.test(url))
      shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  window.loadFile(path.join(__dirname, '../dist/index.html'));
}
app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (!BrowserWindow.getAllWindows().length) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
