import {useEffect, useRef, useState} from "react";

interface Props {
  canImport: boolean;
  canExport: boolean;
  onImportClick: () => void;
  onExportClick: () => void;
  onImportWorkspaceClick: () => void;
  onExportWorkspaceClick: () => void;
  onManageCategories: () => void;
  onManageSkills: () => void;
}

export function SettingsMenu({canImport, canExport, onImportClick, onExportClick, onImportWorkspaceClick, onExportWorkspaceClick, onManageCategories, onManageSkills}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const run = (fn: () => void) => () => {
    fn();
    setOpen(false);
  };

  return (
    <div className="settings" ref={rootRef}>
      <button className={`btn btn-ghost settings-btn${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="Settings">
        <span className="btn-label">Settings</span>
        <svg className="settings-caret" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="settings-menu" role="menu">
          <button className="settings-item" role="menuitem" onClick={run(onManageSkills)}>
            <span className="settings-item-icon">✦</span> Skills
          </button>
          <button className="settings-item" role="menuitem" onClick={run(onManageCategories)}>
            <span className="settings-item-icon">❖</span> Categories
          </button>
          <div className="settings-sep" />
          <button className="settings-item" role="menuitem" onClick={run(onImportClick)} disabled={!canImport}>
            <span className="settings-item-icon">⇡</span> Import project / items
          </button>
          <button className="settings-item" role="menuitem" onClick={run(onExportClick)} disabled={!canExport}>
            <span className="settings-item-icon">⇣</span> Export project
          </button>
          <div className="settings-sep" />
          <button className="settings-item" role="menuitem" onClick={run(onImportWorkspaceClick)}>
            <span className="settings-item-icon">⇡</span> Import workspace
          </button>
          <button className="settings-item" role="menuitem" onClick={run(onExportWorkspaceClick)}>
            <span className="settings-item-icon">⇣</span> Export workspace
          </button>
        </div>
      )}
    </div>
  );
}
