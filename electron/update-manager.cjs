const fs = require('node:fs/promises');
const { createReadStream } = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { findAvailableRelease } = require('./release-check.cjs');
const { formatReleaseNotes } = require('./release-notes.cjs');

function checksumFor(text, name) {
  const matches = text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([a-fA-F0-9]{64}) [ *](.+)$/);
    return match && match[2] === name ? [match[1].toLowerCase()] : [];
  });
  if (matches.length !== 1)
    throw new Error('The release does not include a valid checksum for this installer.');
  return matches[0];
}

async function fileChecksum(file, expectedSize) {
  const info = await fs.lstat(file);
  if (!info.isFile() || info.size !== expectedSize) throw new Error('Installer size changed.');
  const hash = crypto.createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

// All URLs and local paths stay in the main process. The renderer can request actions only.
function createUpdateManager({
  currentVersion,
  platform,
  arch,
  directory,
  fetchRelease = fetch,
  openInstaller,
  onInstallerOpened = () => {},
  notify = () => {},
  simulation = null,
}) {
  let state = {
    currentVersion,
    simulation,
    status: 'idle',
    update: null,
    lastChecked: null,
    transferred: 0,
    total: 0,
    error: '',
  };
  let available,
    checkedAt = 0,
    checkJob,
    downloadJob,
    controller,
    readyFile,
    readyHash,
    openJob;
  function publish(patch) {
    state = { ...state, ...patch };
    notify(snapshot());
  }
  function snapshot() {
    return { ...state, update: state.update ? { ...state.update } : null };
  }
  async function check(force = false) {
    if (downloadJob || openJob) return snapshot();
    if (checkJob) return checkJob;
    if (!force && checkedAt && Date.now() - checkedAt < 15 * 60 * 1000) return snapshot();
    const previousReady = state.status === 'ready' && readyFile;
    const previousName = available?.installer?.name;
    publish({ status: 'checking', error: '' });
    checkJob = (async () => {
      try {
        available = await findAvailableRelease(currentVersion, fetchRelease, platform, arch);
        checkedAt = Date.now();
        const update = available
          ? {
              currentVersion: available.currentVersion,
              latestVersion: available.latestVersion,
              releaseUrl: available.releaseUrl,
              releaseNotes: available.releaseNotes,
              ...formatReleaseNotes({
                version: available.latestVersion,
                name: available.releaseName,
                body: available.releaseNotes,
              }),
              publishedAt: available.publishedAt,
              installerName: available.installer?.name || null,
              downloadSize: available.installer?.size || null,
              canDownload: Boolean(available.installer && available.checksums),
            }
          : null;
        const keepReady = previousReady && previousName === available?.installer?.name;
        if (!keepReady) readyFile = readyHash = undefined;
        publish({
          status: keepReady ? 'ready' : available ? 'available' : 'up-to-date',
          update,
          lastChecked: new Date(checkedAt).toISOString(),
          transferred: 0,
          total: 0,
        });
      } catch {
        publish({
          status: 'error',
          error: 'Could not check for updates. Check your connection and try again.',
        });
      }
      return snapshot();
    })();
    try {
      return await checkJob;
    } finally {
      checkJob = null;
    }
  }
  async function download() {
    if (downloadJob) return downloadJob;
    if (checkJob) return snapshot();
    if (state.status === 'ready') return snapshot();
    if (!available?.installer || !available?.checksums)
      throw new Error(
        'No verified installer is available for this platform. View the release for manual downloads.',
      );
    controller = new AbortController();
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(30 * 60 * 1000)]);
    const { installer, checksums } = available;
    publish({ status: 'downloading', error: '', transferred: 0, total: installer.size });
    downloadJob = (async () => {
      let file;
      try {
        // This folder is reserved for downloads; remove leftovers from interrupted sessions.
        await fs.rm(directory, { recursive: true, force: true });
        await fs.mkdir(directory, { recursive: true });
        file = path.join(directory, installer.name);
        const partial = `${file}.partial`;
        const sums = await fetchRelease(checksums.url, { signal });
        if (!sums.ok || !sums.body)
          throw new Error('Could not download release checksums. Try again.');
        const parts = [];
        let sumSize = 0;
        for await (const chunk of sums.body) {
          sumSize += chunk.length;
          if (sumSize > 1024 ** 2) throw new Error('The release checksum file is too large.');
          parts.push(Buffer.from(chunk));
        }
        const expected = checksumFor(Buffer.concat(parts).toString('utf8'), installer.name);
        const response = await fetchRelease(installer.url, { signal });
        if (!response.ok || !response.body)
          throw new Error('Could not download the installer. Try again.');
        const hash = crypto.createHash('sha256');
        let transferred = 0,
          lastProgress = 0;
        const handle = await fs.open(partial, 'wx', 0o600);
        try {
          for await (const chunk of response.body) {
            signal.throwIfAborted();
            transferred += chunk.length;
            if (transferred > installer.size)
              throw new Error('The installer size does not match the release.');
            hash.update(chunk);
            // FileHandle.writeFile completes partial OS writes before accepting the next chunk.
            await handle.writeFile(chunk);
            if (Date.now() - lastProgress > 100) {
              publish({ transferred });
              lastProgress = Date.now();
            }
          }
        } finally {
          await handle.close();
        }
        publish({ status: 'verifying', transferred });
        signal.throwIfAborted();
        if (transferred !== installer.size || hash.digest('hex') !== expected)
          throw new Error(
            'Installer verification failed. The download was removed; try again or view the release.',
          );
        if (platform === 'linux') await fs.chmod(partial, 0o700);
        await fs.rename(partial, file);
        signal.throwIfAborted();
        readyFile = file;
        readyHash = expected;
        publish({ status: 'ready' });
      } catch (error) {
        readyFile = readyHash = undefined;
        await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
        publish({
          status: controller.signal.aborted ? 'cancelled' : 'error',
          error: controller.signal.aborted
            ? ''
            : error.name === 'TimeoutError'
              ? 'The download timed out. Try again.'
              : error.message,
        });
      }
      return snapshot();
    })();
    try {
      return await downloadJob;
    } finally {
      downloadJob = null;
      controller = null;
    }
  }
  async function cancel() {
    controller?.abort();
    if (downloadJob) await downloadJob;
    return snapshot();
  }
  async function open() {
    if (openJob) return openJob;
    if (state.status !== 'ready' || !readyFile)
      throw new Error('Download and verify an installer first.');
    openJob = (async () => {
      // Recheck the on-disk bytes immediately before handing the file to the OS.
      let verified = false;
      try {
        verified = (await fileChecksum(readyFile, available.installer.size)) === readyHash;
      } catch {}
      if (!verified) {
        readyFile = readyHash = undefined;
        await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
        publish({
          status: 'error',
          error: 'Installer verification failed. Download it again before opening.',
        });
        return snapshot();
      }
      try {
        const error = await openInstaller(readyFile);
        if (error) throw new Error(error);
        publish({ error: '' });
        if (error !== null) onInstallerOpened();
      } catch {
        publish({ error: 'Could not open the installer. Try again or view the release.' });
      }
      return snapshot();
    })();
    try {
      return await openJob;
    } finally {
      openJob = null;
    }
  }
  return { snapshot, check, download, cancel, open };
}

module.exports = { checksumFor, createUpdateManager };
