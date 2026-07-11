import {useEffect, useRef, useState} from "react";
import type {Workspace} from "../lib/store";

interface Props {
  workspaces: Workspace[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function WorkspaceMenu({workspaces, activeId, onSwitch, onCreate, onRename, onDelete}: Props) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = workspaces.find((workspace) => workspace.id === activeId);

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (open) return;
    setCreating(false);
    setCreateDraft("");
    setRenamingId(null);
    setConfirmId(null);
  }, [open]);

  const submitCreate = () => {
    const name = createDraft.trim();
    if (!name) return;
    onCreate(name);
    setOpen(false);
  };

  const submitRename = (id: string) => {
    const name = renameDraft.trim();
    if (name) onRename(id, name);
    setRenamingId(null);
  };

  return (
    <div className="proj workspace-switcher" ref={rootRef}>
      <button className={`proj-btn workspace-btn${open ? " open" : ""}`} onClick={() => setOpen((value) => !value)} aria-haspopup="menu" aria-expanded={open} title="Switch or create workspace">
        <span className="proj-name">{active?.name ?? "Workspace"}</span>
        <svg className="settings-caret" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="proj-menu workspace-menu" role="menu">
          <div className="proj-menu-label">
            Workspaces
            <button
              className="proj-group-add"
              title="New workspace"
              aria-label="New workspace"
              onClick={() => {
                setCreating(true);
                setRenamingId(null);
                setConfirmId(null);
              }}
            >
              ＋
            </button>
          </div>
          <div className="proj-scroll">
            {workspaces.map((workspace) => (
              <div key={workspace.id} className={`proj-row${workspace.id === activeId ? " active" : ""}`}>
                {renamingId === workspace.id ? (
                  <input
                    className="proj-rename-input"
                    autoFocus
                    value={renameDraft}
                    onChange={(event) => setRenameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") submitRename(workspace.id);
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => submitRename(workspace.id)}
                  />
                ) : confirmId === workspace.id ? (
                  <span className="proj-confirm">
                    Delete?
                    <button className="proj-confirm-yes" onClick={() => onDelete(workspace.id)}>yes</button>
                    <button className="proj-confirm-no" onClick={() => setConfirmId(null)}>no</button>
                  </span>
                ) : (
                  <>
                    <button
                      className="proj-row-main"
                      onClick={() => {
                        onSwitch(workspace.id);
                        setOpen(false);
                      }}
                    >
                      <span className="proj-row-name">{workspace.name}</span>
                      <span className="proj-row-count">{workspace.projects.length}</span>
                    </button>
                    <span className="proj-row-actions">
                      <button
                        className="proj-row-action"
                        title="Rename workspace"
                        aria-label={`Rename ${workspace.name}`}
                        onClick={() => {
                          setRenamingId(workspace.id);
                          setRenameDraft(workspace.name);
                        }}
                      >✎</button>
                      <button className="proj-row-action danger" title="Delete workspace" aria-label={`Delete ${workspace.name}`} onClick={() => setConfirmId(workspace.id)}>✕</button>
                    </span>
                  </>
                )}
              </div>
            ))}
            {creating && (
              <div className="proj-row proj-row-new">
                <input
                  className="proj-rename-input"
                  autoFocus
                  placeholder="Name this workspace…"
                  value={createDraft}
                  onChange={(event) => setCreateDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") submitCreate();
                    if (event.key === "Escape") setCreating(false);
                  }}
                  onBlur={() => !createDraft.trim() && setCreating(false)}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
