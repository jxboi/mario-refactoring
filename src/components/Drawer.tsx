import { useEffect, useRef, useState } from 'react';
import type { RefactorItem } from '../types';
import { CATEGORIES, EFFORTS, RISKS, STAGES } from '../types';
import { timeAgo } from './ui';

interface Props {
  item: RefactorItem;
  onClose: () => void;
  onUpdate: (patch: Partial<Omit<RefactorItem, 'id' | 'notes'>>) => void;
  onAddNote: (text: string) => void;
  onDeleteNote: (noteId: string) => void;
  onDelete: () => void;
}

export function Drawer({ item, onClose, onUpdate, onAddNote, onDeleteNote, onDelete }: Props) {
  const [noteDraft, setNoteDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [closing, setClosing] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const ta = titleRef.current;
    if (ta) {
      ta.style.height = 'auto';
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
    setNoteDraft('');
  };

  const addListItem = (key: 'files' | 'tags', value: string) => {
    const v = value.trim();
    if (!v) return;
    const cleaned = key === 'tags' ? v.toLowerCase().replace(/\s+/g, '-') : v;
    if (item[key].includes(cleaned)) return;
    onUpdate({ [key]: [...item[key], cleaned] });
  };

  return (
    <div className={`drawer-veil${closing ? ' closing' : ''}`} onMouseDown={(e) => {
      if (!panelRef.current?.contains(e.target as Node)) close();
    }}>
      <aside className={`drawer${closing ? ' closing' : ''}`} ref={panelRef}>
        <div className="drawer-top">
          <select
            className="stage-select"
            value={item.stage}
            onChange={(e) => onUpdate({ stage: e.target.value as RefactorItem['stage'] })}
          >
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          <button className="icon-btn" onClick={close} aria-label="Close">
            ✕
          </button>
        </div>

        <textarea
          ref={titleRef}
          className="drawer-title"
          value={item.title}
          rows={1}
          onChange={(e) => onUpdate({ title: e.target.value })}
        />

        <div className={`block-panel${item.blocked ? ' on' : ''}`}>
          <label className="block-toggle">
            <input
              type="checkbox"
              checked={item.blocked}
              onChange={(e) => onUpdate({ blocked: e.target.checked })}
            />
            <span>⛔ Blocked</span>
          </label>
          {item.blocked && (
            <input
              className="block-reason"
              placeholder="What is it waiting on?"
              value={item.blockReason}
              onChange={(e) => onUpdate({ blockReason: e.target.value })}
            />
          )}
        </div>

        <div className="drawer-grid">
          <label className="field">
            <span className="field-label">Risk</span>
            <div className="seg">
              {RISKS.map((r) => (
                <button
                  key={r}
                  className={`seg-btn seg-${r}${item.risk === r ? ' active' : ''}`}
                  onClick={() => onUpdate({ risk: r })}
                >
                  {r}
                </button>
              ))}
            </div>
          </label>
          <label className="field">
            <span className="field-label">Effort</span>
            <div className="seg">
              {EFFORTS.map((e) => (
                <button
                  key={e}
                  className={`seg-btn${item.effort === e ? ' active' : ''}`}
                  onClick={() => onUpdate({ effort: e })}
                >
                  {e}
                </button>
              ))}
            </div>
          </label>
          <label className="field field-wide">
            <span className="field-label">Category</span>
            <select
              className="input"
              value={item.category}
              onChange={(e) => onUpdate({ category: e.target.value as RefactorItem['category'] })}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.glyph} {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="field">
          <span className="field-label">Why this refactor</span>
          <textarea
            className="input drawer-desc"
            rows={4}
            placeholder="What's wrong today, and what better looks like…"
            value={item.description}
            onChange={(e) => onUpdate({ description: e.target.value })}
          />
        </label>

        <ListEditor
          label="Files & paths"
          mono
          values={item.files}
          placeholder="src/module/file.py — press Enter"
          onAdd={(v) => addListItem('files', v)}
          onRemove={(v) => onUpdate({ files: item.files.filter((f) => f !== v) })}
        />

        <ListEditor
          label="Tags"
          values={item.tags}
          placeholder="add tag — press Enter"
          onAdd={(v) => addListItem('tags', v)}
          onRemove={(v) => onUpdate({ tags: item.tags.filter((t) => t !== v) })}
        />

        <div className="field">
          <span className="field-label">Notes</span>
          <div className="notes">
            {item.notes.length === 0 && <div className="notes-empty">No notes yet — findings, gotchas, links to PRs.</div>}
            {item.notes.map((n) => (
              <div key={n.id} className="note">
                <div className="note-text">{n.text}</div>
                <div className="note-foot">
                  <span>{timeAgo(n.createdAt)}</span>
                  <button className="note-delete" onClick={() => onDeleteNote(n.id)}>
                    remove
                  </button>
                </div>
              </div>
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
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
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

function ListEditor({
  label,
  values,
  placeholder,
  mono,
  onAdd,
  onRemove,
}: {
  label: string;
  values: string[];
  placeholder: string;
  mono?: boolean;
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
}) {
  const [draft, setDraft] = useState('');
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="list-editor">
        {values.map((v) => (
          <span key={v} className={`list-item${mono ? ' mono' : ''}`}>
            {v}
            <button className="list-remove" onClick={() => onRemove(v)} aria-label={`Remove ${v}`}>
              ✕
            </button>
          </span>
        ))}
        <input
          className={`list-input${mono ? ' mono' : ''}`}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onAdd(draft);
              setDraft('');
            }
          }}
        />
      </div>
    </div>
  );
}
