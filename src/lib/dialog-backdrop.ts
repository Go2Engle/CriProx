import { useRef, type MouseEvent, type PointerEvent } from 'react';

type DialogPositionEvent = Pick<
  MouseEvent<HTMLDialogElement>,
  'target' | 'currentTarget' | 'clientX' | 'clientY'
>;
type DialogPointerEvent = DialogPositionEvent &
  Pick<PointerEvent<HTMLDialogElement>, 'isPrimary' | 'button'>;
type DialogClickEvent = DialogPositionEvent &
  Pick<MouseEvent<HTMLDialogElement>, 'button' | 'detail'>;

function isBackdrop(event: DialogPositionEvent): boolean {
  if (event.target !== event.currentTarget) return false;
  const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
  return (
    event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom
  );
}

export function createDialogBackdropGesture() {
  let startedOnBackdrop = false;
  return {
    pointerDown(event: DialogPointerEvent) {
      startedOnBackdrop = event.isPrimary && event.button === 0 && isBackdrop(event);
    },
    pointerCancel() {
      startedOnBackdrop = false;
    },
    isBackdropClick(event: DialogClickEvent): boolean {
      const startedOutside = startedOnBackdrop;
      startedOnBackdrop = false;
      // A drag can produce a click on the dialog even when it started in its content.
      return startedOutside && event.button === 0 && event.detail > 0 && isBackdrop(event);
    },
  };
}

export function useDialogBackdropDismiss(close: () => void) {
  const { current: gesture } = useRef(createDialogBackdropGesture());
  return {
    onPointerDownCapture: gesture.pointerDown,
    onPointerCancelCapture: gesture.pointerCancel,
    onClick(event: MouseEvent<HTMLDialogElement>) {
      if (gesture.isBackdropClick(event)) close();
    },
  };
}
