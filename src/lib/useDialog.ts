import {useEffect, useRef, type KeyboardEvent} from "react";

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

/** Keep keyboard navigation within a dialog and restore its trigger on close. */
export function useDialog<T extends HTMLElement>(onClose: () => void) {
  const dialogRef = useRef<T>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) dialog.focus();
    return () => { if (previous?.isConnected) previous.focus(); };
  }, []);

  const onDialogKeyDown = (event: KeyboardEvent<T>) => {
    if (event.defaultPrevented) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const dialog = dialogRef.current;
    const controls = Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      .filter((control) => control.getClientRects().length > 0 && !control.closest('[hidden], [inert]'));
    const first = controls[0], last = controls[controls.length - 1];
    if (!first || !last) { event.preventDefault(); dialog?.focus(); return; }
    const active = document.activeElement;
    if (active === dialog || (event.shiftKey && active === first) || (!event.shiftKey && active === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  };

  return {dialogRef, onDialogKeyDown};
}
