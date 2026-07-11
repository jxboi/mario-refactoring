import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Board} from "./components/Board";
import {CategoryManager} from "./components/CategoryManager";
import {Drawer} from "./components/Drawer";
import {Header} from "./components/Header";
import {ImportModal} from "./components/ImportModal";
import {SignInScreen} from "./components/SignIn";
import {SkillsManager} from "./components/SkillsManager";
import {ToastHost, useToasts} from "./components/Toast";
import {useAuth, boardScope, guestSession, type Session} from "./lib/auth";
import {activeProject, DEFAULT_PROJECT_NAME, useBoard} from "./lib/store";
import {exportProject} from "./lib/export";
import {useSkills} from "./lib/skills";
import type {CategoryDef, ProjectType, RefactorItem, Risk, Stage} from "./types";
import {typeConfig, uid} from "./types";

export interface Filters {
  query: string;
  risks: Set<Risk>;
  blockedOnly: boolean;
}

const EMPTY_FILTERS: Filters = {query: "", risks: new Set(), blockedOnly: false};

export default function App() {
  const {session, signIn, signOut} = useAuth();
  const [initialProjectName, setInitialProjectName] = useState<string | null>(null);

  const createGuestProject = useCallback(
    (name: string) => {
      setInitialProjectName(name.trim() || DEFAULT_PROJECT_NAME);
      signIn(guestSession());
    },
    [signIn],
  );

  if (!session) return <SignInScreen onCreateProject={createGuestProject} onSignIn={signIn} />;
  return <BoardApp session={session} onSignOut={signOut} initialProjectName={initialProjectName} onInitialProjectNameApplied={() => setInitialProjectName(null)} />;
}

function BoardApp({session, onSignOut, initialProjectName, onInitialProjectNameApplied}: {session: Session; onSignOut: () => void; initialProjectName: string | null; onInitialProjectNameApplied: () => void}) {
  const {state, dispatch, sync} = useBoard(boardScope(session), session.kind === "github" ? session.token : null);
  const skills = useSkills(boardScope(session));
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [fileDragDepth, setFileDragDepth] = useState(0);
  const {toasts, pushToast, dismissToast} = useToasts();
  const initialProjectAppliedRef = useRef(false);

  const project = activeProject(state);
  const items = project.items;
  const config = typeConfig(project.type);
  const categories = state.categories[project.type];

  // How many items across every project of the same type use each category (for the manager).
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of state.projects) {
      if (p.type !== project.type) continue;
      for (const i of p.items) counts[i.category] = (counts[i.category] ?? 0) + 1;
    }
    return counts;
  }, [state.projects, project.type]);

  const selected = useMemo(() => items.find((i) => i.id === selectedId) ?? null, [items, selectedId]);

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return items.filter((item) => {
      if (filters.blockedOnly && !item.blocked) return false;
      if (filters.risks.size > 0 && !filters.risks.has(item.risk)) return false;
      if (q) {
        const hay = [item.title, item.description, ...item.files, ...item.tags].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, filters]);

  const handleImport = useCallback(
    (imported: RefactorItem[], importedCategories: CategoryDef[], projectType: ProjectType) => {
      // Send the items to a project of the type the file declared: switch to an
      // existing one, or spin up a fresh project when none of that type exists.
      if (projectType !== project.type) {
        const existing = state.projects.find((p) => p.type === projectType);
        if (existing) {
          dispatch({type: "project-switch", id: existing.id});
        } else {
          dispatch({type: "project-create", name: `${typeConfig(projectType).label} import`, projectType});
        }
        setSelectedId(null);
        setFilters(EMPTY_FILTERS);
      }
      if (importedCategories.length > 0) dispatch({type: "categories-merge", categories: importedCategories});
      dispatch({type: "import", items: imported});
      setImportOpen(false);
      setDroppedFile(null);
      const targetConfig = typeConfig(projectType);
      pushToast(`Imported ${imported.length} ${imported.length === 1 ? targetConfig.itemNoun : targetConfig.itemNounPlural}`, "success");
    },
    [dispatch, pushToast, project.type, state.projects],
  );

  const handleAddItem = useCallback(
    (stage: Stage) => {
      const now = Date.now();
      const item: RefactorItem = {
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
        createdAt: now,
        updatedAt: now,
      };
      dispatch({type: "add", item});
      setSelectedId(item.id);
    },
    [dispatch],
  );

  useEffect(() => {
    if (!initialProjectName || initialProjectAppliedRef.current) return;
    initialProjectAppliedRef.current = true;

    const name = initialProjectName.trim() || DEFAULT_PROJECT_NAME;
    const current = activeProject(state);
    if (state.projects.length === 1 && current.items.length === 0 && current.name === DEFAULT_PROJECT_NAME) {
      dispatch({type: "project-rename", id: current.id, name});
    } else {
      dispatch({type: "project-create", name, projectType: "refactoring"});
    }

    setSelectedId(null);
    setFilters(EMPTY_FILTERS);
    onInitialProjectNameApplied();
  }, [dispatch, initialProjectName, onInitialProjectNameApplied, state]);

  // Window-level JSON file drag-and-drop: dropping a file anywhere opens the import flow.
  const depthRef = useRef(0);
  useEffect(() => {
    const isFileDrag = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const onDragEnter = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depthRef.current += 1;
      setFileDragDepth(depthRef.current);
    };
    const onDragOver = (e: DragEvent) => {
      if (isFileDrag(e)) e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      depthRef.current = Math.max(0, depthRef.current - 1);
      setFileDragDepth(depthRef.current);
    };
    const onDrop = (e: DragEvent) => {
      if (!isFileDrag(e)) return;
      e.preventDefault();
      depthRef.current = 0;
      setFileDragDepth(0);
      const file = e.dataTransfer?.files[0];
      if (file) {
        setDroppedFile(file);
        setImportOpen(true);
      }
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        setImportOpen(false);
        setCategoriesOpen(false);
        setSkillsOpen(false);
        setDroppedFile(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="app">
      <Header
        items={items}
        projects={state.projects}
        activeId={state.activeId}
        metricLabel={config.metricLabel}
        showFiles={config.showFiles}
        filters={filters}
        onFilters={setFilters}
        onImportClick={() => setImportOpen(true)}
        onExportClick={() => {
          exportProject(project, categories);
          pushToast(`Exported “${project.name}” (${items.length} ${items.length === 1 ? config.itemNoun : config.itemNounPlural})`, "success");
        }}
        onManageCategories={() => setCategoriesOpen(true)}
        onManageSkills={() => setSkillsOpen(true)}
        onHome={() => {
          setSelectedId(null);
          setFilters(EMPTY_FILTERS);
          setImportOpen(false);
          setCategoriesOpen(false);
          setSkillsOpen(false);
          setDroppedFile(null);
        }}
        user={session.user}
        isGuest={session.kind === "guest"}
        sync={sync}
        onSignOut={onSignOut}
        onProjectSwitch={(id) => {
          dispatch({type: "project-switch", id});
          setSelectedId(null);
        }}
        onProjectCreate={(name, projectType) => {
          dispatch({type: "project-create", name, projectType});
          setSelectedId(null);
          setFilters(EMPTY_FILTERS);
          pushToast(`Project “${name}” created`, "success");
        }}
        onProjectRename={(id, name) => dispatch({type: "project-rename", id, name})}
        onProjectDelete={(id) => {
          const doomed = state.projects.find((p) => p.id === id);
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
        onMove={(id, stage, beforeId) => dispatch({type: "move", id, stage, beforeId})}
        onSelect={setSelectedId}
        onAddItem={handleAddItem}
        onImportClick={() => setImportOpen(true)}
        onLoadSample={() => {
          if (project.type === "task") {
            import("./lib/sample").then(({sampleTasks}) => {
              dispatch({type: "import", items: sampleTasks()});
              pushToast("Loaded sample task list", "success");
            });
          } else {
            import("./lib/sample").then(({sampleItems}) => {
              dispatch({type: "import", items: sampleItems()});
              pushToast("Loaded sample refactoring backlog", "success");
            });
          }
        }}
      />
      {selected && (
        <Drawer
          item={selected}
          categories={categories}
          config={config}
          onClose={() => setSelectedId(null)}
          onUpdate={(patch) => dispatch({type: "update", id: selected.id, patch})}
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
          categoriesByType={state.categories}
          defaultType={project.type}
          onClose={() => {
            setImportOpen(false);
            setDroppedFile(null);
          }}
          onImport={handleImport}
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
      {skillsOpen && <SkillsManager skills={skills.skills} categories={categories} config={config} onCreate={skills.createSkill} onUpdate={skills.updateSkill} onDelete={skills.deleteSkill} onClose={() => setSkillsOpen(false)} />}
      {fileDragDepth > 0 && !importOpen && (
        <div className="drop-veil">
          <div className="drop-veil-inner">
            <span className="drop-veil-icon">⇣</span>
            Drop your JSON file to import {config.itemNounPlural}
          </div>
        </div>
      )}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
