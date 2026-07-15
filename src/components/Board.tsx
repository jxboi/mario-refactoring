import {Fragment, useEffect, useRef, useState} from "react";
import type {CategoryDef, ItemConfig, Stage, Task, TaskLayout} from "../types";
import {categoryMeta, EFFORT_LABELS} from "../types";
import {EffortDots, RiskPill, timeAgo} from "./ui";

interface BoardProps {
  items: Task[];
  totalCount: number;
  categories: CategoryDef[];
  config: ItemConfig;
  layout: TaskLayout;
  onMove: (id: string, stage: Stage, beforeId?: string) => void;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAddItem: (stage: Stage) => void;
  onLoadSample: () => void;
}

const DRAG_MIME = "application/x-chisel-item";

/**
 * Work out which card the cursor's Y sits in front of within a column body.
 * Returns that card's id, or null when the cursor is past the last card (drop at
 * the end). Reading live rects for every card in one pass keeps the drop slot
 * stable, so inserting the placeholder can't feed back into the calculation.
 */
function slotBeforeId(container: HTMLElement, clientY: number): string | null {
  const cards = Array.from(container.querySelectorAll<HTMLElement>(".card"));
  for (const el of cards) {
    const rect = el.getBoundingClientRect();
    if (clientY < rect.top + rect.height / 2) return el.dataset.id ?? null;
  }
  return null;
}

export function Board({items, totalCount, categories, config, layout, onMove, onSelect, onDuplicate, onDelete, onAddItem, onLoadSample}: BoardProps) {
  const [showIntro, setShowIntro] = useState(layout === "board");
  const previousLayout = useRef(layout);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  // Where a placeholder should show while dragging: the target stage and the id
  // of the card the dragged item would land in front of (null = end of column).
  const [dropTarget, setDropTarget] = useState<{stage: Stage; beforeId: string | null} | null>(null);
  // Height of the card being dragged, so the placeholder matches its size.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  // Columns the user has collapsed. Seeded with any stage marked hiddenByDefault
  // (e.g. Deferred) so those start collapsed, but every column can be toggled.
  const [collapsed, setCollapsed] = useState<Set<Stage>>(() => new Set(config.stages.filter((s) => s.hiddenByDefault).map((s) => s.id)));

  useEffect(() => {
    if (previousLayout.current !== layout) {
      previousLayout.current = layout;
      setShowIntro(false);
    }
  }, [layout]);

  const setStageCollapsed = (stage: Stage, value: boolean) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (value) next.add(stage);
      else next.delete(stage);
      return next;
    });

  if (showIntro || totalCount === 0) {
    return (
      <main className="board-empty">
        <section className="front-page front-page-simple">
          <div className="front-copy">
            <span className="front-kicker">Task board</span>
            <h1>Turn the project into clear, actionable tasks</h1>
            <p className="front-lede">Create tasks, prioritize the work, and move it through delivery.</p>
            <div className="front-actions">
              <button className="btn btn-primary" onClick={() => onAddItem("queued")}>+ New Task</button>
              {totalCount > 0
                ? <button className="btn btn-ghost" onClick={() => setShowIntro(false)}>Open Tasks ({totalCount})</button>
                : <button className="btn btn-ghost" onClick={onLoadSample}>Explore sample</button>}
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (layout === "list") {
    return (
      <TaskList
        items={items}
        totalCount={totalCount}
        categories={categories}
        config={config}
        onMove={onMove}
        onSelect={onSelect}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        onAddItem={onAddItem}
      />
    );
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const id = e.dataTransfer.getData(DRAG_MIME);
    if (id && dropTarget) onMove(id, dropTarget.stage, dropTarget.beforeId ?? undefined);
    setDragId(null);
    setOverStage(null);
    setDropTarget(null);
  };

  // A placeholder is pointless when it marks the dragged card's current slot.
  const isNoOp = (beforeId: string | null, list: Task[]) => {
    if (dragId == null) return false;
    const di = list.findIndex((i) => i.id === dragId);
    if (di < 0) return false; // dragging in from another column — always a real move
    if (beforeId === null) return di === list.length - 1;
    const bi = list.findIndex((i) => i.id === beforeId);
    return bi === di || bi === di + 1;
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
                  setDropTarget({stage: stage.id, beforeId: null});
                }
              }}
              onDragLeave={(e) => {
                if (e.currentTarget === e.target) {
                  setOverStage(null);
                  setDropTarget(null);
                }
              }}
              onDrop={handleDrop}
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
              if (e.currentTarget === e.target) {
                setOverStage(null);
                setDropTarget(null);
              }
            }}
            onDrop={handleDrop}
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
            <div
              className="column-body"
              onDragOver={(e) => {
                if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = "move";
                setOverStage(stage.id);
                setDropTarget({stage: stage.id, beforeId: slotBeforeId(e.currentTarget, e.clientY)});
              }}
              onDrop={handleDrop}
            >
              {colItems.map((item) => (
                <Fragment key={item.id}>
                  {dropTarget?.stage === stage.id && dropTarget.beforeId === item.id && !isNoOp(item.id, colItems) && <div className="card-placeholder" style={dragHeight ? {height: dragHeight} : undefined} />}
                  <Card
                    item={item}
                    categories={categories}
                    dragging={dragId === item.id}
                    onSelect={() => onSelect(item.id)}
                    onDuplicate={() => onDuplicate(item.id)}
                    onDelete={() => onDelete(item.id)}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_MIME, item.id);
                      e.dataTransfer.effectAllowed = "move";
                      setDragId(item.id);
                      setDragHeight(e.currentTarget.getBoundingClientRect().height);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverStage(null);
                      setDropTarget(null);
                      setDragHeight(null);
                    }}
                  />
                </Fragment>
              ))}
              {dropTarget?.stage === stage.id && dropTarget.beforeId === null && !isNoOp(null, colItems) && <div className="card-placeholder" style={dragHeight ? {height: dragHeight} : undefined} />}
              {colItems.length === 0 && overStage !== stage.id && <div className="column-placeholder">Empty</div>}
            </div>
          </section>
        );
      })}
    </main>
  );
}

interface TaskListProps {
  items: Task[];
  totalCount: number;
  categories: CategoryDef[];
  config: ItemConfig;
  onMove: (id: string, stage: Stage) => void;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAddItem: (stage: Stage) => void;
}

function TaskList({items, totalCount, categories, config, onMove, onSelect, onDuplicate, onDelete, onAddItem}: TaskListProps) {
  const [collapsedStages, setCollapsedStages] = useState<Set<Stage>>(() => new Set());
  const activeCount = items.filter((item) => item.stage === "active" || item.stage === "reviewing").length;
  const blockedCount = items.filter((item) => item.blocked).length;

  const toggleStage = (stage: Stage) => {
    setCollapsedStages((current) => {
      const next = new Set(current);
      if (next.has(stage)) next.delete(stage);
      else next.add(stage);
      return next;
    });
  };

  if (items.length === 0) {
    return (
      <main className="task-list-page task-list-empty">
        <span className="task-list-empty-icon" aria-hidden="true">⌕</span>
        <strong>No tasks match these filters</strong>
        <p>Adjust the search or filters above to see more tasks.</p>
      </main>
    );
  }

  return (
    <main className="task-list-page">
      <div className="task-list-shell">
        <header className="task-list-titlebar">
          <div className="task-list-heading">
            <span className="front-kicker">Project tasks</span>
            <h1>All tasks</h1>
            <div className="task-list-title-meta" aria-label="Task summary">
              <span><strong>{items.length}</strong>{items.length === totalCount ? " total" : ` of ${totalCount} shown`}</span>
              <span><i className="task-list-meta-dot active" aria-hidden="true" />{activeCount} active</span>
              {blockedCount > 0 && <span className="blocked"><i className="task-list-meta-dot" aria-hidden="true" />{blockedCount} blocked</span>}
            </div>
          </div>
          <button className="btn btn-primary task-list-new" aria-label="New task" onClick={() => onAddItem("queued")}><span aria-hidden="true">＋</span> New Task</button>
        </header>
        <div className="task-list-table" role="table" aria-label="Project tasks">
          <div className="task-list-columns" role="row">
            <span role="columnheader">Task</span>
            <span role="columnheader">Category</span>
            <span role="columnheader">Priority</span>
            <span role="columnheader">Effort</span>
            <span role="columnheader">Updated</span>
            <span role="columnheader">Status</span>
          </div>
          {config.stages.map((stage) => {
            const stageItems = items.filter((item) => item.stage === stage.id);
            if (stageItems.length === 0) return null;
            const isCollapsed = collapsedStages.has(stage.id);
            return (
              <section className={`task-list-group task-list-group-${stage.group}${isCollapsed ? " collapsed" : ""}`} key={stage.id} role="rowgroup" aria-label={stage.label}>
                <header className="task-list-group-head">
                  <button className="task-list-collapse" onClick={() => toggleStage(stage.id)} aria-label={`${isCollapsed ? "Expand" : "Collapse"} ${stage.label}`} aria-expanded={!isCollapsed} title={`${isCollapsed ? "Expand" : "Collapse"} ${stage.label}`}><span aria-hidden="true">⌄</span></button>
                  <span className={`task-status-dot task-status-${stage.group}`} aria-hidden="true" />
                  <h2>{stage.label}</h2>
                  <span>{stageItems.length}</span>
                  <button className="task-list-group-add" onClick={() => onAddItem(stage.id)} aria-label={`Add task to ${stage.label}`} title={`Add task to ${stage.label}`}>＋</button>
                </header>
                {!isCollapsed && stageItems.map((item) => (
                  <TaskListRow
                    key={item.id}
                    item={item}
                    categories={categories}
                    config={config}
                    onMove={(nextStage) => onMove(item.id, nextStage)}
                    onSelect={() => onSelect(item.id)}
                    onDuplicate={() => onDuplicate(item.id)}
                    onDelete={() => onDelete(item.id)}
                  />
                ))}
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}

interface TaskListRowProps {
  item: Task;
  categories: CategoryDef[];
  config: ItemConfig;
  onMove: (stage: Stage) => void;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function TaskListRow({item, categories, config, onMove, onSelect, onDuplicate, onDelete}: TaskListRowProps) {
  const cat = categoryMeta(item.category, categories);
  const updated = new Date(item.updatedAt);
  const stageGroup = config.stages.find((stage) => stage.id === item.stage)?.group ?? "backlog";
  const hasSummary = item.blocked || item.description || item.tags.length > 0 || item.notes.length > 0;
  return (
    <div
      className={`task-list-row${item.blocked ? " blocked" : ""}${item.stage === "deployed" ? " complete" : ""}`}
      role="row"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      <div className="task-list-primary" role="cell">
        <span className={`task-list-name${item.title ? "" : " untitled"}`}>{item.title || "Untitled"}</span>
        {hasSummary && <span className="task-list-summary">
          {item.blocked && <strong title={item.blockReason || "Blocked"}>Blocked</strong>}
          {item.description && <span className="task-list-description">{item.description}</span>}
          {item.tags.length > 0 && <span className="task-list-tags" aria-label={`Tags: ${item.tags.join(", ")}`}>{item.tags.slice(0, 2).map((tag) => <i key={tag}>#{tag}</i>)}{item.tags.length > 2 && <i>+{item.tags.length - 2}</i>}</span>}
          {item.notes.length > 0 && <span className="task-list-note-count" title={`${item.notes.length} notes`}>✎ {item.notes.length}</span>}
        </span>}
      </div>
      <span className="task-list-category" role="cell"><i aria-hidden="true">{cat.glyph}</i>{cat.label}</span>
      <span className="task-list-priority" role="cell"><RiskPill risk={item.risk} /></span>
      <span className="task-list-effort" role="cell" title={`Effort: ${EFFORT_LABELS[item.effort]}`}><EffortDots effort={item.effort} /><small>{EFFORT_LABELS[item.effort]}</small></span>
      <time className="task-list-updated" role="cell" dateTime={updated.toISOString()} title={updated.toLocaleString()}>{timeAgo(item.updatedAt)}</time>
      <div className="task-list-controls" role="cell" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <label className={`task-list-status task-list-status-${stageGroup}`}>
          <span className="sr-only">Status for {item.title || "Untitled task"}</span>
          <span className="task-list-status-mark" aria-hidden="true" />
          <select value={item.stage} onChange={(event) => { const stage = event.target.value as Stage; if (stage !== item.stage) onMove(stage); }}>
            {config.stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.label}</option>)}
          </select>
        </label>
        <TaskActions title={item.title} onDuplicate={onDuplicate} onDelete={onDelete} />
      </div>
    </div>
  );
}

function TaskActions({title, onDuplicate, onDelete}: {title: string; onDuplicate: () => void; onDelete: () => void}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) { setMenuOpen(false); setConfirmDelete(false); }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setMenuOpen(false); setConfirmDelete(false); }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  return (
    <div className="card-menu" ref={menuRef} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => event.stopPropagation()}>
      <button type="button" className={`card-menu-btn${menuOpen ? " open" : ""}`} aria-label={`Options for ${title || "Untitled task"}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => { setMenuOpen((open) => !open); setConfirmDelete(false); }}>⋯</button>
      {menuOpen && <div className="card-menu-pop" role="menu">{confirmDelete ? <div className="card-menu-confirm"><span>Delete this task?</span><div><button type="button" className="danger" onClick={() => { setMenuOpen(false); onDelete(); }}>Delete</button><button type="button" onClick={() => setConfirmDelete(false)}>Cancel</button></div></div> : <><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDuplicate(); }}><span aria-hidden="true">⧉</span> Duplicate task</button><button type="button" className="danger" role="menuitem" onClick={() => setConfirmDelete(true)}><span aria-hidden="true">×</span> Delete task</button></>}</div>}
    </div>
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
  item: Task;
  categories: CategoryDef[];
  dragging: boolean;
  onSelect: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function Card({item, categories, dragging, onSelect, onDuplicate, onDelete, onDragStart, onDragEnd}: CardProps) {
  const cat = categoryMeta(item.category, categories);

  return (
    <article
      className={`card${dragging ? " dragging" : ""}${item.blocked ? " card-blocked" : ""}${item.stage === "deployed" ? " card-landed" : ""}`}
      data-id={item.id}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
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
        <TaskActions title={item.title} onDuplicate={onDuplicate} onDelete={onDelete} />
      </div>
      <div className={`card-title${item.title ? "" : " untitled"}`}>{item.title || "Untitled"}</div>
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
