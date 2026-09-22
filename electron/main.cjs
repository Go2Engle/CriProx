const { app, BrowserWindow, dialog, ipcMain, Menu, net, shell } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { deckSourceUrl } = require('./deck-source.cjs');
const { contextMenuTemplate } = require('./context-menu.cjs');
const { findAvailableRelease, isTrustedReleaseUrl } = require('./release-check.cjs');
const {
  assertProjectId,
  deleteProject,
  importProjects,
  listProjects,
  openProject,
  saveProject,
} = require('./project-library.cjs');
const { projectLibraryPaths } = require('./project-library-paths.cjs');
const {
  loadRegistrationTemplate,
  saveRegistrationTemplate,
} = require('./registration-template-library.cjs');

const libraryPaths = () =>
  projectLibraryPaths({
    userData: app.getPath('userData'),
    documents: app.getPath('documents'),
  });
const librarySettingsFile = () => libraryPaths().settingsFile;
const defaultLibraryRoot = () => libraryPaths().defaultRoot;
const legacyLibraryRoot = () => libraryPaths().legacyRoot;
let configuredLibraryRoot;

async function getLibraryRoot() {
  if (configuredLibraryRoot) return configuredLibraryRoot;
  try {
    const settings = JSON.parse(await fs.readFile(librarySettingsFile(), 'utf8'));
    if (typeof settings.root === 'string' && path.isAbsolute(settings.root)) {
      configuredLibraryRoot = settings.root;
      return configuredLibraryRoot;
    }
  } catch {
    // The private application library is used until the user chooses another folder.
  }
  configuredLibraryRoot = defaultLibraryRoot();
  return configuredLibraryRoot;
}

async function setLibraryRoot(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root))
    throw new Error('Project library folder must be an absolute path.');
  await fs.mkdir(root, { recursive: true });
  await fs.mkdir(path.dirname(librarySettingsFile()), { recursive: true });
  await fs.writeFile(librarySettingsFile(), JSON.stringify({ root }, null, 2), 'utf8');
  configuredLibraryRoot = root;
}

async function projectLibrarySnapshot() {
  const root = await getLibraryRoot();
  let canImportDocumentsLibrary = false;
  if (process.platform === 'darwin' && root !== legacyLibraryRoot()) {
    try {
      await fs.access(libraryPaths().legacyImportMarker);
    } catch {
      canImportDocumentsLibrary = true;
    }
  }
  return {
    root,
    isDefault: root === defaultLibraryRoot(),
    canImportDocumentsLibrary,
    projects: await listProjects(root),
  };
}

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

ipcMain.handle('deck-request', async (_event, request) => {
  const requestUrl = deckSourceUrl(request);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  let response;
  try {
    response = await net.fetch(requestUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': `CriProx/${app.getVersion()} (+https://github.com/Go2Engle/CriProx)`,
      },
      credentials: 'omit',
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`${request.provider} returned ${response.status}.`);
  const body = await response.text();
  if (body.length > 10_000_000) throw new Error('Deck response exceeds 10 MB.');
  try {
    return JSON.parse(body);
  } catch {
    throw new Error('Deck source returned invalid JSON.');
  }
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

let releaseCheck;
ipcMain.handle('release-check', () => {
  releaseCheck ??= findAvailableRelease(app.getVersion()).catch(() => null);
  return releaseCheck;
});

ipcMain.handle('open-release-page', (_event, releaseUrl) => {
  if (!isTrustedReleaseUrl(releaseUrl)) throw new Error('Unsupported release URL.');
  return shell.openExternal(releaseUrl);
});

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

ipcMain.handle('list-projects', () => projectLibrarySnapshot());

ipcMain.handle('choose-projects-directory', async (event) => {
  const result = await dialog.showOpenDialog(senderWindow(event), {
    title: 'Choose CriProx projects folder',
    defaultPath: await getLibraryRoot(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  await setLibraryRoot(result.filePaths[0]);
  return projectLibrarySnapshot();
});

ipcMain.handle('import-documents-projects', async () => {
  const sourceRoot = legacyLibraryRoot();
  const destinationRoot = await getLibraryRoot();
  if (sourceRoot === destinationRoot)
    throw new Error('The Documents project library is already selected.');
  const imported = await importProjects(sourceRoot, destinationRoot);
  await fs.mkdir(path.dirname(libraryPaths().legacyImportMarker), { recursive: true });
  await fs.writeFile(
    libraryPaths().legacyImportMarker,
    JSON.stringify({ importedAt: new Date().toISOString(), projects: imported.length }, null, 2),
    'utf8',
  );
  return { imported: imported.length, snapshot: await projectLibrarySnapshot() };
});

ipcMain.handle('save-managed-project', async (_event, request) => {
  const root = await getLibraryRoot();
  const project = await saveProject(root, request);
  return { project, snapshot: await projectLibrarySnapshot() };
});

ipcMain.handle('open-managed-project', async (_event, projectId) => {
  const project = await openProject(await getLibraryRoot(), assertProjectId(projectId));
  return JSON.stringify(project);
});

ipcMain.handle('delete-managed-project', async (_event, projectId) => {
  const root = await getLibraryRoot();
  await deleteProject(root, assertProjectId(projectId), (directory) => shell.trashItem(directory));
  return projectLibrarySnapshot();
});

ipcMain.handle('reveal-project-library', async () => {
  const root = await getLibraryRoot();
  await fs.mkdir(root, { recursive: true });
  const error = await shell.openPath(root);
  if (error) throw new Error(error);
});

ipcMain.handle('load-registration-template', async (_event, request) =>
  loadRegistrationTemplate(await getLibraryRoot(), request),
);

ipcMain.handle('save-registration-template', async (_event, request) =>
  saveRegistrationTemplate(await getLibraryRoot(), request),
);

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
    else if (/^https:\/\/ko-fi\.com\/go2engle(?:\/|$)/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('context-menu', (_event, params) => {
    const template = contextMenuTemplate(params);
    if (template.length) Menu.buildFromTemplate(template).popup({ window });
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
