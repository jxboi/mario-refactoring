import {useEffect, useRef, useState} from "react";
import type {Project} from "../lib/store";
import type {CategoryDef, Note, TypeConfig, WorkItem} from "../types";
import {childTypeFor, EFFORTS, EFFORT_LABELS, parentTypeFor, RISKS, RISK_LABELS, typeConfig} from "../types";
import {timeAgo} from "./ui";

interface Props {
  item: WorkItem;
  categories: CategoryDef[];
  config: TypeConfig;
  projects: Project[];
  onClose: () => void;
  onUpdate: (patch: Partial<Omit<WorkItem, "id" | "notes">>) => void;
  onNavigate: (projectId: string, itemId: string) => void;
  onLink: (childId: string, parentId: string) => void;
  onUnlink: (childId: string, parentId: string) => void;
  onCreateChild: (targetProjectId: string | null) => void;
  onAddNote: (text: string) => void;
  onDeleteNote: (noteId: string) => void;
  onEditNote: (noteId: string, text: string) => void;
  onToggleNoteBlock: (noteId: string) => void;
  onToggleNoteResolved: (noteId: string) => void;
  onDelete: () => void;
}

export function Drawer({item, categories, config, projects, onClose, onUpdate, onNavigate, onLink, onUnlink, onCreateChild, onAddNote, onDeleteNote, onEditNote, onToggleNoteBlock, onToggleNoteResolved, onDelete}: Props) {
  const [noteDraft, setNoteDraft] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = titleRef.current;
    if (ta) {
      ta.style.height = "auto";
      ta.style.height = `${ta.scrollHeight}px`;
    }
  }, [item.title, item.id]);

  const close = () => {
    setClosing(true);
    setTimeout(onClose, 180);
  };

  useEffect(() => {
    setConfirmDelete(false);
    // a brand-new item opens with an empty title — put the cursor there
    if (!item.title) titleRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const submitNote = () => {
    const text = noteDraft.trim();
    if (!text) return;
    onAddNote(text);
    setNoteDraft("");
  };

  const addListItem = (key: "files" | "tags", value: string) => {
    const v = value.trim();
    if (!v) return;
    const cleaned = key === "tags" ? v.replace(/\s+/g, "-") : v;
    if (item[key].includes(cleaned)) return;
    onUpdate({[key]: [...item[key], cleaned]});
  };

  return (
    <div
      className={`drawer-veil${closing ? " closing" : ""}`}
      onMouseDown={(e) => {
        if (!panelRef.current?.contains(e.target as Node)) close();
      }}
    >
      <aside className={`drawer${closing ? " closing" : ""}`} ref={panelRef}>
        <div className="drawer-top">
          <select className="stage-select" value={item.stage} onChange={(e) => onUpdate({stage: e.target.value as WorkItem["stage"]})}>
            {config.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>

        <textarea ref={titleRef} className="drawer-title" value={item.title} rows={1} onChange={(e) => onUpdate({title: e.target.value})} />

        <div className="drawer-grid">
          <label className="field">
            <span className="field-label">{config.metricLabel}</span>
            <div className="seg">
              {RISKS.map((r) => (
                <button key={r} className={`seg-btn seg-${r}${item.risk === r ? " active" : ""}`} onClick={() => onUpdate({risk: r})}>
                  {RISK_LABELS[r]}
                </button>
              ))}
            </div>
          </label>
          <label className="field">
            <span className="field-label">Effort</span>
            <div className="seg">
              {EFFORTS.map((e) => (
                <button key={e} className={`seg-btn seg-${e}${item.effort === e ? " active" : ""}`} onClick={() => onUpdate({effort: e})}>
                  {EFFORT_LABELS[e]}
                </button>
              ))}
            </div>
          </label>
          <label className="field field-wide">
            <span className="field-label">Category</span>
            <select className="input" value={item.category} onChange={(e) => onUpdate({category: e.target.value as WorkItem["category"]})}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span className="field-label">{config.descriptionLabel}</span>
          <textarea className="input drawer-desc" rows={4} placeholder={config.descriptionPlaceholder} value={item.description} onChange={(e) => onUpdate({description: e.target.value})} />
        </label>

        {config.showFiles && <ListEditor label="Files & paths" mono values={item.files} placeholder="src/module/file.py — press Enter" onAdd={(v) => addListItem("files", v)} onRemove={(v) => onUpdate({files: item.files.filter((f) => f !== v)})} />}

        <ListEditor label="Tags" values={item.tags} placeholder="add tag — press Enter" onAdd={(v) => addListItem("tags", v)} onRemove={(v) => onUpdate({tags: item.tags.filter((t) => t !== v)})} />

        <Relationships
          item={item}
          config={config}
          projects={projects}
          onNavigate={onNavigate}
          onLink={onLink}
          onUnlink={onUnlink}
          onCreateChild={onCreateChild}
        />

        <div className="field">
          <span className="field-label">Notes</span>
          <div className="notes">
            {item.notes.length === 0 && <div className="notes-empty">No notes yet — findings, gotchas, links to PRs.</div>}
            {item.notes.map((n) => (
              <NoteRow key={n.id} note={n} onToggleBlock={() => onToggleNoteBlock(n.id)} onToggleResolved={() => onToggleNoteResolved(n.id)} onDelete={() => onDeleteNote(n.id)} onEdit={(text) => onEditNote(n.id, text)} />
            ))}
          </div>
          <div className="note-composer">
            <textarea
              className="input"
              rows={2}
              placeholder="Add a note… (⌘↵ to save)"
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submitNote();
                }
              }}
            />
            <button className="btn btn-ghost btn-sm" onClick={submitNote} disabled={!noteDraft.trim()}>
              Add note
            </button>
          </div>
        </div>

        <div className="drawer-foot">
          <span className="drawer-timestamps">
            created {timeAgo(item.createdAt)} · updated {timeAgo(item.updatedAt)}
          </span>
          {confirmDelete ? (
            <span className="delete-confirm">
              Delete for good?
              <button className="btn btn-danger btn-sm" onClick={onDelete}>
                Delete
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>
                Keep
              </button>
            </span>
          ) : (
            <button className="btn btn-ghost btn-sm btn-quiet-danger" onClick={() => setConfirmDelete(true)}>
              Delete item
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}

function Relationships({item, config, projects, onNavigate, onLink, onUnlink, onCreateChild}: Pick<Props, "item" | "config" | "projects" | "onNavigate" | "onLink" | "onUnlink" | "onCreateChild">) {
  const [targetProjectId, setTargetProjectId] = useState("");
  const [parentSearch, setParentSearch] = useState("");
  const [childSearch, setChildSearch] = useState("");
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [childPickerOpen, setChildPickerOpen] = useState(false);
  const parentPickerRef = useRef<HTMLDivElement>(null);
  const childPickerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setTargetProjectId("");
    setParentSearch("");
    setChildSearch("");
    setParentPickerOpen(false);
    setChildPickerOpen(false);
  }, [item.id]);
  useEffect(() => {
    if (!parentPickerOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!parentPickerRef.current?.contains(event.target as Node)) {
        setParentPickerOpen(false);
        setParentSearch("");
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setParentPickerOpen(false);
        setParentSearch("");
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [parentPickerOpen]);
  useEffect(() => {
    if (!childPickerOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!childPickerRef.current?.contains(event.target as Node)) {
        setChildPickerOpen(false);
        setChildSearch("");
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setChildPickerOpen(false);
        setChildSearch("");
      }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [childPickerOpen]);
  const all = projects.flatMap((project) => project.items.map((entry) => ({item: entry, project})));
  const parentType = parentTypeFor(config.id);
  const childType = childTypeFor(config.id);
  const parents = all.filter((entry) => item.parentIds.includes(entry.item.id));
  const children = all.filter((entry) => entry.item.parentIds.includes(item.id));
  const matches = (entry: (typeof all)[number], query: string) => `${entry.project.name} ${entry.item.title} ${entry.item.description} ${entry.item.tags.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase());
  const parentOptions = all.filter((entry) => entry.project.type === parentType && !item.parentIds.includes(entry.item.id) && matches(entry, parentSearch));
  const childOptions = all.filter((entry) => entry.project.type === childType && !entry.item.parentIds.includes(item.id) && matches(entry, childSearch));
  const childProjects = projects.filter((project) => project.type === childType);
  const completed = children.filter((entry) => entry.item.stage === "deployed").length;

  return (
    <div className="field relationships">
      <span className="field-label">Relationships</span>
      {parentType && (
        <div className="relation-group" ref={parentPickerRef}>
          <div className="relation-heading">Linked {typeConfig(parentType).itemNounPlural}</div>
          {parents.map((entry) => <RelationRow key={entry.item.id} title={entry.item.title} project={entry.project} stage={typeConfig(entry.project.type).stages.find((stage) => stage.id === entry.item.stage)?.label ?? entry.item.stage} onOpen={() => onNavigate(entry.project.id, entry.item.id)} onRemove={() => onUnlink(item.id, entry.item.id)} />)}
          {parents.length === 0 && <div className="relation-empty">No linked parents</div>}
          <div className="relation-picker-anchor">
            <div className="relation-add">
              <select
                className="input"
                aria-label="Choose a parent item"
                value=""
                onChange={(event) => {
                  const parentId = event.target.value;
                  if (!parentId) return;
                  onLink(item.id, parentId);
                  setParentSearch("");
                  setParentPickerOpen(false);
                }}
              >
                <option value="">Link a parent…</option>
                {parentOptions.map((entry) => <option key={entry.item.id} value={entry.item.id}>{entry.project.name} · {entry.item.title || "Untitled"}</option>)}
              </select>
              <button className={`relation-picker-btn${parentPickerOpen ? " open" : ""}`} title="Search parents" aria-label="Search parents" aria-expanded={parentPickerOpen} onClick={() => { if (parentPickerOpen) setParentSearch(""); setParentPickerOpen(!parentPickerOpen); }}>⌕</button>
            </div>
            {parentPickerOpen && <div className="relation-picker-pop"><input className="input" autoFocus value={parentSearch} onChange={(event) => setParentSearch(event.target.value)} placeholder="Search parents…" /></div>}
          </div>
        </div>
      )}
      {childType && (
        <div className="relation-group" ref={childPickerRef}>
          <div className="relation-heading">
            Assigned {typeConfig(childType).itemNounPlural}
            <span>{completed}/{children.length} done</span>
          </div>
          {children.map((entry) => <RelationRow key={entry.item.id} title={entry.item.title} project={entry.project} stage={typeConfig(entry.project.type).stages.find((stage) => stage.id === entry.item.stage)?.label ?? entry.item.stage} onOpen={() => onNavigate(entry.project.id, entry.item.id)} onRemove={() => onUnlink(entry.item.id, item.id)} />)}
          {children.length === 0 && <div className="relation-empty">No assigned work</div>}
          <div className="relation-picker-anchor">
            <div className="relation-add">
              <select
                className="input"
                aria-label="Choose existing downstream work"
                value=""
                onChange={(event) => {
                  const childId = event.target.value;
                  if (!childId) return;
                  onLink(childId, item.id);
                  setChildSearch("");
                  setChildPickerOpen(false);
                }}
              >
                <option value="">Link existing…</option>
                {childOptions.map((entry) => <option key={entry.item.id} value={entry.item.id}>{entry.project.name} · {entry.item.title || "Untitled"}</option>)}
              </select>
              <button className={`relation-picker-btn${childPickerOpen ? " open" : ""}`} title="Search downstream work" aria-label="Search downstream work" aria-expanded={childPickerOpen} onClick={() => { if (childPickerOpen) setChildSearch(""); setChildPickerOpen(!childPickerOpen); }}>⌕</button>
            </div>
            {childPickerOpen && <div className="relation-picker-pop"><input className="input" autoFocus value={childSearch} onChange={(event) => setChildSearch(event.target.value)} placeholder="Search downstream work…" /></div>}
          </div>
          <div className="relation-add">
            <select className="input" aria-label={`Choose a ${typeConfig(childType).label} project`} value={targetProjectId} onChange={(event) => setTargetProjectId(event.target.value)}>
              <option value="">{childProjects.length ? `Choose ${typeConfig(childType).label} project…` : `Create a ${typeConfig(childType).label} project`}</option>
              {childProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
            <button className="btn btn-primary btn-sm" disabled={childProjects.length > 0 && !targetProjectId} onClick={() => onCreateChild(targetProjectId || null)}>Create child</button>
          </div>
        </div>
      )}
    </div>
  );
}

function RelationRow({title, project, stage, onOpen, onRemove}: {title: string; project: Project; stage: string; onOpen: () => void; onRemove: () => void}) {
  return <div className="relation-row"><button className="relation-main" onClick={onOpen}><span>{title || "Untitled"}</span><small>{project.name} · {stage}</small></button><button className="list-remove" onClick={onRemove} aria-label={`Unlink ${title || "item"}`}>✕</button></div>;
}

function NoteRow({note, onToggleBlock, onToggleResolved, onDelete, onEdit}: {note: Note; onToggleBlock: () => void; onToggleResolved: () => void; onDelete: () => void; onEdit: (text: string) => void}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [draft, setDraft] = useState(note.text);
  const rootRef = useRef<HTMLDivElement>(null);
  const editRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) setConfirmRemove(false);
  }, [menuOpen]);

  const startEdit = () => {
    setDraft(note.text);
    setEditing(true);
    setMenuOpen(false);
    requestAnimationFrame(() => editRef.current?.focus());
  };

  const saveEdit = () => {
    const text = draft.trim();
    if (!text) return;
    if (text !== note.text) onEdit(text);
    setEditing(false);
  };

  const cancelEdit = () => {
    setDraft(note.text);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={`note${note.blocked ? " note-blocked" : note.resolved ? " note-resolved" : ""}`} ref={rootRef}>
        <textarea
          ref={editRef}
          className="input note-edit"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              saveEdit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelEdit();
            }
          }}
        />
        <div className="note-edit-actions">
          <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>
            Cancel
          </button>
          <button className="btn btn-sm" onClick={saveEdit} disabled={!draft.trim()}>
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`note${note.blocked ? " note-blocked" : note.resolved ? " note-resolved" : ""}`} ref={rootRef}>
      <div
        className="note-text"
        role="button"
        tabIndex={0}
        title="Click to edit"
        onClick={startEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            startEdit();
          }
        }}
      >
        {note.text}
      </div>
      <div className="note-foot">
        <span>{timeAgo(note.createdAt)}</span>
        {note.blocked && <span className="note-blocked-tag">· Blocker</span>}
        {note.resolved && !note.blocked && <span className="note-resolved-tag">· Resolved</span>}
        <div className="note-menu">
          <button className="note-menu-btn" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Note actions">
            ⋯
          </button>
          {menuOpen && (
            <div className="note-menu-pop" role="menu">
              <button
                className="note-menu-item"
                role="menuitem"
                onClick={() => {
                  onToggleBlock();
                  setMenuOpen(false);
                }}
              >
                {note.blocked ? "Unblock" : "Mark as blocker"}
              </button>
              <button
                className={`note-menu-item${note.resolved ? "" : " resolve"}`}
                role="menuitem"
                onClick={() => {
                  onToggleResolved();
                  setMenuOpen(false);
                }}
              >
                {note.resolved ? "Mark as unresolved" : "Mark as resolved"}
              </button>
              {confirmRemove ? (
                <button
                  className="note-menu-item danger"
                  role="menuitem"
                  onClick={() => {
                    onDelete();
                    setMenuOpen(false);
                  }}
                >
                  Confirm remove
                </button>
              ) : (
                <button className="note-menu-item danger" role="menuitem" onClick={() => setConfirmRemove(true)}>
                  Remove
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ListEditor({label, values, placeholder, mono, onAdd, onRemove}: {label: string; values: string[]; placeholder: string; mono?: boolean; onAdd: (v: string) => void; onRemove: (v: string) => void}) {
  const [draft, setDraft] = useState("");
  const display = (v: string) => (mono || /\d/.test(v) ? v : v.replace(/\b\w/g, (c) => c.toUpperCase()));
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="list-editor">
        {values.map((v) => (
          <span key={v} className={`list-item${mono ? " mono" : ""}`}>
            {display(v)}
            <button className="list-remove" onClick={() => onRemove(v)} aria-label={`Remove ${v}`}>
              ✕
            </button>
          </span>
        ))}
        <input
          className={`list-input${mono ? " mono" : ""}`}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd(draft);
              setDraft("");
            }
          }}
        />
      </div>
    </div>
  );
}
