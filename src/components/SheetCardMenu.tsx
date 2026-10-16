import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
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
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current!;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8))}px`;
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (!element.contains(event.target as Node)) close();
    };
    const dismiss = () => close();
    const scroll = (event: Event) => {
      if (!element.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('blur', dismiss);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('blur', dismiss);
    };
  }, [menu, close]);
  function finish(action?: () => void) {
    close();
    menu.anchor.focus({ preventScroll: true });
    action?.();
  }
  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`Actions for ${name}`}
      className="sheet-card-menu"
      style={{ left: menu.x, top: menu.y }}
      onContextMenu={(event) => event.preventDefault()}
      onKeyDown={(event) => {
        if (event.key === 'Escape' || event.key === 'Tab') {
          event.preventDefault();
          finish();
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault();
          const buttons = Array.from(
            ref.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'),
          );
          const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
          buttons[next]?.focus();
        }
      }}
    >
      <strong className="sheet-card-menu-name">{name}</strong>
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
    </div>,
    document.body,
  );
}
