import {useEffect, useRef, useState} from "react";
import type {CategoryDef, RefactorItem, Stage, TypeConfig} from "../types";
import {categoryMeta} from "../types";
import {EffortDots, RiskPill} from "./ui";

interface BoardProps {
  items: RefactorItem[];
  totalCount: number;
  categories: CategoryDef[];
  config: TypeConfig;
  onMove: (id: string, stage: Stage, beforeId?: string) => void;
  onSelect: (id: string) => void;
  onAddItem: (stage: Stage) => void;
  onImportClick: () => void;
  onLoadSample: () => void;
}

const DRAG_MIME = "application/x-chisel-item";

export function Board({items, totalCount, categories, config, onMove, onSelect, onAddItem, onImportClick, onLoadSample}: BoardProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  // Columns the user has collapsed. Seeded with any stage marked hiddenByDefault
  // (e.g. Deferred) so those start collapsed, but every column can be toggled.
  const [collapsed, setCollapsed] = useState<Set<Stage>>(() => new Set(config.stages.filter((s) => s.hiddenByDefault).map((s) => s.id)));

  const setStageCollapsed = (stage: Stage, value: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (value) next.add(stage);
      else next.delete(stage);
      return next;
    });

  if (totalCount === 0) {
    return (
      <main className="board-empty">
        <div className="empty-card">
          <svg className="empty-mark" viewBox="0 0 32 32" aria-hidden="true">
            <rect width="32" height="32" rx="7" fill="var(--brand-bg)" />
            <path d="M9 23 L20 12 L23 15 L12 26 Z M21.5 10.5 L24.5 7.5 L27.5 10.5 L24.5 13.5 Z" fill="var(--accent)" />
          </svg>
          <h1>{config.tagline}</h1>
          <p>{config.blurb}</p>
          <div className="empty-actions">
            <button className="btn btn-primary" onClick={onImportClick}>
              <span className="btn-icon">⇡</span> Import JSON
            </button>
            <button className="btn btn-ghost" onClick={() => onAddItem("queued")}>
              ＋ New item
            </button>
            <button className="btn btn-ghost" onClick={onLoadSample}>
              Explore with sample data
            </button>
          </div>
          <pre className="empty-schema">{config.schema}</pre>
        </div>
      </main>
    );
  }

  const handleDrop = (e: React.DragEvent, stage: Stage, beforeId?: string) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData(DRAG_MIME);
    if (id) onMove(id, stage, beforeId);
    setDragId(null);
    setOverStage(null);
  };

  const now = Date.now();

  return (
    <main className="board">
      {config.stages.map((stage) => {
        const stageItems = items.filter((i) => i.stage === stage.id);

        // Any collapsed column shows as a slim strip until the user reveals it.
        // Dropping a card on the strip still moves it into the stage without
        // expanding.
        if (collapsed.has(stage.id)) {
          return (
            <button
              key={stage.id}
              type="button"
              className={`column-collapsed${overStage === stage.id ? " drag-over" : ""}`}
              title={`${stage.label} — ${stage.hint}. Click to show.`}
              onClick={() => setStageCollapsed(stage.id, false)}
              onDragOver={(e) => {
                if (e.dataTransfer.types.includes(DRAG_MIME)) {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  setOverStage(stage.id);
                }
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) setOverStage(null);
              }}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              <span className="column-collapsed-label">{stage.label}</span>
              <span className="column-count">{stageItems.length}</span>
              <span className="column-collapsed-hint">show</span>
            </button>
          );
        }

        // Recency-windowed columns (Deployed) only surface recent items; older
        // ones drop off the board but are still counted so nothing looks lost.
        let colItems = stageItems;
        if (stage.recentDays != null) {
          const cutoff = now - stage.recentDays * 86_400_000;
          colItems = stageItems.filter((i) => i.updatedAt >= cutoff);
        }

        return (
          <section
            key={stage.id}
            className={`column column-${stage.group}${overStage === stage.id ? " drag-over" : ""}`}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes(DRAG_MIME)) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setOverStage(stage.id);
              }
            }}
            onDragLeave={(e) => {
              if (e.currentTarget === e.target) setOverStage(null);
            }}
            onDrop={(e) => handleDrop(e, stage.id)}
          >
            <header className="column-head" title={stage.hint}>
              {stage.group === "active" && <span className="column-live-dot" aria-hidden="true" />}
              {stage.group === "done" && (
                <span className="column-done-check" aria-hidden="true">
                  ✓
                </span>
              )}
              <span className="column-title">{stage.label}</span>
              <span className="column-count">{colItems.length}</span>
              {!stage.hiddenByDefault && (
                <button className="column-add-btn" title={`Add item to ${stage.label}`} aria-label={`Add item to ${stage.label}`} onClick={() => onAddItem(stage.id)}>
                  ＋
                </button>
              )}
              <ColumnMenu label={stage.label} canAdd={!stage.hiddenByDefault} onAdd={() => onAddItem(stage.id)} onCollapse={() => setStageCollapsed(stage.id, true)} />
            </header>
            <div className="column-body">
              {colItems.map((item) => (
                <Card
                  key={item.id}
                  item={item}
                  categories={categories}
                  showFiles={config.showFiles}
                  dragging={dragId === item.id}
                  onSelect={() => onSelect(item.id)}
                  onDragStart={(e) => {
                    e.dataTransfer.setData(DRAG_MIME, item.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDragId(item.id);
                  }}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverStage(null);
                  }}
                  onDropBefore={(e) => handleDrop(e, stage.id, item.id)}
                />
              ))}
              {colItems.length === 0 && <div className="column-placeholder">Empty</div>}
            </div>
          </section>
        );
      })}
    </main>
  );
}

interface ColumnMenuProps {
  label: string;
  canAdd: boolean;
  onAdd: () => void;
  onCollapse: () => void;
}

function ColumnMenu({label, canAdd, onAdd, onCollapse}: ColumnMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="col-menu" ref={rootRef}>
      <button className={`col-menu-btn${open ? " open" : ""}`} title={`${label} options`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        ⋯
      </button>
      {open && (
        <div className="col-menu-pop" role="menu">
          {canAdd && (
            <button
              className="col-menu-item"
              role="menuitem"
              onClick={() => {
                onAdd();
                setOpen(false);
              }}
            >
              <span className="col-menu-icon">＋</span> New item
            </button>
          )}
          <button
            className="col-menu-item"
            role="menuitem"
            onClick={() => {
              onCollapse();
              setOpen(false);
            }}
          >
            <span className="col-menu-icon">‹</span> Collapse
          </button>
        </div>
      )}
    </div>
  );
}

interface CardProps {
  item: RefactorItem;
  categories: CategoryDef[];
  showFiles: boolean;
  dragging: boolean;
  onSelect: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDropBefore: (e: React.DragEvent) => void;
}

function Card({item, categories, showFiles, dragging, onSelect, onDragStart, onDragEnd, onDropBefore}: CardProps) {
  const cat = categoryMeta(item.category, categories);
  return (
    <article
      className={`card${dragging ? " dragging" : ""}${item.blocked ? " card-blocked" : ""}${item.stage === "deployed" ? " card-landed" : ""}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDrop={onDropBefore}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes(DRAG_MIME)) e.preventDefault();
      }}
      onClick={onSelect}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
    >
      <div className="card-tags">
        <span className="card-cat">{cat.label}</span>
        {item.blocked && (
          <span className="card-blocked-tag" title={item.blockReason || "Blocked"}>
            Blocked
          </span>
        )}
      </div>
      <div className={`card-title${item.title ? "" : " untitled"}`}>{item.title || "Untitled"}</div>
      {showFiles && item.files.length > 0 && (
        <div className="card-file">
          <code>{item.files[0]}</code>
          {item.files.length > 1 && <span className="card-file-more">+{item.files.length - 1}</span>}
        </div>
      )}
      <div className="card-meta">
        <span className="card-meta-right">
          {item.notes.length > 0 && (
            <span className="card-notes" title={`${item.notes.length} notes`}>
              ✎{item.notes.length}
            </span>
          )}
          <EffortDots effort={item.effort} />
          <RiskPill risk={item.risk} />
        </span>
      </div>
    </article>
  );
}
