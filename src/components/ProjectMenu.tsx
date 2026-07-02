import { useEffect, useRef, useState } from 'react';
import type { Project } from '../lib/store';

interface Props {
  projects: Project[];
  activeId: string;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

export function ProjectMenu({ projects, activeId, onSwitch, onCreate, onRename, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const createRef = useRef<HTMLInputElement>(null);

  const active = projects.find((p) => p.id === activeId);

  useEffect(() => {
    if (!open) {
      setRenamingId(null);
      setConfirmId(null);
      setCreateDraft('');
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const submitCreate = () => {
    const name = createDraft.trim();
    if (!name) return;
    onCreate(name);
    setOpen(false);
  };

  return (
    <div className="proj" ref={rootRef}>
      <button
        className={`proj-btn${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        title="Switch or create project"
      >
        <span className="proj-name">{active?.name ?? 'Project'}</span>
        <span className="proj-caret">▾</span>
      </button>

      {open && (
        <div className="proj-menu">
          <div className="proj-menu-label">Projects</div>
          {projects.map((p) => (
            <div key={p.id} className={`proj-row${p.id === activeId ? ' active' : ''}`}>
              {renamingId === p.id ? (
                <input
                  className="proj-rename-input"
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      onRename(p.id, renameDraft);
                      setRenamingId(null);
                    }
                    if (e.key === 'Escape') setRenamingId(null);
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
                    <span className="proj-row-check">{p.id === activeId ? '✓' : ''}</span>
                    <span className="proj-row-name">{p.name}</span>
                    <span className="proj-row-count">{p.items.length}</span>
                  </button>
                  <span className="proj-row-actions">
                    <button
                      className="proj-row-action"
                      title="Rename project"
                      onClick={() => {
                        setRenamingId(p.id);
                        setRenameDraft(p.name);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      className="proj-row-action danger"
                      title="Delete project"
                      onClick={() => setConfirmId(p.id)}
                    >
                      ✕
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
          <div className="proj-create">
            <input
              ref={createRef}
              className="proj-create-input"
              placeholder="New project name…"
              value={createDraft}
              onChange={(e) => setCreateDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitCreate();
              }}
            />
            <button className="proj-create-btn" disabled={!createDraft.trim()} onClick={submitCreate}>
              ＋ Create
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
