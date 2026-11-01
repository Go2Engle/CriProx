const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { validateMaterial } = require('./cutter/materials.cjs');

// Read data only. Never load session credentials, execute Design Space code, or modify its files.
function normalizeMaterials(data) {
  const profiles = [],
    warnings = [];
  for (const section of ['dialSettings', 'customMaterials']) {
    const materials = data?.[section]?.materials;
    if (!Array.isArray(materials)) continue;
    for (const material of materials) {
      if (material.isSoftDeleted) continue;
      let added = 0;
      for (const machine of material.machineMaterials || []) {
        for (const tool of machine.tools || []) {
          if (!['dragKnife', 'deepCut', 'rollingBlade', 'tangentialBlade'].includes(tool.name))
            continue;
          const mode = tool.precisionMode;
          try {
            const passes = mode?.multiPass;
            if (!Number.isInteger(passes) || passes < 1 || passes > 10)
              throw Error('Invalid pass count');
            const pressures = mode?.multiPressure?.length
              ? mode.multiPressure
              : Array(passes).fill(mode?.pressure);
            const machineId = machine.machineTypeId;
            const sourceId = material._id || String(material.globalId);
            if (!/^[a-zA-Z0-9_-]{1,100}$/.test(sourceId)) throw Error('Invalid material ID');
            profiles.push(
              validateMaterial({
                id: `ds:${machineId}:${sourceId}:${tool.name}`,
                name: material.materialNameI18n || material.materialName,
                category: material.tag || '',
                machineId,
                machineName: machineId === 24 ? 'Cricut Explore 5' : machine.name,
                blade: tool.name,
                bladeName: tool.displayName || tool.name,
                source: 'design-space',
                pressure: mode.pressure,
                passes,
                pressures,
                adjustment: mode.deltaAdjustment?.length ? mode.deltaAdjustment : [0, 0, 0],
                motion: [mode.cutSpeed, mode.cutAccel, mode.moveToSpeed, mode.moveToAccel],
              }),
            );
            added++;
          } catch {
            warnings.push(
              `Could not import ${material.materialName || 'an unnamed material'} (${tool.name}).`,
            );
          }
        }
      }
      if (!added)
        warnings.push(
          `No supported cutting profile found for ${material.materialName || 'an unnamed material'}.`,
        );
    }
  }
  return { profiles, warnings };
}
async function importDesignSpaceMaterials({
  root = path.join(os.homedir(), '.cricut-design-space', 'LocalData'),
  io = fs,
} = {}) {
  const profiles = new Map(),
    warnings = [];
  const directories = async (p) =>
    (await io.readdir(p, { withFileTypes: true }))
      .filter((e) => e.isDirectory() && !e.isSymbolicLink())
      .map((e) => e.name);
  let accounts;
  try {
    accounts = await directories(root);
  } catch {
    throw Error(
      'No local Design Space materials found. Open Design Space, select your machine, and browse its materials, then try again.',
    );
  }
  let files = 0;
  for (const account of accounts) {
    const folder = path.join(root, account, 'MaterialSettings');
    let machines;
    try {
      machines = await directories(folder);
    } catch {
      continue;
    }
    for (const machine of machines) {
      const file = path.join(folder, machine, 'MaterialSettings');
      try {
        const info = await io.lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size > 20 * 1024 * 1024)
          throw Error('Invalid cache');
        const result = normalizeMaterials(JSON.parse(await io.readFile(file, 'utf8')));
        for (const profile of result.profiles) profiles.set(profile.id, profile);
        warnings.push(...result.warnings);
        files++;
      } catch {
        warnings.push(
          'A local material cache could not be read. Refresh materials in Design Space and retry.',
        );
      }
    }
  }
  if (!profiles.size)
    throw Error(
      'No cached cutting materials found. Open Design Space, select your machine, and browse its materials, then try again.',
    );
  return {
    profiles: [...profiles.values()].sort((a, b) => a.name.localeCompare(b.name)),
    warnings: [...new Set(warnings)],
    files,
  };
}
module.exports = { normalizeMaterials, importDesignSpaceMaterials };
