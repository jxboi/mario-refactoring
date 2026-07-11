import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Board} from "./components/Board";
import {CategoryManager} from "./components/CategoryManager";
import {Drawer} from "./components/Drawer";
import {Header} from "./components/Header";
import {ImportModal} from "./components/ImportModal";
import {SignInScreen} from "./components/SignIn";
import {SkillsManager} from "./components/SkillsManager";
import {ToastHost, useToasts} from "./components/Toast";
import {WorkspaceImportModal} from "./components/WorkspaceImportModal";
import {boardScope, guestSession, type Session, useAuth} from "./lib/auth";
import {exportProject, exportWorkspace, isWorkspaceExport} from "./lib/export";
import {NEW_SKILL_BODY, type Skill} from "./lib/skills";
import {activeProject, activeWorkspace, DEFAULT_PROJECT_NAME, DEFAULT_WORKSPACE_NAME, useBoard} from "./lib/store";
import type {CategoryDef, ProjectType, Risk, Stage, WorkItem} from "./types";
import {childTypeFor, parentTypeFor, typeConfig, uid} from "./types";

export interface Filters {
  query: string;
  risks: Set<Risk>;
  blockedOnly: boolean;
}

const EMPTY_FILTERS: Filters = {query: "", risks: new Set(), blockedOnly: false};

export default function App() {
  const {session, signIn, signOut} = useAuth();
  const [initialWorkspaceName, setInitialWorkspaceName] = useState<string | null>(null);

  const createGuestWorkspace = useCallback((name: string) => {
    setInitialWorkspaceName(name.trim() || DEFAULT_WORKSPACE_NAME);
    signIn(guestSession());
  }, [signIn]);

  if (!session) return <SignInScreen onCreateWorkspace={createGuestWorkspace} onSignIn={signIn} />;
  return <BoardApp session={session} onSignOut={signOut} initialWorkspaceName={initialWorkspaceName} onInitialWorkspaceNameApplied={() => setInitialWorkspaceName(null)} />;
}

interface BoardAppProps {
  session: Session;
  onSignOut: () => void;
  initialWorkspaceName: string | null;
  onInitialWorkspaceNameApplied: () => void;
}

function BoardApp({session, onSignOut, initialWorkspaceName, onInitialWorkspaceNameApplied}: BoardAppProps) {
  const {state, dispatch, sync} = useBoard(boardScope(session), session.kind === "github" ? session.token : null);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [workspaceImportFile, setWorkspaceImportFile] = useState<File | null>(null);
  const [fileDragDepth, setFileDragDepth] = useState(0);
  const workspaceFileInputRef = useRef<HTMLInputElement>(null);
  const initialWorkspaceAppliedRef = useRef(false);
  const {toasts, pushToast, dismissToast} = useToasts();

  const workspace = activeWorkspace(state);
  const project = activeProject(state);
  const items = project.items;
  const config = typeConfig(project.type);
  const categories = workspace.categories[project.type];

  const resetTransient = useCallback(() => {
    setSelectedId(null);
    setFilters(EMPTY_FILTERS);
    setImportOpen(false);
    setCategoriesOpen(false);
    setSkillsOpen(false);
    setDroppedFile(null);
    setWorkspaceImportFile(null);
  }, []);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const candidate of workspace.projects) {
      if (candidate.type !== project.type) continue;
      for (const item of candidate.items) counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, [workspace.projects, project.type]);

  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);
  const relationshipCounts = useMemo(() => {
    const counts: Record<string, {parents: number; children: number; completedChildren: number}> = {};
    for (const candidate of workspace.projects.flatMap((entry) => entry.items)) counts[candidate.id] = {parents: candidate.parentIds.length, children: 0, completedChildren: 0};
    for (const candidate of workspace.projects.flatMap((entry) => entry.items)) for (const parentId of candidate.parentIds) {
      const count = counts[parentId];
      if (count) {
        count.children += 1;
        if (candidate.stage === "deployed") count.completedChildren += 1;
      }
    }
    return counts;
  }, [workspace.projects]);

  const filtered = useMemo(() => {
    const query = filters.query.trim().toLowerCase();
    return items.filter((item) => {
      if (filters.blockedOnly && !item.blocked) return false;
      if (filters.risks.size > 0 && !filters.risks.has(item.risk)) return false;
      if (query && ![item.title, item.description, ...item.files, ...item.tags].join(" ").toLowerCase().includes(query)) return false;
      return true;
    });
  }, [items, filters]);

  const handleImport = useCallback((imported: WorkItem[], importedCategories: CategoryDef[], projectType: ProjectType) => {
    const expectedParentType = parentTypeFor(projectType);
    const itemTypes = new Map(workspace.projects.flatMap((candidate) => candidate.items.map((item) => [item.id, candidate.type] as const)));
    let removedLinks = 0;
    const cleaned = imported.map((item) => ({...item, parentIds: item.parentIds.filter((id) => {
      const valid = expectedParentType !== null && itemTypes.get(id) === expectedParentType;
      if (!valid) removedLinks += 1;
      return valid;
    })}));
    if (projectType !== project.type) {
      const existing = workspace.projects.find((candidate) => candidate.type === projectType);
      if (existing) dispatch({type: "project-switch", id: existing.id});
      else dispatch({type: "project-create", name: `${typeConfig(projectType).label} import`, projectType});
      setSelectedId(null);
      setFilters(EMPTY_FILTERS);
    }
    if (importedCategories.length > 0) dispatch({type: "categories-merge", categories: importedCategories});
    dispatch({type: "import", items: cleaned});
    setImportOpen(false);
    setDroppedFile(null);
    const targetConfig = typeConfig(projectType);
    pushToast(`Imported ${cleaned.length} ${cleaned.length === 1 ? targetConfig.itemNoun : targetConfig.itemNounPlural}${removedLinks ? ` · removed ${removedLinks} unresolved link${removedLinks === 1 ? "" : "s"}` : ""}`, "success");
  }, [dispatch, project.type, pushToast, workspace.projects]);

  const handleAddItem = useCallback((stage: Stage) => {
    const now = Date.now();
    const item: WorkItem = {
      id: uid(),
      title: "",
      description: "",
      files: [],
      risk: "medium",
      effort: "medium",
      category: "other",
      tags: [],
      stage,
      blocked: false,
      blockReason: "",
      notes: [],
      parentIds: [],
      createdAt: now,
      updatedAt: now,
    };
    dispatch({type: "add", item});
    setSelectedId(item.id);
  }, [dispatch]);

  const createSkill = (): Skill => {
    const now = Date.now();
    const skill: Skill = {id: uid(), name: "Untitled skill", description: "", body: NEW_SKILL_BODY, createdAt: now, updatedAt: now};
    dispatch({type: "skill-create", skill});
    return skill;
  };

  useEffect(() => {
    if (!initialWorkspaceName || initialWorkspaceAppliedRef.current) return;
    initialWorkspaceAppliedRef.current = true;
    const name = initialWorkspaceName.trim() || DEFAULT_WORKSPACE_NAME;
    const pristine = state.workspaces.length === 1 && workspace.name === DEFAULT_WORKSPACE_NAME && workspace.projects.length === 1 && project.name === DEFAULT_PROJECT_NAME && project.items.length === 0;
    if (pristine) dispatch({type: "workspace-rename", id: workspace.id, name});
    else dispatch({type: "workspace-create", name});
    resetTransient();
    onInitialWorkspaceNameApplied();
  }, [dispatch, initialWorkspaceName, onInitialWorkspaceNameApplied, project.items.length, project.name, resetTransient, state.workspaces.length, workspace]);

  const depthRef = useRef(0);
  useEffect(() => {
    const isFileDrag = (event: DragEvent) => event.dataTransfer?.types.includes("Files") ?? false;
    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depthRef.current += 1;
      setFileDragDepth(depthRef.current);
    };
    const onDragOver = (event: DragEvent) => {
      if (isFileDrag(event)) event.preventDefault();
    };
    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      depthRef.current = Math.max(0, depthRef.current - 1);
      setFileDragDepth(depthRef.current);
    };
    const onDrop = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      depthRef.current = 0;
      setFileDragDepth(0);
      const file = event.dataTransfer?.files[0];
      if (!file) return;
      void file.text().then((text) => {
        if (isWorkspaceExport(text)) setWorkspaceImportFile(file);
        else {
          setDroppedFile(file);
          setImportOpen(true);
        }
      });
    };
    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") resetTransient();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resetTransient]);

  return (
    <div className="app">
      <input
        ref={workspaceFileInputRef}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) setWorkspaceImportFile(file);
          event.target.value = "";
        }}
      />
      <Header
        items={items}
        projects={workspace.projects}
        activeProjectId={workspace.activeProjectId}
        workspaces={state.workspaces}
        activeWorkspaceId={state.activeWorkspaceId}
        metricLabel={config.metricLabel}
        showFiles={config.showFiles}
        filters={filters}
        onFilters={setFilters}
        onImportClick={() => setImportOpen(true)}
        onExportClick={() => {
          exportProject(project, categories);
          pushToast(`Exported “${project.name}”`, "success");
        }}
        onImportWorkspaceClick={() => workspaceFileInputRef.current?.click()}
        onExportWorkspaceClick={() => {
          exportWorkspace(workspace);
          pushToast(`Exported workspace “${workspace.name}”`, "success");
        }}
        onManageCategories={() => setCategoriesOpen(true)}
        onManageSkills={() => setSkillsOpen(true)}
        onHome={resetTransient}
        user={session.user}
        isGuest={session.kind === "guest"}
        sync={sync}
        onSignOut={onSignOut}
        onWorkspaceSwitch={(id) => {
          dispatch({type: "workspace-switch", id});
          resetTransient();
        }}
        onWorkspaceCreate={(name) => {
          dispatch({type: "workspace-create", name});
          resetTransient();
          pushToast(`Workspace “${name}” created`, "success");
        }}
        onWorkspaceRename={(id, name) => dispatch({type: "workspace-rename", id, name})}
        onWorkspaceDelete={(id) => {
          const doomed = state.workspaces.find((candidate) => candidate.id === id);
          dispatch({type: "workspace-delete", id});
          resetTransient();
          pushToast(`Workspace “${doomed?.name ?? ""}” deleted`, "info");
        }}
        onProjectSwitch={(id) => {
          dispatch({type: "project-switch", id});
          setSelectedId(null);
          setFilters(EMPTY_FILTERS);
        }}
        onProjectCreate={(name, projectType) => {
          dispatch({type: "project-create", name, projectType});
          setSelectedId(null);
          setFilters(EMPTY_FILTERS);
          pushToast(`Project “${name}” created`, "success");
        }}
        onProjectRename={(id, name) => dispatch({type: "project-rename", id, name})}
        onProjectDelete={(id) => {
          const doomed = workspace.projects.find((candidate) => candidate.id === id);
          dispatch({type: "project-delete", id});
          setSelectedId(null);
          pushToast(`Project “${doomed?.name ?? ""}” deleted`, "info");
        }}
      />
      <Board
        items={filtered}
        totalCount={items.length}
        categories={categories}
        config={config}
        relationshipCounts={relationshipCounts}
        onMove={(id, stage, beforeId) => dispatch({type: "move", id, stage, beforeId})}
        onSelect={setSelectedId}
        onAddItem={handleAddItem}
        onImportClick={() => setImportOpen(true)}
        onLoadSample={() => {
          if (project.type === "plan") {
            void import("./lib/sample").then(({samplePlans}) => {
              dispatch({type: "import", items: samplePlans()});
              pushToast("Loaded sample product plan", "success");
            });
          } else if (project.type === "task") {
            void import("./lib/sample").then(({sampleTasks}) => {
              dispatch({type: "import", items: sampleTasks()});
              pushToast("Loaded sample task list", "success");
            });
          } else {
            void import("./lib/sample").then(({sampleItems}) => {
              dispatch({type: "import", items: sampleItems()});
              pushToast("Loaded sample coding backlog", "success");
            });
          }
        }}
      />
      {selected && (
        <Drawer
          item={selected}
          categories={categories}
          config={config}
          projects={workspace.projects}
          onClose={() => setSelectedId(null)}
          onUpdate={(patch) => dispatch({type: "update", id: selected.id, patch})}
          onNavigate={(projectId, itemId) => {
            dispatch({type: "project-switch", id: projectId});
            setSelectedId(itemId);
            setFilters(EMPTY_FILTERS);
          }}
          onLink={(childId, parentId) => dispatch({type: "link-parent", childId, parentId})}
          onUnlink={(childId, parentId) => dispatch({type: "unlink-parent", childId, parentId})}
          onCreateChild={(requestedProjectId) => {
            const childType = childTypeFor(project.type);
            if (!childType) return;
            let targetProjectId = requestedProjectId;
            if (!targetProjectId) {
              targetProjectId = uid();
              dispatch({type: "project-create", id: targetProjectId, name: `${typeConfig(childType).label} project`, projectType: childType});
            }
            const now = Date.now();
            const child: WorkItem = {
              id: uid(),
              title: selected.title,
              description: selected.description,
              files: [],
              risk: selected.risk,
              effort: "medium",
              category: "other",
              tags: [...selected.tags],
              stage: "queued",
              blocked: false,
              blockReason: "",
              notes: [],
              parentIds: [selected.id],
              createdAt: now,
              updatedAt: now,
            };
            dispatch({type: "add-to-project", projectId: targetProjectId, item: child});
            dispatch({type: "project-switch", id: targetProjectId});
            setSelectedId(child.id);
            setFilters(EMPTY_FILTERS);
            pushToast(`Created linked ${typeConfig(childType).itemNoun}`, "success");
          }}
          onAddNote={(text) => dispatch({type: "add-note", id: selected.id, text})}
          onDeleteNote={(noteId) => dispatch({type: "delete-note", id: selected.id, noteId})}
          onEditNote={(noteId, text) => dispatch({type: "edit-note", id: selected.id, noteId, text})}
          onToggleNoteBlock={(noteId) => dispatch({type: "toggle-note-block", id: selected.id, noteId})}
          onToggleNoteResolved={(noteId) => dispatch({type: "toggle-note-resolved", id: selected.id, noteId})}
          onDelete={() => {
            dispatch({type: "delete", id: selected.id});
            setSelectedId(null);
            pushToast("Item deleted", "info");
          }}
        />
      )}
      {importOpen && (
        <ImportModal
          initialFile={droppedFile}
          categoriesByType={workspace.categories}
          defaultType={project.type}
          onClose={() => {
            setImportOpen(false);
            setDroppedFile(null);
          }}
          onImport={handleImport}
        />
      )}
      {workspaceImportFile && (
        <WorkspaceImportModal
          file={workspaceImportFile}
          onClose={() => setWorkspaceImportFile(null)}
          onImport={(importedWorkspace) => {
            dispatch({type: "workspace-import", workspace: importedWorkspace});
            resetTransient();
            pushToast(`Imported workspace “${importedWorkspace.name}”`, "success");
          }}
        />
      )}
      {categoriesOpen && (
        <CategoryManager
          categories={categories}
          counts={categoryCounts}
          typeLabel={config.label}
          onAdd={(label) => dispatch({type: "category-add", label})}
          onRename={(id, label) => dispatch({type: "category-rename", id, label})}
          onSetGlyph={(id, glyph) => dispatch({type: "category-set-glyph", id, glyph})}
          onDelete={(id) => {
            dispatch({type: "category-delete", id});
            pushToast("Category removed — its items moved to Other", "info");
          }}
          onClose={() => setCategoriesOpen(false)}
        />
      )}
      {skillsOpen && (
        <SkillsManager
          skills={workspace.skills}
          categories={categories}
          config={config}
          onCreate={createSkill}
          onUpdate={(id, patch) => dispatch({type: "skill-update", id, patch})}
          onDelete={(id) => dispatch({type: "skill-delete", id})}
          onClose={() => setSkillsOpen(false)}
        />
      )}
      {fileDragDepth > 0 && !importOpen && !workspaceImportFile && (
        <div className="drop-veil">
          <div className="drop-veil-inner">
            <span className="drop-veil-icon">⇣</span>
            Drop project, item, or workspace JSON to import
          </div>
        </div>
      )}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
