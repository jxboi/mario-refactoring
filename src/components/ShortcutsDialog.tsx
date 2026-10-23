import {useDialog} from "../lib/useDialog";
import {useEffect, useRef} from "react";

interface Props { onClose: () => void; }

export function ShortcutsDialog({onClose}: Props) {
  const {dialogRef, onDialogKeyDown} = useDialog<HTMLElement>(onClose);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
  }, [onClose]);
  return <div className="modal-veil" onMouseDown={event => event.target === event.currentTarget && onClose()}><section ref={dialogRef} tabIndex={-1} onKeyDown={onDialogKeyDown} className="modal shortcuts-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title"><header className="modal-head"><div><h2 id="shortcuts-title">Keyboard shortcuts</h2><p>Move through your work without reaching for the mouse.</p></div><button ref={closeRef} className="icon-btn" onClick={onClose} aria-label="Close keyboard shortcuts">✕</button></header><div className="shortcuts-list"><div className="shortcut-row"><span>Create a task</span><kbd>C</kbd></div><div className="shortcut-row"><span>Close a drawer or dialog</span><kbd>Esc</kbd></div></div></section></div>;
}
