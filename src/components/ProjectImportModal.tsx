import {useDialog} from "../lib/useDialog";
import {useEffect, useRef, useState} from "react";
import {copyProjectForImport, exportProjectImportSkill, exportProjectTemplate, parseProjectJson} from "../lib/export";
import type {Categories} from "../lib/store";
import type {Project} from "../types";

interface Props {
  templateCategories: Categories;
  onImport: (project: Project, categories: Categories) => void;
  onClose: () => void;
}

export function ProjectImportModal({templateCategories, onImport, onClose}: Props) {
  const {dialogRef, onDialogKeyDown} = useDialog<HTMLElement>(onClose);
  const fileRef = useRef<HTMLInputElement>(null);
  const chooseRef = useRef<HTMLButtonElement>(null);
  const readVersionRef = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [categories, setCategories] = useState<Categories>([]);
  const [error, setError] = useState<string | null>(null);

  const readFile = (file: File) => {
    const readVersion = ++readVersionRef.current;
    setFileName(file.name);
    setReading(true);
    setProject(null);
    setCategories([]);
    setError(null);
    file.text().then((text) => {
      if (readVersion !== readVersionRef.current) return;
      const result = parseProjectJson(text);
      setProject(result.project ?? null);
      setCategories(result.categories ?? []);
      setError(result.error ?? null);
    }).catch(() => { if (readVersion === readVersionRef.current) setError("Could not read this file."); }).finally(() => { if (readVersion === readVersionRef.current) setReading(false); });
  };

  useEffect(() => { chooseRef.current?.focus(); return () => { readVersionRef.current += 1; }; }, []);

  return (
    <div className="modal-veil" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} tabIndex={-1} className="modal modal-narrow" role="dialog" aria-modal="true" aria-labelledby="project-import-title" onKeyDown={onDialogKeyDown}>
        <div className="modal-head">
          <h2 id="project-import-title">Import project</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="modal-intro">Add a project from a Chisely project JSON file. The import creates a separate copy and will not overwrite an existing project.</p>
        <div className={`dropzone project-import-dropzone${dragging ? " active" : ""}`} onDragEnter={(event) => { event.preventDefault(); setDragging(true); }} onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); const file = event.dataTransfer.files[0]; if (file) readFile(file); }}>
          <input ref={fileRef} hidden type="file" accept=".json,application/json" onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ""; if (file) readFile(file); }} />
          <span className="dropzone-icon" aria-hidden="true">⇡</span>
          <strong>{dragging ? "Drop the JSON file here" : fileName ? fileName : "Drag and drop a project JSON file"}</strong>
          <span>{fileName ? "Choose another file or drop it here" : "or"}</span>
          <button ref={chooseRef} type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>Choose JSON file</button>
        </div>
        <div className="project-import-downloads">
          <button type="button" className="project-template-download" onClick={() => exportProjectImportSkill(templateCategories)}>Download project import skill (.md)</button>
          <button type="button" className="project-template-download" onClick={() => exportProjectTemplate(templateCategories)}>Download template JSON</button>
        </div>
        {reading ? (
          <p className="project-import-status" role="status">Reading {fileName}…</p>
        ) : error ? (
          <div className="import-error project-import-error" role="alert">{error}</div>
        ) : project ? (
          <div className="project-import-preview">
            <div className="import-summary workspace-import-summary">
              <strong>{project.title || "Untitled project"}</strong>
              <span>{project.tasks.length} task{project.tasks.length === 1 ? "" : "s"}</span>
            </div>
          </div>
        ) : null}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={!project || reading} onClick={() => project && onImport(copyProjectForImport(project), categories)}>Import as copy</button>
        </div>
      </section>
    </div>
  );
}
