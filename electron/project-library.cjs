const crypto = require('node:crypto');
const { constants: fsConstants } = require('node:fs');
const fs = require('node:fs/promises');
const path = require('node:path');

const PROJECT_FILE = 'project.criprox.json';
const MAX_PROJECT_BYTES = 100_000_000;
const MAX_ARTWORK_BYTES = 20_000_000;
const projectIdPattern = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const managedArtworkPattern = /^assets\/[a-f0-9]{24}\.(?:png|jpg|webp)$/;
const dataImagePattern = /^data:image\/(png|jpeg|webp);base64,([a-z0-9+/=]+)$/i;
const readOnlyNoFollow = fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW;

async function readRegularFile(filePath, { minBytes = 0, maxBytes, encoding, errorMessage }) {
  let handle;
  try {
    handle = await fs.open(filePath, readOnlyNoFollow);
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size < minBytes || stat.size > maxBytes)
      throw new Error(errorMessage);
    const contents = await handle.readFile(encoding);
    const bytesRead = Buffer.isBuffer(contents) ? contents.length : Buffer.byteLength(contents);
    if (bytesRead < minBytes || bytesRead > maxBytes) throw new Error(errorMessage);
    return { contents, stat };
  } catch (error) {
    if (error?.code === 'ELOOP' || error?.code === 'EMLINK') throw new Error(errorMessage);
    throw error;
  } finally {
    await handle?.close();
  }
}

function projectDirectoryName(name) {
  return (
    String(name || '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80)
      .replace(/-+$/g, '') || 'untitled-project'
  );
}

function assertProjectId(projectId) {
  if (typeof projectId !== 'string' || !projectIdPattern.test(projectId))
    throw new Error('Invalid project identifier.');
  return projectId;
}

function parseProjectData(data) {
  if (typeof data !== 'string' || Buffer.byteLength(data) > MAX_PROJECT_BYTES)
    throw new Error('Project data is invalid or exceeds 100 MB.');
  let project;
  try {
    project = JSON.parse(data);
  } catch {
    throw new Error('Project data is not valid JSON.');
  }
  if (
    !project ||
    project.version !== 1 ||
    typeof project.name !== 'string' ||
    project.name.length > 100 ||
    !Array.isArray(project.entries)
  )
    throw new Error('This is not a supported CriProx project.');
  return project;
}

function externalizeProject(project) {
  const savedProject = JSON.parse(JSON.stringify(project));
  const assets = new Map();

  function externalize(value) {
    if (typeof value !== 'string' || !value.startsWith('data:')) return value;
    const match = dataImagePattern.exec(value);
    if (!match) throw new Error('Unsupported embedded artwork in project.');
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > MAX_ARTWORK_BYTES)
      throw new Error('Embedded artwork is invalid or exceeds 20 MB.');
    const extension = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
    const filename = `${crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 24)}.${extension}`;
    const relativePath = `assets/${filename}`;
    assets.set(relativePath, bytes);
    return relativePath;
  }

  function externalizeFace(face) {
    if (!face || typeof face !== 'object') return;
    face.image = externalize(face.image);
    face.preview = externalize(face.preview);
  }

  for (const entry of savedProject.entries) {
    if (!Array.isArray(entry?.card?.faces)) continue;
    for (const face of entry.card.faces) externalizeFace(face);
  }
  externalizeFace(savedProject.backArtwork);
  return { project: savedProject, assets };
}

async function hydrateProjectAssets(project, projectDirectory) {
  const hydrated = JSON.parse(JSON.stringify(project));
  const cache = new Map();
  let hydratedBytes = 0;
  let checkedAssetsDirectory = false;

  async function hydrate(value) {
    if (typeof value !== 'string' || !value.startsWith('assets/')) return value;
    if (!managedArtworkPattern.test(value)) throw new Error('Invalid managed artwork path.');
    if (cache.has(value)) return cache.get(value);
    if (!checkedAssetsDirectory) {
      const assetsStat = await fs.lstat(path.join(projectDirectory, 'assets'));
      if (!assetsStat.isDirectory() || assetsStat.isSymbolicLink())
        throw new Error('Managed artwork folder is unavailable.');
      checkedAssetsDirectory = true;
    }
    const absolutePath = path.join(projectDirectory, ...value.split('/'));
    const { contents: bytes, stat } = await readRegularFile(absolutePath, {
      minBytes: 1,
      maxBytes: MAX_ARTWORK_BYTES,
      errorMessage: 'Managed artwork is invalid or exceeds 20 MB.',
    });
    hydratedBytes += stat.size;
    if (hydratedBytes > MAX_PROJECT_BYTES)
      throw new Error('Managed artwork exceeds the 100 MB project limit.');
    const extension = path.extname(value).slice(1);
    const mime = extension === 'jpg' ? 'jpeg' : extension;
    const dataUrl = `data:image/${mime};base64,${bytes.toString('base64')}`;
    cache.set(value, dataUrl);
    return dataUrl;
  }

  async function hydrateFace(face) {
    if (!face || typeof face !== 'object') return;
    face.image = await hydrate(face.image);
    face.preview = await hydrate(face.preview);
  }

  for (const entry of hydrated.entries || []) {
    if (!Array.isArray(entry?.card?.faces)) continue;
    for (const face of entry.card.faces) await hydrateFace(face);
  }
  await hydrateFace(hydrated.backArtwork);
  return hydrated;
}

async function assertManagedProjectDirectory(root, projectId) {
  const directory = path.join(root, assertProjectId(projectId));
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error('Project folder is unavailable.');
  return directory;
}

async function allocateProjectDirectory(root, name) {
  const base = projectDirectoryName(name);
  for (let suffix = 1; suffix <= 999; suffix += 1) {
    const projectId = suffix === 1 ? base : `${base.slice(0, 75)}-${suffix}`;
    const directory = path.join(root, projectId);
    try {
      await fs.mkdir(directory);
      return { projectId, directory };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
    }
  }
  throw new Error('Could not create a unique project folder.');
}

function projectSummary(projectId, project, stat) {
  return {
    id: projectId,
    name: project.name,
    cardCount: project.entries.reduce(
      (total, entry) => total + (Number.isInteger(entry?.quantity) ? entry.quantity : 0),
      0,
    ),
    artworkCount: new Set(
      project.entries.flatMap((entry) =>
        Array.isArray(entry?.card?.faces)
          ? entry.card.faces.flatMap((face) => [face?.image, face?.preview])
          : [],
      ),
    ).size,
    updatedAt: stat.mtime.toISOString(),
  };
}

async function readProjectFile(projectDirectory) {
  const filePath = path.join(projectDirectory, PROJECT_FILE);
  const { contents, stat } = await readRegularFile(filePath, {
    minBytes: 1,
    maxBytes: MAX_PROJECT_BYTES,
    encoding: 'utf8',
    errorMessage: 'Project data is invalid or exceeds 100 MB.',
  });
  return { project: parseProjectData(contents), stat };
}

async function listProjects(root) {
  await fs.mkdir(root, { recursive: true });
  const entries = await fs.readdir(root, { withFileTypes: true });
  const projects = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !projectIdPattern.test(entry.name)) continue;
    try {
      const { project, stat } = await readProjectFile(path.join(root, entry.name));
      projects.push(projectSummary(entry.name, project, stat));
    } catch {
      // Ignore incomplete or unrelated directories in the selected library.
    }
  }
  return projects.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

async function saveProject(root, request) {
  await fs.mkdir(root, { recursive: true });
  const project = parseProjectData(request?.data);
  const existingId = request?.projectId;
  const allocated = existingId
    ? {
        projectId: assertProjectId(existingId),
        directory: await assertManagedProjectDirectory(root, existingId),
      }
    : await allocateProjectDirectory(root, project.name);
  const { project: savedProject, assets } = externalizeProject(project);
  const assetsDirectory = path.join(allocated.directory, 'assets');
  if (assets.size) {
    try {
      const assetsStat = await fs.lstat(assetsDirectory);
      if (!assetsStat.isDirectory() || assetsStat.isSymbolicLink())
        throw new Error('Managed artwork folder is unavailable.');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      await fs.mkdir(assetsDirectory);
    }
  }
  for (const [relativePath, bytes] of assets) {
    const target = path.join(allocated.directory, ...relativePath.split('/'));
    try {
      await fs.writeFile(target, bytes, { flag: 'wx' });
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const { contents: existing } = await readRegularFile(target, {
        minBytes: 1,
        maxBytes: MAX_ARTWORK_BYTES,
        errorMessage: 'Managed artwork file is unavailable.',
      });
      if (!existing.equals(bytes)) throw new Error('Managed artwork file is corrupted.');
    }
  }
  const target = path.join(allocated.directory, PROJECT_FILE);
  const temporary = path.join(allocated.directory, `.${PROJECT_FILE}.${crypto.randomUUID()}.tmp`);
  try {
    await fs.writeFile(temporary, JSON.stringify(savedProject, null, 2), 'utf8');
    await fs.rename(temporary, target);
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => {});
  }
  const stat = await fs.stat(target);
  return projectSummary(allocated.projectId, savedProject, stat);
}

async function openProject(root, projectId) {
  const directory = await assertManagedProjectDirectory(root, projectId);
  const { project } = await readProjectFile(directory);
  return hydrateProjectAssets(project, directory);
}

async function deleteProject(root, projectId, moveToTrash) {
  if (typeof moveToTrash !== 'function') throw new Error('Project deletion is unavailable.');
  const directory = await assertManagedProjectDirectory(root, projectId);
  await readProjectFile(directory);
  await moveToTrash(directory);
}

module.exports = {
  PROJECT_FILE,
  assertProjectId,
  deleteProject,
  externalizeProject,
  hydrateProjectAssets,
  listProjects,
  openProject,
  projectDirectoryName,
  saveProject,
};
