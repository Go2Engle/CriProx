import WorkspaceContextMenu from './WorkspaceContextMenu';
import { Copy, Grid2X2, ImagePlus, Trash2 } from 'lucide-react';
import type { EntryCopy } from '../lib/entries';

export type SheetCardMenuTarget = {
  target: EntryCopy;
  anchor: HTMLButtonElement;
  x: number;
  y: number;
};

export default function SheetCardMenu({
  menu,
  name,
  duplicateDisabled,
  fillDisabled,
  fillHint,
  close,
  inspect,
  copy,
  remove,
}: {
  menu: SheetCardMenuTarget;
  name: string;
  duplicateDisabled: boolean;
  fillDisabled: boolean;
  fillHint: string;
  close: () => void;
  inspect: () => void;
  copy: (action: 'duplicate' | 'fill') => void;
  remove: () => void;
}) {
  function finish(action?: () => void) {
    close();
    menu.anchor.focus({ preventScroll: true });
    action?.();
  }
  return (
    <WorkspaceContextMenu menu={menu} name={name} close={close}>
      <button role="menuitem" onClick={() => finish(inspect)}>
        <ImagePlus size={15} /> Change Artwork
      </button>
      <button
        role="menuitem"
        disabled={duplicateDisabled}
        title={
          duplicateDisabled
            ? 'Projects can contain up to 500 cards.'
            : 'Add one copy after this card'
        }
        onClick={() => finish(() => copy('duplicate'))}
      >
        <Copy size={15} /> Duplicate
      </button>
      <button
        role="menuitem"
        disabled={fillDisabled}
        title={fillHint}
        onClick={() => finish(() => copy('fill'))}
      >
        <Grid2X2 size={15} /> Fill Page
      </button>
      <small>{fillHint}</small>
      <button role="menuitem" className="sheet-card-menu-delete" onClick={() => finish(remove)}>
        <Trash2 size={15} /> Delete Card
      </button>
    </WorkspaceContextMenu>
  );
}
