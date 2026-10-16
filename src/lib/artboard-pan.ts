/** Move the preview by dragging empty space or holding the right mouse button. */
export function enableArtboardPanning(
  viewport: HTMLElement,
  openContextMenu?: (event: MouseEvent) => void,
): () => void {
  let drag: {
    pointerId: number;
    buttons: number;
    x: number;
    y: number;
    scrollLeft: number;
    scrollTop: number;
  } | null = null;
  let suppressClick = false;
  let pendingContextMenu: MouseEvent | null = null;

  const finish = () => {
    if (!drag) return;
    const { pointerId } = drag;
    drag = null;
    pendingContextMenu = null;
    viewport.classList.remove('panning');
    if (viewport.hasPointerCapture(pointerId)) viewport.releasePointerCapture(pointerId);
  };
  const start = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse' || drag) return;
    suppressClick = false;
    if (event.button !== 0 && event.button !== 2) return;
    const target = event.target as Element;
    if (event.button === 0 && target.closest('.placed-card')) return;

    // Leave the native scrollbars available for ordinary scrollbar dragging.
    const rect = viewport.getBoundingClientRect();
    if (
      event.clientX >= rect.left + viewport.clientWidth ||
      event.clientY >= rect.top + viewport.clientHeight
    )
      return;

    if (event.button === 0) event.preventDefault();
    drag = {
      pointerId: event.pointerId,
      buttons: event.button === 2 ? 2 : 1,
      x: event.clientX,
      y: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    // Keep a stationary right-click targeted at the card. Capture once it becomes a drag.
    if (event.button === 0) viewport.setPointerCapture(event.pointerId);
    viewport.classList.add('panning');
  };
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!(event.buttons & drag.buttons)) {
      finish();
      return;
    }
    event.preventDefault();
    const dx = drag.x - event.clientX;
    const dy = drag.y - event.clientY;
    if (!suppressClick && Math.hypot(dx, dy) < 4) return;
    suppressClick = true;
    if (!viewport.hasPointerCapture(event.pointerId)) viewport.setPointerCapture(event.pointerId);
    // Measure from the start so fractional mouse steps cannot accumulate rounding drift.
    viewport.scrollLeft = drag.scrollLeft + dx;
    viewport.scrollTop = drag.scrollTop + dy;
  };
  const end = (event: PointerEvent) => {
    if (event.pointerId !== drag?.pointerId) return;
    const menu = event.type === 'pointerup' && !suppressClick ? pendingContextMenu : null;
    finish();
    if (menu) openContextMenu?.(menu);
  };
  const click = (event: MouseEvent) => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  };
  const contextMenu = (event: MouseEvent) => {
    event.preventDefault();
    if (suppressClick) return;
    // macOS/Linux can emit contextmenu on press; Windows can emit it on release.
    if (drag?.buttons === 2) pendingContextMenu = event;
    else openContextMenu?.(event);
  };
  const window = viewport.ownerDocument.defaultView;

  viewport.addEventListener('pointerdown', start);
  viewport.addEventListener('pointermove', move);
  viewport.addEventListener('pointerup', end);
  viewport.addEventListener('pointercancel', end);
  viewport.addEventListener('lostpointercapture', end);
  viewport.addEventListener('click', click, true);
  viewport.addEventListener('contextmenu', contextMenu);
  window?.addEventListener('blur', finish);
  // A stationary right press has no pointer capture until it moves.
  window?.addEventListener('pointerup', end);
  window?.addEventListener('pointercancel', end);
  return () => {
    finish();
    viewport.removeEventListener('pointerdown', start);
    viewport.removeEventListener('pointermove', move);
    viewport.removeEventListener('pointerup', end);
    viewport.removeEventListener('pointercancel', end);
    viewport.removeEventListener('lostpointercapture', end);
    viewport.removeEventListener('click', click, true);
    viewport.removeEventListener('contextmenu', contextMenu);
    window?.removeEventListener('blur', finish);
    window?.removeEventListener('pointerup', end);
    window?.removeEventListener('pointercancel', end);
  };
}
