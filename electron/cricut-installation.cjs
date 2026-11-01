const fs = require('node:fs/promises');
const path = require('node:path');

// Installation discovery only. Finding a native bridge does not establish machine connectivity.
async function findCricutInstallation({
  platform = process.platform,
  env = process.env,
  io = fs,
} = {}) {
  if (platform !== 'win32') return null;
  const roots = [
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs', 'Cricut Design Space'),
    env.USERPROFILE &&
      path.join(env.USERPROFILE, 'AppData', 'Local', 'Programs', 'Cricut Design Space'),
    env.ProgramFiles && path.join(env.ProgramFiles, 'Cricut Design Space'),
  ].filter(Boolean);
  for (const root of roots) {
    const executable = path.join(root, 'Cricut Design Space.exe');
    try {
      if (!(await io.stat(executable)).isFile()) continue;
    } catch {
      continue;
    }
    let version = null,
      bridgeInstalled = false;
    try {
      const text = (await io.readFile(path.join(root, 'version'), 'utf8')).trim();
      if (/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(text)) version = text;
    } catch {
      /* Version metadata is optional. */
    }
    try {
      bridgeInstalled = (
        await io.stat(
          path.join(root, 'resources', 'plugins', 'cricut-device-io', 'CricutDeviceIO.exe'),
        )
      ).isFile();
    } catch {
      /* Installed versions have different native runtimes. */
    }
    return { executable, version, bridgeInstalled };
  }
  return null;
}
module.exports = { findCricutInstallation };
