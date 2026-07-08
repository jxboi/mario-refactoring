import {useState} from "react";
import type {CategoryDef} from "../types";
import {FALLBACK_CATEGORY_ID} from "../types";

/** Preset icons offered when customising a category's glyph. */
const GLYPH_CHOICES = ["⤴", "✎", "✂", "⬡", "⚡", "✓", "▦", "❖", "✉", "⚠", "❢", "↻", "❏", "⌕", "✐", "★", "◆", "●", "▲", "❤", "⚑", "⌘", "⎈", "·"];

interface Props {
  categories: CategoryDef[];
  /** How many items currently use each category, keyed by category id. */
  counts: Record<string, number>;
  /** Label of the project type these categories belong to (e.g. "Task"). */
  typeLabel: string;
  onAdd: (label: string) => void;
  onRename: (id: string, label: string) => void;
  onSetGlyph: (id: string, glyph: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function CategoryManager({categories, counts, typeLabel, onAdd, onRename, onSetGlyph, onDelete, onClose}: Props) {
  const [addDraft, setAddDraft] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [glyphId, setGlyphId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const submitAdd = () => {
    const label = addDraft.trim();
    if (!label) return;
    onAdd(label);
    setAddDraft("");
  };

  const submitRename = (id: string) => {
    const label = renameDraft.trim();
    if (label) onRename(id, label);
    setRenamingId(null);
  };

  return (
    <div className="modal-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-narrow">
        <div className="modal-head">
          <h2>Categories</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="modal-intro">Categories are shared across all your {typeLabel} projects. Removing one files its items under “Other”.</p>

        <div className="cat-manage-list">
          {categories.map((c) => {
            const isFallback = c.id === FALLBACK_CATEGORY_ID;
            const count = counts[c.id] ?? 0;
            return (
              <div key={c.id} className="cat-manage-row">
                <div className="cat-glyph-anchor">
                  <button className="cat-manage-glyph" title="Change icon" aria-label={`Change icon for ${c.label}`} onClick={() => setGlyphId((prev) => (prev === c.id ? null : c.id))}>
                    {c.glyph}
                  </button>
                  {glyphId === c.id && (
                    <div className="cat-glyph-picker" role="menu">
                      {GLYPH_CHOICES.map((g) => (
                        <button
                          key={g}
                          className={`cat-glyph-choice${g === c.glyph ? " is-active" : ""}`}
                          title={`Use ${g}`}
                          onClick={() => {
                            onSetGlyph(c.id, g);
                            setGlyphId(null);
                          }}
                        >
                          {g}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {renamingId === c.id ? (
                  <input
                    className="cat-manage-input"
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitRename(c.id);
                      if (e.key === "Escape") setRenamingId(null);
                    }}
                    onBlur={() => submitRename(c.id)}
                  />
                ) : confirmId === c.id ? (
                  <span className="cat-manage-confirm">
                    Delete “{c.label}”?
                    {count > 0 && (
                      <em>
                        {" "}
                        {count} item{count === 1 ? "" : "s"} → Other
                      </em>
                    )}
                    <button
                      className="cat-confirm-yes"
                      onClick={() => {
                        onDelete(c.id);
                        setConfirmId(null);
                      }}
                    >
                      delete
                    </button>
                    <button className="cat-confirm-no" onClick={() => setConfirmId(null)}>
                      keep
                    </button>
                  </span>
                ) : (
                  <>
                    <span className="cat-manage-label">{c.label}</span>
                    <span className="cat-manage-actions">
                      <button
                        className="cat-manage-action"
                        title="Rename category"
                        onClick={() => {
                          setRenamingId(c.id);
                          setRenameDraft(c.label);
                        }}
                      >
                        ✎
                      </button>
                      {!isFallback && (
                        <button className="cat-manage-action danger" title="Delete category" onClick={() => setConfirmId(c.id)}>
                          ✕
                        </button>
                      )}
                    </span>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="cat-manage-add">
          <input
            className="cat-manage-input"
            placeholder="New category name…"
            value={addDraft}
            onChange={(e) => setAddDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitAdd();
            }}
          />
          <button className="btn btn-primary btn-sm" disabled={!addDraft.trim()} onClick={submitAdd}>
            ＋ Add
          </button>
        </div>
      </div>
    </div>
  );
}
