type ProjectDragCallbacks = {
  canDrag: (projectId: string) => boolean;
  canDrop: (projectId: string, folder: string) => boolean;
  start: (projectId: string) => void;
  hover: (folder: string | null) => void;
  finish: () => void;
  drop: (projectId: string, folder: string) => void;
};

/** Keep wheel input available while moving decks, including stationary edge scrolling. */
export function enableProjectDragging(
  content: HTMLElement,
  list: HTMLElement,
  callbacks: ProjectDragCallbacks,
): () => void {
  const document = content.ownerDocument;
  const window = document.defaultView!;
  let drag: {
    id: string;
    source: HTMLElement;
    pointerId: number;
    startX: number;
    startY: number;
    x: number;
    y: number;
    active: boolean;
  } | null = null;
  let preview: HTMLElement | null = null;
  let frame: number | null = null;
  let lastTime: number | null = null;
  let scrollRemainder = 0;
  let suppressClick = false;

  function area() {
    const innerScrolls = /auto|scroll/.test(window.getComputedStyle(list).overflowY);
    const viewport = innerScrolls && list.scrollHeight > list.clientHeight ? list : content;
    const outer = content.getBoundingClientRect();
    const inner = list.getBoundingClientRect();
    return {
      viewport,
      left: Math.max(outer.left, inner.left),
      right: Math.min(outer.right, inner.right),
      top: Math.max(outer.top, inner.top),
      bottom: Math.min(outer.bottom, inner.bottom),
    };
  }

  function velocity() {
    if (!drag?.active) return 0;
    const bounds = area();
    if (
      drag.x < bounds.left ||
      drag.x > bounds.right ||
      drag.y < bounds.top ||
      drag.y > bounds.bottom
    )
      return 0;
    const edge = Math.min(48, (bounds.bottom - bounds.top) / 3);
    if (edge <= 0) return 0;
    if (drag.y < bounds.top + edge) return -200 * (1 - (drag.y - bounds.top) / edge);
    if (drag.y > bounds.bottom - edge) return 200 * (1 - (bounds.bottom - drag.y) / edge);
    return 0;
  }

  function destination() {
    if (!drag?.active) return null;
    const hit = document.elementFromPoint(drag.x, drag.y);
    const target = hit?.closest<HTMLElement>('[data-project-folder]');
    const folder = target?.dataset.projectFolder;
    return target &&
      content.contains(target) &&
      folder !== undefined &&
      callbacks.canDrop(drag.id, folder)
      ? folder
      : null;
  }

  function updateHover() {
    if (!drag?.active) return;
    callbacks.hover(destination());
    if (preview) {
      const x = Math.min(drag.x + 14, window.innerWidth - preview.offsetWidth - 8);
      const y = Math.min(drag.y + 14, window.innerHeight - preview.offsetHeight - 8);
      preview.style.transform = `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)`;
    }
  }

  function stopFrame() {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
    lastTime = null;
    scrollRemainder = 0;
  }

  function schedule() {
    if (!velocity()) {
      stopFrame();
      return;
    }
    if (frame === null) frame = window.requestAnimationFrame(tick);
  }

  function tick(time: number) {
    frame = null;
    if (!drag || !callbacks.canDrag(drag.id)) {
      finish();
      return;
    }
    const speed = velocity();
    if (!speed) {
      stopFrame();
      return;
    }
    const elapsed = lastTime === null ? 16 : Math.min(50, time - lastTime);
    lastTime = time;
    const viewport = area().viewport;
    const before = viewport.scrollTop;
    const distance = scrollRemainder + (speed * elapsed) / 1000;
    const pixels = Math.trunc(distance);
    scrollRemainder = distance - pixels;
    viewport.scrollTop = Math.max(
      0,
      Math.min(viewport.scrollHeight - viewport.clientHeight, before + pixels),
    );
    updateHover();
    const canScroll =
      speed < 0
        ? viewport.scrollTop > 0
        : viewport.scrollTop < viewport.scrollHeight - viewport.clientHeight;
    if (canScroll) schedule();
    else stopFrame();
  }

  function finish(notify = true) {
    const previous = drag;
    drag = null;
    stopFrame();
    preview?.remove();
    preview = null;
    content.classList.remove('project-drag-active');
    if (previous?.source.hasPointerCapture(previous.pointerId))
      previous.source.releasePointerCapture(previous.pointerId);
    if (previous?.active && notify) callbacks.finish();
  }

  function down(event: PointerEvent) {
    suppressClick = false;
    if (drag || event.pointerType !== 'mouse' || event.button !== 0) return;
    const target = event.target as Element;
    const source = target.closest<HTMLElement>('[data-project-id]');
    const id = source?.dataset.projectId;
    if (!source || !id || !list.contains(source) || target.closest('button, input, select, a'))
      return;
    if (!callbacks.canDrag(id)) return;
    // Native HTML dragging suppresses wheel events in Chromium. Pointer capture
    // keeps the gesture in the app and leaves wheel input available.
    event.preventDefault();
    drag = {
      id,
      source,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
    };
    source.setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!(event.buttons & 1) || !callbacks.canDrag(drag.id)) {
      finish();
      return;
    }
    event.preventDefault();
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (!drag.active) {
      if (Math.hypot(drag.x - drag.startX, drag.y - drag.startY) < 5) return;
      if (!callbacks.canDrag(drag.id)) {
        finish();
        return;
      }
      drag.active = true;
      suppressClick = true;
      callbacks.start(drag.id);
      content.classList.add('project-drag-active');
      preview = document.createElement('div');
      preview.className = 'explorer-drag-preview';
      preview.setAttribute('aria-hidden', 'true');
      const icon = drag.source.querySelector('.project-browser-icon svg')?.cloneNode(true);
      if (icon) preview.append(icon);
      const name = document.createElement('span');
      name.textContent = drag.source.querySelector('strong')?.textContent || 'Project';
      preview.append(name);
      (content.closest('dialog') || content).append(preview);
    }
    updateHover();
    schedule();
  }

  function up(event: PointerEvent) {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag.x = event.clientX;
    drag.y = event.clientY;
    const id = drag.id;
    const folder = destination();
    finish();
    if (folder !== null) callbacks.drop(id, folder);
  }

  function cancel(event: PointerEvent) {
    if (event.pointerId === drag?.pointerId) finish();
  }
  function key(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !drag) return;
    event.preventDefault();
    event.stopPropagation();
    finish();
  }
  function click(event: MouseEvent) {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault();
    event.stopPropagation();
  }
  function wheel(event: WheelEvent) {
    if (!drag?.active || event.ctrlKey || !event.deltaY) return;
    if (!callbacks.canDrag(drag.id)) {
      finish();
      return;
    }
    const bounds = area();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    )
      return;
    event.preventDefault();
    stopFrame();
    const factor =
      event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.viewport.clientHeight : 1;
    bounds.viewport.scrollTop = Math.max(
      0,
      Math.min(
        bounds.viewport.scrollHeight - bounds.viewport.clientHeight,
        bounds.viewport.scrollTop + event.deltaY * factor,
      ),
    );
    updateHover();
    schedule();
  }
  function scroll() {
    updateHover();
  }
  function blur() {
    finish();
  }

  content.addEventListener('pointerdown', down);
  document.addEventListener('pointermove', move, true);
  document.addEventListener('pointerup', up, true);
  document.addEventListener('pointercancel', cancel, true);
  document.addEventListener('lostpointercapture', cancel, true);
  document.addEventListener('keydown', key, true);
  document.addEventListener('click', click, true);
  document.addEventListener('wheel', wheel, { capture: true, passive: false });
  content.addEventListener('scroll', scroll, true);
  window.addEventListener('blur', blur);
  return () => {
    finish(false);
    content.removeEventListener('pointerdown', down);
    document.removeEventListener('pointermove', move, true);
    document.removeEventListener('pointerup', up, true);
    document.removeEventListener('pointercancel', cancel, true);
    document.removeEventListener('lostpointercapture', cancel, true);
    document.removeEventListener('keydown', key, true);
    document.removeEventListener('click', click, true);
    document.removeEventListener('wheel', wheel, true);
    content.removeEventListener('scroll', scroll, true);
    window.removeEventListener('blur', blur);
  };
}

export type { ProjectDragCallbacks };
