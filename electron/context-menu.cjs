function contextMenuTemplate(params = {}) {
  const editFlags = params.editFlags || {};
  const hasSelection = Boolean(params.selectionText);

  if (!params.isEditable) {
    return hasSelection ? [{ role: 'copy', enabled: true }] : [];
  }

  return [
    { role: 'undo', enabled: Boolean(editFlags.canUndo) },
    { role: 'redo', enabled: Boolean(editFlags.canRedo) },
    { type: 'separator' },
    { role: 'cut', enabled: Boolean(editFlags.canCut) },
    { role: 'copy', enabled: Boolean(editFlags.canCopy) },
    { role: 'paste', enabled: Boolean(editFlags.canPaste) },
    { role: 'delete', enabled: Boolean(editFlags.canDelete) },
    { type: 'separator' },
    { role: 'selectAll', enabled: Boolean(editFlags.canSelectAll) },
  ];
}

module.exports = { contextMenuTemplate };
