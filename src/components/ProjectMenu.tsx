import {useEffect, useRef, useState} from "react";
import type {Project} from "../lib/store";
import type {ProjectType} from "../types";
import {PROJECT_TYPES, typeConfig} from "../types";

interface Props {
  projects: Project[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: (name: string, projectType: ProjectType) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function ProjectMenu({projects, activeId, onSwitch, onCreate, onRename, onDelete}: Props) {
  const [open, setOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState("");
  const [creatingType, setCreatingType] = useState<ProjectType | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = projects.find((p) => p.id === activeId);

  useEffect(() => {
    if (!open) {
      setRenamingId(null);
      setConfirmId(null);
      setCreateDraft("");
      setCreatingType(null);
      return;
    }
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

  const startCreate = (t: ProjectType) => {
    setRenamingId(null);
    setConfirmId(null);
    setCreatingType(t);
    setCreateDraft("");
  };

  const cancelCreate = () => {
    setCreatingType(null);
    setCreateDraft("");
  };

  const submitCreate = (t: ProjectType) => {
    const name = createDraft.trim();
    if (!name) return;
    onCreate(name, t);
    setOpen(false);
  };

  return (
    <div className="proj" ref={rootRef}>
      <button className={`proj-btn${open ? " open" : ""}`} onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} title="Switch or create project">
        <span className="proj-name">{active?.name ?? "Project"}</span>
        {active && <span className={`proj-type-badge type-${active.type}`}>{typeConfig(active.type).label}</span>}
        <svg className="settings-caret" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div className="proj-menu" role="menu">
          <div className="proj-scroll">
            {PROJECT_TYPES.map((t) => {
              const group = projects.filter((p) => p.type === t);
              return (
                <div className="proj-group" key={t}>
                  <div className="proj-menu-label">
                    <span className={`proj-group-dot type-${t}`} aria-hidden="true" />
                    {typeConfig(t).label}
                    {t === "plan" && (
                      <button className="proj-group-add" title="New Plan project" aria-label="New Plan project" onClick={() => startCreate(t)}>
                        ＋
                      </button>
                    )}
                  </div>
                  {group.length === 0 && creatingType !== t && <div className="proj-empty-hint">No projects yet</div>}
                  {group.map((p) => (
                    <div key={p.id} className={`proj-row${p.id === activeId ? " active" : ""}`}>
                      {renamingId === p.id ? (
                        <input
                          className="proj-rename-input"
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              onRename(p.id, renameDraft);
                              setRenamingId(null);
                            }
                            if (e.key === "Escape") setRenamingId(null);
                          }}
                          onBlur={() => setRenamingId(null)}
                        />
                      ) : confirmId === p.id ? (
                        <span className="proj-confirm">
                          Delete “{p.name}”?
                          <button
                            className="proj-confirm-yes"
                            onClick={() => {
                              onDelete(p.id);
                              setConfirmId(null);
                            }}
                          >
                            delete
                          </button>
                          <button className="proj-confirm-no" onClick={() => setConfirmId(null)}>
                            keep
                          </button>
                        </span>
                      ) : (
                        <>
                          <button
                            className="proj-row-main"
                            onClick={() => {
                              onSwitch(p.id);
                              setOpen(false);
                            }}
                          >
                            <span className="proj-row-name">{p.name}</span>
                            <span className="proj-row-count">{p.items.length}</span>
                          </button>
                          <span className="proj-row-actions">
                            <button
                              className="proj-row-action"
                              title="Rename project"
                              aria-label={`Rename ${p.name}`}
                              onClick={() => {
                                setRenamingId(p.id);
                                setRenameDraft(p.name);
                              }}
                            >
                              ✎
                            </button>
                            <button className="proj-row-action danger" title="Delete project" aria-label={`Delete ${p.name}`} onClick={() => setConfirmId(p.id)}>
                              ✕
                            </button>
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                  {creatingType === t && (
                    <div className="proj-row proj-row-new">
                      <input
                        className="proj-rename-input"
                        autoFocus
                        placeholder={`Name this ${typeConfig(t).label.toLowerCase()} project…`}
                        value={createDraft}
                        onChange={(e) => setCreateDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") submitCreate(t);
                          if (e.key === "Escape") cancelCreate();
                        }}
                        onBlur={cancelCreate}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
