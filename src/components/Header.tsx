import {useEffect, useRef, useState} from "react";
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
  timelineRefreshing: boolean;
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
  onProjectRename: (name: string) => void;
  onCreateTask: () => void;
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
  timelineRefreshing,
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
  onProjectRename,
  onCreateTask,
  onHome,
  user,
  isGuest,
  sync,
  onSignOut,
}: Props) {
  const categoryFilterRef = useRef<HTMLDetailsElement>(null);
  const projectNameInputRef = useRef<HTMLInputElement>(null);
  const projectNameCommitRef = useRef(false);
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const total = items.length;
  const completed = items.filter((item) => item.stage === "done").length;
  const priorityDescending = filters.prioritySort === "desc";
  const effortDescending = filters.effortSort === "desc";
  const categoryOptions = availableTaskCategories(items, categories);
  const optionIds = new Set(categoryOptions.map((category) => category.id));
  const selectedCategories = filters.categories.filter((id) => optionIds.has(id));
  const hasCategoryFilterChanges = selectedCategories.length !== categoryOptions.length;
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId);

  useEffect(() => {
    if (!editingProjectName) return;
    projectNameInputRef.current?.focus();
    projectNameInputRef.current?.select();
  }, [editingProjectName]);

  useEffect(() => {
    projectNameCommitRef.current = true;
    setEditingProjectName(false);
  }, [project?.id]);

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

  const submitProjectName = (value: string) => {
    if (projectNameCommitRef.current) return;
    projectNameCommitRef.current = true;
    const name = value.trim();
    if (name && name !== project?.title) onProjectRename(name);
    setEditingProjectName(false);
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
                {editingProjectName ? (
                  <input
                    ref={projectNameInputRef}
                    className="project-name-input"
                    value={projectNameDraft}
                    aria-label="Project name"
                    onChange={(event) => setProjectNameDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) {
                        event.preventDefault();
                        submitProjectName(event.currentTarget.value);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        projectNameCommitRef.current = true;
                        setEditingProjectName(false);
                      }
                    }}
                    onBlur={(event) => submitProjectName(event.currentTarget.value)}
                  />
                ) : (
                  <>
                    <span className="proj-name">{project.title || "Untitled project"}</span>
                    <button
                      className="project-name-edit"
                      type="button"
                      aria-label={`Edit project name${project.title ? `: ${project.title}` : ""}`}
                      title="Edit project name"
                      onClick={() => {
                        projectNameCommitRef.current = false;
                        setProjectNameDraft(project.title);
                        setEditingProjectName(true);
                      }}
                    >
                      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                        <path d="m3 11.8.5-2.6 6.9-6.9a1.1 1.1 0 0 1 1.6 0l1.7 1.7a1.1 1.1 0 0 1 0 1.6l-6.9 6.9-2.6.5L3 11.8Z" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                        <path d="m9.6 3.1 3.3 3.3M3.5 9.2l3.3 3.3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
                      </svg>
                    </button>
                  </>
                )}
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
        <div className="view-tabs-wrap">
          <nav className="view-tabs" aria-label={project ? "Project view" : "Workspace view"}>
            <button className={view === "work" ? "active" : ""} aria-pressed={view === "work"} onClick={() => onView("work")}>{project ? "Tasks" : "Projects"}</button>
            <button className={view === "timeline" ? "active" : ""} aria-pressed={view === "timeline"} onClick={() => onView("timeline")}>Timeline</button>
          </nav>
          {view === "timeline" && timelineRefreshing && <span className="timeline-refreshing" role="status"><span aria-hidden="true" />Updating</span>}
        </div>
        <div className="header-right">
          {project && <button className="btn btn-ghost share-project-btn" aria-label="Share project" onClick={onManageCollaboration}><span aria-hidden="true">◎</span> Share</button>}
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
      {project && view === "work" && (
        <div className="project-heading">
          <div className="project-heading-copy">
            <h1>{project.title || "Untitled project"}</h1>
            <p>{total ? `${total} ${total === 1 ? "task" : "tasks"} · ${completed} complete` : "A clear outcome starts with a first task."}</p>
          </div>
          <button className="btn btn-primary" onClick={onCreateTask} aria-keyshortcuts="C">
            <span aria-hidden="true">＋</span> New task <kbd aria-hidden="true">C</kbd>
          </button>
        </div>
      )}
      {project && view === "work" && (
        <div className="header-row filter-row">
          <input
            className="search-input"
            type="search"
            aria-label="Search tasks"
            placeholder="Search titles and tags…"
            value={filters.query}
            onChange={(event) => onFilters({...filters, query: event.target.value})}
            onKeyDown={(event) => {
              if (event.key === "Escape") onFilters({...filters, query: ""});
            }}
          />
          <div className="filter-chips">
            {(filters.query || hasCategoryFilterChanges) && <button className="chip filter-reset" onClick={() => onFilters({...filters, query: "", categories: categories.map((category) => category.id)})}>Reset filters <span aria-hidden="true">×</span></button>}
            {taskLayout === "board" && categoryOptions.length > 0 && (
              <details ref={categoryFilterRef} className="category-filter">
                <summary className={`chip category-filter-trigger${hasCategoryFilterChanges ? " active" : ""}`}>
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
            {taskLayout === "board" && <>
              <button
                className={`chip chip-sort${!priorityDescending ? " active" : ""}`}
                onClick={() => sort("priority")}
                aria-pressed={!priorityDescending}
                aria-label={`Sort priority ${priorityDescending ? "low to high" : "high to low"}`}
                title={priorityDescending ? "Currently high to low; click for low to high" : "Currently low to high; click for high to low"}
              >
                Priority <span aria-hidden="true">{priorityDescending ? "↓" : "↑"}</span>
              </button>
              <button
                className={`chip chip-sort${effortDescending ? " active" : ""}`}
                onClick={() => sort("effort")}
                aria-pressed={effortDescending}
                aria-label={`Sort effort ${effortDescending ? "low to high" : "high to low"}`}
                title={effortDescending ? "Currently high to low; click for low to high" : "Currently low to high; click for high to low"}
              >
                Effort <span aria-hidden="true">{effortDescending ? "↓" : "↑"}</span>
              </button>
            </>}
          </div>
          <div className="layout-toggle" role="group" aria-label="Task layout">
            <button className={taskLayout === "board" ? "active" : ""} aria-pressed={taskLayout === "board"} onClick={() => onTaskLayout("board")} aria-label="Kanban" title="Kanban view">
              <span className="layout-icon layout-icon-board" aria-hidden="true"><i /><i /><i /></span>
              <span>Kanban</span>
            </button>
            <button className={taskLayout === "list" ? "active" : ""} aria-pressed={taskLayout === "list"} onClick={() => { onFilters({...filters, categories: categories.map((category) => category.id)}); onTaskLayout("list"); }} aria-label="List" title="List view">
              <span className="layout-icon layout-icon-list" aria-hidden="true"><i /><i /><i /></span>
              <span>List</span>
            </button>
          </div>
        </div>
      )}
    </header>
  );
}
