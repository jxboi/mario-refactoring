import {useState} from "react";
import type {CategoryDef, TypeConfig} from "../types";
import type {Skill} from "../lib/skills";
import {composeSkillMarkdown, exampleImportJson, skillFileStem} from "../lib/skills";

interface Props {
  skills: Skill[];
  categories: CategoryDef[];
  config: TypeConfig;
  onCreate: () => Skill;
  onUpdate: (id: string, patch: Partial<Omit<Skill, "id" | "createdAt">>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function SkillsManager({skills, categories, config, onCreate, onUpdate, onDelete, onClose}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(skills[0]?.id ?? null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copied, setCopied] = useState(false);

  const selected = skills.find((s) => s.id === selectedId) ?? null;

  const handleCreate = () => {
    const skill = onCreate();
    setSelectedId(skill.id);
    setConfirmDelete(false);
  };

  const handleDelete = (id: string) => {
    const idx = skills.findIndex((s) => s.id === id);
    onDelete(id);
    const next = skills[idx + 1] ?? skills[idx - 1] ?? null;
    setSelectedId(next?.id ?? null);
    setConfirmDelete(false);
  };

  const copyPrompt = (skill: Skill) => {
    const md = composeSkillMarkdown(skill, config, categories);
    navigator.clipboard?.writeText(md).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      },
      () => {},
    );
  };

  return (
    <div className="modal-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-skills">
        <div className="modal-head">
          <h2>Skills</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <p className="modal-intro">
          Skills are reusable refactoring prompts. Author one, download it as a <code>.md</code> file, and hand it to an AI agent — it returns a JSON file you can drop into <strong>Import JSON</strong>.
        </p>

        <div className="skills-body">
          <aside className="skills-list">
            {skills.map((s) => (
              <button
                key={s.id}
                className={`skills-list-item${s.id === selectedId ? " active" : ""}`}
                onClick={() => {
                  setSelectedId(s.id);
                  setConfirmDelete(false);
                }}
              >
                <span className="skills-list-name">{s.name || "Untitled skill"}</span>
                {s.description.trim() && <span className="skills-list-desc">{s.description}</span>}
              </button>
            ))}
            <button className="skills-new" onClick={handleCreate}>
              ＋ New skill
            </button>
          </aside>

          <section className="skills-editor">
            {selected ? (
              <>
                <label className="field">
                  <span className="field-label">Name</span>
                  <input className="input" value={selected.name} placeholder="e.g. Refactoring audit" onChange={(e) => onUpdate(selected.id, {name: e.target.value})} />
                </label>
                <label className="field">
                  <span className="field-label">Description</span>
                  <input className="input" value={selected.description} placeholder="A one-line summary of what this skill does" onChange={(e) => onUpdate(selected.id, {description: e.target.value})} />
                </label>
                <label className="field skills-body-field">
                  <span className="field-label">Prompt</span>
                  <textarea className="input mono skills-textarea" value={selected.body} placeholder="Describe what the agent should look for…" onChange={(e) => onUpdate(selected.id, {body: e.target.value})} />
                </label>
                <p className="skills-hint">
                  On download, an <strong>Output format</strong> section describing Chisel's import schema is appended automatically, so the agent returns importable JSON.
                </p>

                <div className="skills-actions">
                  <button className="btn btn-primary btn-sm" onClick={() => download(`${skillFileStem(selected)}.md`, composeSkillMarkdown(selected, config, categories), "text/markdown")}>
                    <span className="btn-icon">⇣</span> Download .md
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => copyPrompt(selected)}>
                    {copied ? "Copied!" : "Copy prompt"}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => download(`${config.id}-example.json`, exampleImportJson(config.id), "application/json")} title="A ready-to-import example in the target schema">
                    Example .json
                  </button>
                  {confirmDelete ? (
                    <span className="skills-confirm">
                      Delete?
                      <button className="skills-confirm-yes" onClick={() => handleDelete(selected.id)}>
                        yes
                      </button>
                      <button className="skills-confirm-no" onClick={() => setConfirmDelete(false)}>
                        no
                      </button>
                    </span>
                  ) : (
                    <button className="btn btn-ghost btn-sm btn-quiet-danger skills-delete" onClick={() => setConfirmDelete(true)}>
                      Delete
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="skills-empty">
                <p>No skills yet.</p>
                <button className="btn btn-primary btn-sm" onClick={handleCreate}>
                  ＋ Create your first skill
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
