const path = require('node:path');

function projectLibraryPaths({ userData, documents }) {
  if (!path.isAbsolute(userData) || !path.isAbsolute(documents))
    throw new Error('Project library base folders must be absolute paths.');
  return {
    defaultRoot: path.join(userData, 'projects'),
    legacyRoot: path.join(documents, 'CriProx'),
    settingsFile: path.join(userData, 'project-library.json'),
    legacyImportMarker: path.join(userData, 'documents-library-imported.json'),
  };
}

module.exports = { projectLibraryPaths };
