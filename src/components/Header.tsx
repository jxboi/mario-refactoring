import {useEffect, useRef} from "react";
import type {Filters} from "../App";
import type {GitHubUser} from "../lib/auth";
import type {BoardSyncState, Workspace} from "../lib/store";
import {availableTaskCategories} from "../lib/taskFilters";
import type {CategoryDef, Project, Task, TaskLayout} from "../types";
import {AccountMenu} from "./AccountMenu";
import {BrandLogo} from "./BrandLogo";
import {WorkspaceMenu} from "./WorkspaceMenu";

interface Props {
  items: Task[];
  categories: CategoryDef[];
  project: Project | null;
  view: "work" | "timeline";
  taskLayout: TaskLayout;
  workspaces: Workspace[];
  activeWorkspaceId: string;
  filters: Filters;
  onFilters: (filters: Filters) => void;
  onView: (view: "work" | "timeline") => void;
  onTaskLayout: (layout: TaskLayout) => void;
  onManageCategories: () => void;
  onManageSkills: () => void;
  onManageAutomations: () => void;
  onManageCollaboration: () => void;
  onManageInvitations: () => void;
  onShowShortcuts: () => void;
  onWorkspaceSwitch: (id: string) => void;
  onWorkspaceCreate: (name: string) => void;
  onWorkspaceRename: (id: string, name: string) => void;
  onWorkspaceDelete: (id: string) => void;
  onHome: () => void;
  user: GitHubUser;
  isGuest: boolean;
  sync: BoardSyncState;
  onSignOut: () => void;
}

export function Header({
  items,
  categories,
  project,
  view,
  taskLayout,
  workspaces,
  activeWorkspaceId,
  filters,
  onFilters,
  onView,
  onTaskLayout,
  onManageCategories,
  onManageSkills,
  onManageAutomations,
  onManageCollaboration,
  onManageInvitations,
  onShowShortcuts,
  onWorkspaceSwitch,
  onWorkspaceCreate,
  onWorkspaceRename,
  onWorkspaceDelete,
  onHome,
  user,
  isGuest,
  sync,
  onSignOut,
}: Props) {
  const categoryFilterRef = useRef<HTMLDetailsElement>(null);
  const total = items.filter((item) => item.stage !== "deferred").length;
  const priorityDescending = filters.prioritySort === "desc";
  const effortDescending = filters.effortSort === "desc";
  const categoryOptions = availableTaskCategories(items, categories);
  const optionIds = new Set(categoryOptions.map((category) => category.id));
  const selectedCategories = filters.categories.filter((id) => optionIds.has(id));
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      const filter = categoryFilterRef.current;
      if (filter?.open && !filter.contains(event.target as Node)) filter.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && categoryFilterRef.current?.open) {
        categoryFilterRef.current.open = false;
        categoryFilterRef.current.querySelector<HTMLElement>("summary")?.focus();
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  const sort = (field: "priority" | "effort") => {
    if (filters.sortBy !== field) {
      onFilters({...filters, sortBy: field});
      return;
    }
    const key = field === "priority" ? "prioritySort" : "effortSort";
    const direction = filters[key] === "desc" ? "asc" : "desc";
    onFilters({...filters, [key]: direction});
  };

  const toggleCategory = (id: string) => {
    const categories = selectedCategories.includes(id)
      ? selectedCategories.filter((categoryId) => categoryId !== id)
      : [...selectedCategories, id];
    onFilters({...filters, categories});
  };

  return (
    <header className="header">
      <div className="header-row">
        <div className="header-left">
          <BrandLogo onClick={onHome} showName={false} />
          {project ? (
            <>
              <button className="proj-btn workspace-back-btn" onClick={onHome} title="Back to workspace">
                <span className="proj-name">{activeWorkspace?.name ?? "Workspace"}</span>
              </button>
              <span className="brand-sep">/</span>
              <div className="project-breadcrumb-current" aria-current="page">
                <span className="proj-name">{project.title || "Untitled project"}</span>
                {project.collaboration?.role === "editor" && <span className="shared-project-badge">shared</span>}
              </div>
            </>
          ) : (
            <WorkspaceMenu
              workspaces={workspaces}
              activeId={activeWorkspaceId}
              onSwitch={onWorkspaceSwitch}
              onCreate={onWorkspaceCreate}
              onRename={onWorkspaceRename}
              onDelete={onWorkspaceDelete}
            />
          )}
        </div>
        <nav className="view-tabs" aria-label={project ? "Project view" : "Workspace view"}>
          <button className={view === "work" ? "active" : ""} onClick={() => onView("work")}>{project ? "Tasks" : "Projects"}</button>
          <button className={view === "timeline" ? "active" : ""} onClick={() => onView("timeline")}>Timeline</button>
        </nav>
        <div className="header-right">
          {project && <button className="btn btn-ghost share-project-btn" onClick={onManageCollaboration}><span aria-hidden="true">◎</span> Share</button>}
          <AccountMenu
            user={user}
            isGuest={isGuest}
            sync={sync}
            onManageCategories={onManageCategories}
            onManageSkills={onManageSkills}
            onManageAutomations={onManageAutomations}
            onManageInvitations={onManageInvitations}
            onShowShortcuts={onShowShortcuts}
            onSignOut={onSignOut}
          />
        </div>
      </div>
      {project && view === "work" && total > 0 && (
        <div className="header-row filter-row">
          <input
            className="search-input"
            type="search"
            placeholder="Search titles and tags…"
            value={filters.query}
            onChange={(event) => onFilters({...filters, query: event.target.value})}
          />
          <div className="filter-chips">
            {categoryOptions.length > 0 && (
              <details ref={categoryFilterRef} className="category-filter">
                <summary className={`chip category-filter-trigger${selectedCategories.length ? " active" : ""}`}>
                  Category{selectedCategories.length ? ` (${selectedCategories.length})` : ""}
                  <span className="category-filter-chevron" aria-hidden="true" />
                </summary>
                <div className="category-filter-menu" role="group" aria-label="Filter by category">
                  <div className="category-filter-head">
                    <strong>Categories</strong>
                    {selectedCategories.length > 0 && (
                      <button type="button" onClick={() => onFilters({...filters, categories: []})}>Clear</button>
                    )}
                  </div>
                  {categoryOptions.map((category) => (
                    <label className="category-filter-option" key={category.id}>
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(category.id)}
                        onChange={() => toggleCategory(category.id)}
                      />
                      <span>{category.label}</span>
                      <small>{items.filter((item) => item.category === category.id).length}</small>
                    </label>
                  ))}
                </div>
              </details>
            )}
            <button
              className={`chip chip-sort${filters.sortBy === "priority" ? " active" : ""}`}
              onClick={() => sort("priority")}
              aria-pressed={filters.sortBy === "priority"}
              aria-label={`Sort priority ${priorityDescending ? "high to low" : "low to high"}`}
              title={filters.sortBy === "priority" ? (priorityDescending ? "Currently high to low; click for low to high" : "Currently low to high; click for high to low") : "Sort by priority"}
            >
              Priority <span aria-hidden="true">{priorityDescending ? "↓" : "↑"}</span>
            </button>
            <button
              className={`chip chip-sort${filters.sortBy === "effort" ? " active" : ""}`}
              onClick={() => sort("effort")}
              aria-pressed={filters.sortBy === "effort"}
              aria-label={`Sort effort ${effortDescending ? "high to low" : "low to high"}`}
              title={filters.sortBy === "effort" ? (effortDescending ? "Currently high to low; click for low to high" : "Currently low to high; click for high to low") : "Sort by effort"}
            >
              Effort <span aria-hidden="true">{effortDescending ? "↓" : "↑"}</span>
            </button>
          </div>
          <div className="layout-toggle" role="group" aria-label="Task layout">
            <button className={taskLayout === "board" ? "active" : ""} aria-pressed={taskLayout === "board"} onClick={() => onTaskLayout("board")} title="Board view">
              <span className="layout-icon layout-icon-board" aria-hidden="true"><i /><i /><i /></span>
              <span>Board</span>
            </button>
            <button className={taskLayout === "list" ? "active" : ""} aria-pressed={taskLayout === "list"} onClick={() => onTaskLayout("list")} title="List view">
              <span className="layout-icon layout-icon-list" aria-hidden="true"><i /><i /><i /></span>
              <span>List</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
