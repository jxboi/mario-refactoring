import {useEffect, useState} from "react";
import {copyWorkspaceForImport, parseWorkspaceJson} from "../lib/export";
import type {Workspace} from "../lib/store";

interface Props {
  file: File;
  onImport: (workspace: Workspace) => void;
  onClose: () => void;
}

export function WorkspaceImportModal({file, onImport, onClose}: Props) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    file.text().then((text) => {
      if (cancelled) return;
      const result = parseWorkspaceJson(text);
      setWorkspace(result.workspace ?? null);
      setError(result.error ?? null);
    }).catch(() => !cancelled && setError("Could not read this file."));
    return () => { cancelled = true; };
  }, [file]);

  const itemCount = workspace?.projects.reduce((total, project) => total + project.tasks.length, 0) ?? 0;

  return (
    <div className="modal-veil" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal modal-narrow">
        <div className="modal-head">
          <h2>Import workspace</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {error ? (
          <div className="import-error">{error}</div>
        ) : workspace ? (
          <>
            <p className="modal-intro">This creates a separate copy with new internal IDs. It will not overwrite an existing workspace.</p>
            <div className="import-summary workspace-import-summary">
              <strong>{workspace.name}</strong>
              <span>{workspace.projects.length} project{workspace.projects.length === 1 ? "" : "s"} · {itemCount} task{itemCount === 1 ? "" : "s"} · {workspace.skills.length} skill{workspace.skills.length === 1 ? "" : "s"}</span>
            </div>
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={() => onImport(copyWorkspaceForImport(workspace))}>Import as copy</button>
            </div>
          </>
        ) : (
          <p className="modal-intro">Reading {file.name}…</p>
        )}
      </div>
    </div>
  );
}
