import {useEffect, useRef, useState} from "react";
import type {ParseResult} from "../lib/parse";
import {parseRefactorJson, readProjectType} from "../lib/parse";
import type {CategoriesByType} from "../lib/store";
import type {CategoryDef, ProjectType, WorkItem} from "../types";
import {categoryMeta, typeConfig} from "../types";
import {RiskPill} from "./ui";

interface Props {
  initialFile: File | null;
  categoriesByType: CategoriesByType;
  /** The active board's type, used until a file declares its own type. */
  defaultType: ProjectType;
  onClose: () => void;
  onImport: (items: WorkItem[], categories: CategoryDef[], projectType: ProjectType) => void;
}

export function ImportModal({initialFile, categoriesByType, defaultType, onClose, onImport}: Props) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ParseResult | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [zoneActive, setZoneActive] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const readFile = (file: File) => {
    setFileName(file.name);
    file.text().then((text) => {
      // Route the file to the categories of the type it declares, so custom
      // categories resolve against the right board instead of the active one.
      const type = readProjectType(text) ?? defaultType;
      setResult(parseRefactorJson(text, categoriesByType[type], type));
      setExcluded(new Set());
    });
  };

  useEffect(() => {
    if (initialFile) readFile(initialFile);
  }, [initialFile]);

  const validRows = result?.rows.filter((r) => r.ok) ?? [];
  const invalidRows = result?.rows.filter((r) => !r.ok) ?? [];
  const toImport = validRows.filter((r) => !excluded.has(r.index));

  // Once a file declares its type, preview it against that board's config/categories.
  const projectType = result?.projectType ?? defaultType;
  const config = typeConfig(projectType);
  const categories = categoriesByType[projectType];

  const toggleRow = (index: number) => {
    const next = new Set(excluded);
    next.has(index) ? next.delete(index) : next.add(index);
    setExcluded(next);
  };

  const reset = () => {
    setResult(null);
    setFileName(null);
    setExcluded(new Set());
  };

  return (
    <div className="modal-veil" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <h2>{result ? "Review import" : `Import ${config.itemNounPlural}`}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {!result && (
          <div
            className={`dropzone${zoneActive ? " active" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setZoneActive(true);
            }}
            onDragLeave={() => setZoneActive(false)}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setZoneActive(false);
              const f = e.dataTransfer.files[0];
              if (f) readFile(f);
            }}
            onClick={() => fileInput.current?.click()}
          >
            <span className="dropzone-icon">{}⇣</span>
            <p>
              Drop a <code>.json</code> file here, or <span className="dropzone-link">browse</span>
            </p>
            <p className="dropzone-hint">
              An array of items, or an object with an <code>items</code> / <code>tasks</code> / <code>refactorings</code> array. Field names are matched flexibly.
            </p>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) readFile(f);
              }}
            />
          </div>
        )}

        {result?.fileError && (
          <div className="import-error">
            <strong>Couldn't read {fileName}</strong>
            <p>{result.fileError}</p>
            <button className="btn btn-ghost btn-sm" onClick={reset}>
              Try another file
            </button>
          </div>
        )}

        {result && !result.fileError && (
          <>
            <div className="import-summary">
              <span className="import-file mono">{fileName}</span>
              <span className="import-counts">
                <span className="count-ok">{validRows.length} valid</span>
                {invalidRows.length > 0 && <span className="count-bad">{invalidRows.length} skipped</span>}
              </span>
            </div>

            <div className="import-list">
              {result.rows.map((row) =>
                row.ok && row.item ? (
                  <label key={row.index} className={`import-row${excluded.has(row.index) ? " excluded" : ""}`}>
                    <input type="checkbox" checked={!excluded.has(row.index)} onChange={() => toggleRow(row.index)} />
                    <div className="import-row-body">
                      <div className="import-row-title">
                        <span className="import-cat">{categoryMeta(row.item.category, categories).glyph}</span>
                        {row.item.title}
                      </div>
                      <div className="import-row-meta">
                        <RiskPill risk={row.item.risk} />
                        <span className="import-stage">→ {config.stages.find((s) => s.id === row.item!.stage)?.label}</span>
                        {config.showFiles && row.item.files[0] && <code className="import-path">{row.item.files[0]}</code>}
                        {row.item.blocked && <span className="import-blocked">⛔ blocked</span>}
                      </div>
                      {row.warnings.map((w, i) => (
                        <div key={i} className="import-warning">
                          ⚠ {w}
                        </div>
                      ))}
                    </div>
                  </label>
                ) : (
                  <div key={row.index} className="import-row import-row-invalid">
                    <span className="import-invalid-x">✕</span>
                    <div className="import-row-body">
                      <div className="import-row-title">Item {row.index + 1}</div>
                      {row.errors.map((err, i) => (
                        <div key={i} className="import-warning">
                          {err}
                        </div>
                      ))}
                    </div>
                  </div>
                ),
              )}
            </div>

            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={reset}>
                ← Different file
              </button>
              <button
                className="btn btn-primary"
                disabled={toImport.length === 0}
                onClick={() =>
                  onImport(
                    toImport.map((r) => r.item!),
                    result?.categories ?? [],
                    projectType,
                  )
                }
              >
                Import {toImport.length} {toImport.length === 1 ? "item" : "items"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
