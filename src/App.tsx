import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {Board} from "./components/Board";
import {CategoryManager} from "./components/CategoryManager";
import {Drawer} from "./components/Drawer";
import {Header} from "./components/Header";
import {ImportModal} from "./components/ImportModal";
import {SignInScreen} from "./components/SignIn";
import {ToastHost, useToasts} from "./components/Toast";
import {useAuth, boardScope, type Session} from "./lib/auth";
import {activeProject, useBoard} from "./lib/store";
import type {RefactorItem, Risk, Stage} from "./types";
import {uid} from "./types";

export interface Filters {
  query: string;
  risks: Set<Risk>;
  blockedOnly: boolean;
}

const EMPTY_FILTERS: Filters = {query: "", risks: new Set(), blockedOnly: false};

export default function App() {
  const {session, signIn, signOut} = useAuth();
  if (!session) return <SignInScreen onSignedIn={signIn} />;
  return <BoardApp session={session} onSignOut={signOut} />;
}

function BoardApp({session, onSignOut}: {session: Session; onSignOut: () => void}) {
  const {state, dispatch} = useBoard(boardScope(session));
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [fileDragDepth, setFileDragDepth] = useState(0);
  const {toasts, pushToast, dismissToast} = useToasts();

  const project = activeProject(state);
  const items = project.items;
  const categories = state.categories;

  // How many items across every project use each category (for the manager).
  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of state.projects) {
      for (const i of p.items) counts[i.category] = (counts[i.category] ?? 0) + 1;
    }
    return counts;
  }, [state.projects]);

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
    (imported: RefactorItem[]) => {
      dispatch({type: "import", items: imported});
      setImportOpen(false);
      setDroppedFile(null);
      pushToast(`Imported ${imported.length} refactoring ${imported.length === 1 ? "item" : "items"}`, "success");
    },
    [dispatch, pushToast],
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
        filters={filters}
        onFilters={setFilters}
        onImportClick={() => setImportOpen(true)}
        onManageCategories={() => setCategoriesOpen(true)}
        user={session.user}
        isGuest={session.kind === "guest"}
        onSignOut={onSignOut}
        onProjectSwitch={(id) => {
          dispatch({type: "project-switch", id});
          setSelectedId(null);
        }}
        onProjectCreate={(name) => {
          dispatch({type: "project-create", name});
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
        onMove={(id, stage, beforeId) => dispatch({type: "move", id, stage, beforeId})}
        onSelect={setSelectedId}
        onAddItem={handleAddItem}
        onImportClick={() => setImportOpen(true)}
        onLoadSample={() => {
          import("./lib/sample").then(({sampleItems}) => {
            dispatch({type: "import", items: sampleItems()});
            pushToast("Loaded sample refactoring backlog", "success");
          });
        }}
      />
      {selected && (
        <Drawer
          item={selected}
          categories={categories}
          onClose={() => setSelectedId(null)}
          onUpdate={(patch) => dispatch({type: "update", id: selected.id, patch})}
          onAddNote={(text) => dispatch({type: "add-note", id: selected.id, text})}
          onDeleteNote={(noteId) => dispatch({type: "delete-note", id: selected.id, noteId})}
          onEditNote={(noteId, text) => dispatch({type: "edit-note", id: selected.id, noteId, text})}
          onToggleNoteBlock={(noteId) => dispatch({type: "toggle-note-block", id: selected.id, noteId})}
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
          categories={categories}
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
          onAdd={(label) => dispatch({type: "category-add", label})}
          onRename={(id, label) => dispatch({type: "category-rename", id, label})}
          onDelete={(id) => {
            dispatch({type: "category-delete", id});
            pushToast("Category removed — its items moved to Other", "info");
          }}
          onClose={() => setCategoriesOpen(false)}
        />
      )}
      {fileDragDepth > 0 && !importOpen && (
        <div className="drop-veil">
          <div className="drop-veil-inner">
            <span className="drop-veil-icon">⇣</span>
            Drop your JSON file to import refactoring items
          </div>
        </div>
      )}
      <ToastHost toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
