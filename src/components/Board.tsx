import {Fragment, useEffect, useRef, useState} from "react";
import type {CSSProperties} from "react";
import {createPortal} from "react-dom";
import type {CategoryDef, ItemConfig, Stage, Task, TaskAssignee, TaskLayout} from "../types";
import {categoryMeta, EFFORT_LABELS} from "../types";
import {filterTasksByRecentDays, type SortDirection} from "../lib/taskFilters";
import {EffortDots, RiskPill, timeAgo} from "./ui";

interface BoardProps {
  items: Task[];
  categories: CategoryDef[];
  config: ItemConfig;
  layout: TaskLayout;
  listSort: "category" | "priority" | "effort" | "updated" | "status";
  categorySort: SortDirection;
  prioritySort: SortDirection;
  effortSort: SortDirection;
  updatedSort: SortDirection;
  statusSort: SortDirection;
  onCategorySort: () => void;
  onPrioritySort: () => void;
  onEffortSort: () => void;
  onUpdatedSort: () => void;
  onStatusSort: () => void;
  onMove: (id: string, stage: Stage, beforeId?: string) => void;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAddItem: (stage: Stage) => void;
}

const DRAG_MIME = "application/x-chisel-item";
const LIST_LEVEL_RANK = {low: 0, medium: 1, high: 2};
type DoneRange = "3" | "7" | "14" | "30" | "90" | "all";
const DONE_RANGE_OPTIONS: Array<{value: DoneRange; label: string}> = [
  {value: "3", label: "Past 3 Days"},
  {value: "7", label: "Past 1 Week"},
  {value: "14", label: "Past 2 Weeks"},
  {value: "30", label: "Past 1 Month"},
  {value: "90", label: "Past 3 Months"},
  {value: "all", label: "Everything"},
];

function DoneRangeMenu({value, onChange}: {value: DoneRange; onChange: (value: DoneRange) => void}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<"root" | "date">("root");
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedLabel = DONE_RANGE_OPTIONS.find((option) => option.value === value)?.label ?? "Past 1 Week";

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setLevel("root");
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (level === "date") setLevel("root");
      else setOpen(false);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [open, level]);

  return (
    <div className="done-range-menu" ref={menuRef}>
      <button
        type="button"
        className={open ? "done-range-trigger open" : "done-range-trigger"}
        aria-label={`Done options. Date: ${selectedLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
          setLevel("root");
        }}
      >
        <span aria-hidden="true">⋮</span>
      </button>
      {open && (
        <div className="done-range-popover" role="menu" aria-label={level === "root" ? "Done options" : "Date timeframe"}>
          {level === "root" ? (
            <button
              type="button"
              role="menuitem"
              className="done-range-submenu-trigger"
              aria-haspopup="menu"
              onClick={() => setLevel("date")}
            >
              <span>{`Date - ${selectedLabel}`}</span>
              <span aria-hidden="true">›</span>
            </button>
          ) : (
            <>
              <button type="button" role="menuitem" className="done-range-back" onClick={() => setLevel("root")}>
                <span aria-hidden="true">‹</span>
                <strong>Date</strong>
              </button>
              <div className="done-range-divider" />
              {DONE_RANGE_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  role="menuitemradio"
                  aria-checked={value === option.value}
                  className={value === option.value ? "active" : ""}
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                    setLevel("root");
                  }}
                >
                  <span>{option.label}</span>
                  {value === option.value && <span aria-hidden="true">✓</span>}
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

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

export function Board({items, categories, config, layout, listSort, categorySort, prioritySort, effortSort, updatedSort, statusSort, onCategorySort, onPrioritySort, onEffortSort, onUpdatedSort, onStatusSort, onMove, onSelect, onDuplicate, onAddItem}: BoardProps) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<Stage | null>(null);
  // Where a placeholder should show while dragging: the target stage and the id
  // of the card the dragged item would land in front of (null = end of column).
  const [dropTarget, setDropTarget] = useState<{stage: Stage; beforeId: string | null} | null>(null);
  // Height of the card being dragged, so the placeholder matches its size.
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const [doneRange, setDoneRange] = useState<DoneRange>("7");
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

  if (layout === "list") {
    return (
      <TaskList
        items={items}
        categories={categories}
        config={config}
        listSort={listSort}
        categorySort={categorySort}
        prioritySort={prioritySort}
        effortSort={effortSort}
        updatedSort={updatedSort}
        statusSort={statusSort}
        onCategorySort={onCategorySort}
        onPrioritySort={onPrioritySort}
        onEffortSort={onEffortSort}
        onUpdatedSort={onUpdatedSort}
        onStatusSort={onStatusSort}
        onMove={onMove}
        onSelect={onSelect}
        onDuplicate={onDuplicate}
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
      {config.stages.map((stage, stageIndex) => {
        const stageItems = items.filter((i) => i.stage === stage.id);
        const isFilterableDone = config.kind === "task" && stage.id === "deployed";
        const recentDays = isFilterableDone ? (doneRange === "all" ? null : Number(doneRange)) : stage.recentDays ?? null;
        const colItems = filterTasksByRecentDays(stageItems, recentDays, now);

        // Any collapsed column shows as a slim strip until the user reveals it.
        // Dropping a card on the strip still moves it into the stage without
        // expanding.
        if (collapsed.has(stage.id)) {
          return (
            <section
              key={stage.id}
              className={`column-collapsed column-collapsed-${stage.group} column-collapsed-stage-${stage.id}${overStage === stage.id ? " drag-over" : ""}`}
              title={`${stage.label} — ${stage.hint}`}
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
              <button
                type="button"
                className="column-collapsed-label"
                title={`Expand ${stage.label}`}
                aria-label={`Expand ${stage.label}`}
                onClick={() => setStageCollapsed(stage.id, false)}
              >
                {stage.label}
              </button>
              <span className="column-count">{colItems.length}</span>
            </section>
          );
        }

        return (
          <section
            key={stage.id}
            className={`column column-${stage.group} column-${stage.id}${overStage === stage.id ? " drag-over" : ""}`}
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
              {stage.id === "active" && <span className="column-live-dot" aria-hidden="true" />}
              <button
                type="button"
                className="column-title"
                title={`Collapse ${stage.label}`}
                aria-label={`Collapse ${stage.label}`}
                onClick={() => setStageCollapsed(stage.id, true)}
              >
                {stage.label}
              </button>
              <span className="column-count">{colItems.length}</span>
              {!stage.hiddenByDefault && (
                <button className="column-add-btn" title={`Add item to ${stage.label}`} aria-label={`Add item to ${stage.label}`} onClick={() => onAddItem(stage.id)}>
                  ＋
                </button>
              )}
              {isFilterableDone && <DoneRangeMenu value={doneRange} onChange={setDoneRange} />}
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
              {colItems.map((item, itemIndex) => (
                <Fragment key={item.id}>
                  {dropTarget?.stage === stage.id && dropTarget.beforeId === item.id && !isNoOp(item.id, colItems) && <div className="card-placeholder" style={dragHeight ? {height: dragHeight} : undefined} />}
                  <Card
                    item={item}
                    categories={categories}
                    dragging={dragId === item.id}
                    entryDelay={Math.min(itemIndex, 8) * 70 + stageIndex * 24}
                    onSelect={() => onSelect(item.id)}
                    onDuplicate={() => onDuplicate(item.id)}
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
            </div>
          </section>
        );
      })}
    </main>
  );
}

interface TaskListProps {
  items: Task[];
  categories: CategoryDef[];
  config: ItemConfig;
  listSort: "category" | "priority" | "effort" | "updated" | "status";
  categorySort: SortDirection;
  prioritySort: SortDirection;
  effortSort: SortDirection;
  updatedSort: SortDirection;
  statusSort: SortDirection;
  onCategorySort: () => void;
  onPrioritySort: () => void;
  onEffortSort: () => void;
  onUpdatedSort: () => void;
  onStatusSort: () => void;
  onMove: (id: string, stage: Stage) => void;
  onSelect: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAddItem: (stage: Stage) => void;
}

function TaskList({items, categories, config, listSort, categorySort, prioritySort, effortSort, updatedSort, statusSort, onCategorySort, onPrioritySort, onEffortSort, onUpdatedSort, onStatusSort, onMove, onSelect, onDuplicate, onAddItem}: TaskListProps) {
  if (items.length === 0) {
    return (
      <main className="task-list-page task-list-empty">
        <span className="task-list-empty-icon" aria-hidden="true">⌕</span>
        <strong>No tasks match these filters</strong>
        <p>Adjust the search or filters above to see more tasks.</p>
      </main>
    );
  }

  const direction = listSort === "category" ? categorySort : listSort === "priority" ? prioritySort : listSort === "effort" ? effortSort : listSort === "updated" ? updatedSort : statusSort;
  const stageRank = new Map(config.stages.map((stage, index) => [stage.id, index]));
  const sortedItems = [...items].sort((left, right) => {
    const difference = listSort === "category"
      ? categoryMeta(left.category, categories).label.localeCompare(categoryMeta(right.category, categories).label, undefined, {sensitivity: "base"})
      : listSort === "priority"
        ? LIST_LEVEL_RANK[left.risk] - LIST_LEVEL_RANK[right.risk]
        : listSort === "effort"
          ? LIST_LEVEL_RANK[left.effort] - LIST_LEVEL_RANK[right.effort]
          : listSort === "updated"
            ? left.updatedAt - right.updatedAt
            : (stageRank.get(left.stage) ?? 0) - (stageRank.get(right.stage) ?? 0);
    return direction === "desc" ? -difference : difference;
  });
  return (
    <main className="task-list-page">
      <div className="task-list-shell">
        <header className="task-list-titlebar">
          <button className="btn btn-primary task-list-new" aria-label="New task" onClick={() => onAddItem("queued")}><span aria-hidden="true">＋</span> New Task</button>
        </header>
        <div className="task-list-table" role="table" aria-label="Project tasks">
          <div className="task-list-columns" role="row">
            <span role="columnheader">Task</span>
            <span role="columnheader" aria-sort={listSort === "category" ? categorySort === "asc" ? "ascending" : "descending" : undefined}>
              <button className="task-list-column-sort" onClick={onCategorySort} aria-label={`Sort category ${categorySort === "asc" ? "reverse alphabetical" : "alphabetically"}`}>
                Category <svg className={categorySort === "asc" ? "ascending" : ""} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
              </button>
            </span>
            <span role="columnheader" aria-sort={listSort === "priority" ? prioritySort === "asc" ? "ascending" : "descending" : undefined}>
              <button className="task-list-column-sort" onClick={onPrioritySort} aria-label={`Sort priority ${prioritySort === "asc" ? "high to low" : "low to high"}`}>
                Priority <svg className={prioritySort === "asc" ? "ascending" : ""} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
              </button>
            </span>
            <span role="columnheader" aria-sort={listSort === "effort" ? effortSort === "asc" ? "ascending" : "descending" : undefined}>
              <button className="task-list-column-sort" onClick={onEffortSort} aria-label={`Sort effort ${effortSort === "asc" ? "high to low" : "low to high"}`}>
                Effort <svg className={effortSort === "asc" ? "ascending" : ""} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
              </button>
            </span>
            <span role="columnheader">Assigned to</span>
            <span role="columnheader" aria-sort={listSort === "updated" ? updatedSort === "asc" ? "ascending" : "descending" : undefined}>
              <button className="task-list-column-sort" onClick={onUpdatedSort} aria-label={`Sort updated ${updatedSort === "asc" ? "newest first" : "oldest first"}`}>
                Updated <svg className={updatedSort === "asc" ? "ascending" : ""} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
              </button>
            </span>
            <span role="columnheader" aria-sort={listSort === "status" ? statusSort === "asc" ? "ascending" : "descending" : undefined}>
              <button className="task-list-column-sort" onClick={onStatusSort} aria-label={`Sort status ${statusSort === "asc" ? "reverse workflow order" : "workflow order"}`}>
                Status <svg className={statusSort === "asc" ? "ascending" : ""} viewBox="0 0 16 16" aria-hidden="true"><path d="m4 6 4 4 4-4" /></svg>
              </button>
            </span>
          </div>
          <div className="task-list-body" role="rowgroup">
            {sortedItems.map((item) => (
              <TaskListRow
                key={item.id}
                item={item}
                categories={categories}
                config={config}
                onMove={(nextStage) => onMove(item.id, nextStage)}
                onSelect={() => onSelect(item.id)}
                onDuplicate={() => onDuplicate(item.id)}
              />
            ))}
          </div>
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
}

function TaskListRow({item, categories, config, onMove, onSelect, onDuplicate}: TaskListRowProps) {
  const cat = categoryMeta(item.category, categories);
  const updated = new Date(item.updatedAt);
  const hasSummary = item.description || item.tags.length > 0 || item.notes.length > 0;
  return (
    <div
      className={`task-list-row task-list-row-stage-${item.stage}${item.stage === "deployed" ? " complete" : ""}`}
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
          {item.description && <span className="task-list-description">{item.description}</span>}
          {item.tags.length > 0 && <span className="task-list-tags" aria-label={`Tags: ${item.tags.join(", ")}`}>{item.tags.slice(0, 2).map((tag) => <i key={tag}>#{tag}</i>)}{item.tags.length > 2 && <i>+{item.tags.length - 2}</i>}</span>}
          {item.notes.length > 0 && <span className="task-list-note-count" title={`${item.notes.length} notes`}>✎ {item.notes.length}</span>}
        </span>}
      </div>
      <span className="task-list-category" role="cell">{cat.label}</span>
      <span className="task-list-priority" role="cell"><RiskPill risk={item.risk} /></span>
      <span className="task-list-effort" role="cell" title={`Effort: ${EFFORT_LABELS[item.effort]}`}><EffortDots effort={item.effort} /></span>
      <span className={`task-list-assignee${item.assignee ? "" : " unassigned"}`} role="cell" title={item.assignee ? `Assigned to ${assigneeLabel(item.assignee)}` : "Unassigned"}>
        {item.assignee ? <><AssigneeAvatar assignee={item.assignee}/><span>{assigneeLabel(item.assignee)}</span></> : <span>-</span>}
      </span>
      <time className="task-list-updated" role="cell" dateTime={updated.toISOString()} title={updated.toLocaleString()}>{timeAgo(item.updatedAt)}</time>
      <div className="task-list-controls" role="cell" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <label className={`task-list-status task-list-status-${item.stage}`}>
          <span className="sr-only">Status for {item.title || "Untitled task"}</span>
          <select value={item.stage} onChange={(event) => { const stage = event.target.value as Stage; if (stage !== item.stage) onMove(stage); }}>
            {config.stages.map((stage) => <option value={stage.id} key={stage.id}>{stage.label}</option>)}
          </select>
        </label>
        <TaskActions title={item.title} onDuplicate={onDuplicate} />
      </div>
    </div>
  );
}

function TaskActions({title, onDuplicate}: {title: string; onDuplicate: () => void}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
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
      <button type="button" className={`card-menu-btn${menuOpen ? " open" : ""}`} aria-label={`Options for ${title || "Untitled task"}`} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}>⋯</button>
      {menuOpen && <div className="card-menu-pop" role="menu"><button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDuplicate(); }}><span aria-hidden="true">⧉</span> Duplicate task</button></div>}
    </div>
  );
}

interface CardProps {
  item: Task;
  categories: CategoryDef[];
  dragging: boolean;
  entryDelay: number;
  onSelect: () => void;
  onDuplicate: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
}

function Card({item, categories, dragging, entryDelay, onSelect, onDuplicate, onDragStart, onDragEnd}: CardProps) {
  const cat = categoryMeta(item.category, categories);
  const [menuAt, setMenuAt] = useState<{left: number; top: number} | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuAt) return;
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuAt(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuAt(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", escape);
    };
  }, [menuAt]);

  const openMenu = (left: number, top: number) => {
    setMenuAt({
      left: Math.max(8, Math.min(left, window.innerWidth - 178)),
      top: Math.max(8, Math.min(top, window.innerHeight - 54)),
    });
  };

  return (
    <>
      <article
        className={`card${dragging ? " dragging" : ""}${item.stage === "deployed" ? " card-landed" : ""}`}
        style={{"--card-stack-delay": `${entryDelay}ms`} as CSSProperties}
        data-id={item.id}
        aria-label={`${item.title || "Untitled task"}, ${item.risk} priority. Right-click for actions.`}
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onClick={onSelect}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          openMenu(event.clientX, event.clientY);
        }}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter") onSelect();
          if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
            event.preventDefault();
            const rect = event.currentTarget.getBoundingClientRect();
            openMenu(rect.left + 16, rect.top + 16);
          }
        }}
      >
        <div className={`card-title${item.title ? "" : " untitled"}`}>{item.title || "Untitled"}</div>
        <div className="card-meta">
          <span className="card-meta-left">
            <span className="card-cat">{cat.label}</span>
            <EffortDots effort={item.effort} priority={item.risk} />
          </span>
          <span className="card-meta-right">
            {item.notes.length > 0 && (
              <span className="card-notes" title={`${item.notes.length} notes`}>
                ✎{item.notes.length}
              </span>
            )}
            {item.assignee&&<span className="card-assignee" title={`Assigned to ${assigneeLabel(item.assignee)}`}><AssigneeAvatar assignee={item.assignee}/></span>}
          </span>
        </div>
      </article>
      {menuAt && createPortal(
        <div
          className="card-context-menu"
          ref={menuRef}
          role="menu"
          style={menuAt}
          onClick={(event) => event.stopPropagation()}
          onContextMenu={(event) => event.preventDefault()}
        >
          <button type="button" role="menuitem" onClick={() => { setMenuAt(null); onDuplicate(); }}><span aria-hidden="true">⧉</span> Duplicate task</button>
        </div>,
        document.body,
      )}
    </>
  );
}

function assigneeLabel(assignee:TaskAssignee){return assignee.name||`@${assignee.login}`}
function AssigneeAvatar({assignee}:{assignee:TaskAssignee}){const label=assigneeLabel(assignee);return assignee.avatarUrl?<img className="assignee-avatar" src={assignee.avatarUrl} alt=""/>:<span className="assignee-avatar assignee-avatar-fallback" aria-hidden="true">{label.replace(/^@/,"").slice(0,1).toUpperCase()}</span>}
