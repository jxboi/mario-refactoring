import {useEffect, useReducer, useRef, useState} from "react";
import type {CategoryDef, Note, ProjectType, RefactorItem, Stage} from "../types";
import {blockedFrom, defaultCategoriesFor, FALLBACK_CATEGORY_ID, PROJECT_TYPES, slugifyCategory, uid} from "../types";
import {fetchRemoteBoard, RemoteBoardConflict, saveRemoteBoard} from "./remoteBoard";

const STORAGE_KEY = "chisel.projects.v2";
const LEGACY_KEY = "chisel.board.v1";
export const DEFAULT_PROJECT_NAME = "My project";

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  createdAt: number;
  items: RefactorItem[];
}

/** Categories are shared across a user's projects of the same type. */
export type CategoriesByType = Record<ProjectType, CategoryDef[]>;

export interface BoardState {
  projects: Project[];
  activeId: string;
  /** Category lists keyed by project type (refactoring vs. task). */
  categories: CategoriesByType;
}

export type Action = {type: "hydrate"; state: BoardState} | {type: "import"; items: RefactorItem[]} | {type: "move"; id: string; stage: Stage; beforeId?: string} | {type: "update"; id: string; patch: Partial<Omit<RefactorItem, "id" | "notes">>} | {type: "add-note"; id: string; text: string} | {type: "edit-note"; id: string; noteId: string; text: string} | {type: "delete-note"; id: string; noteId: string} | {type: "toggle-note-block"; id: string; noteId: string} | {type: "toggle-note-resolved"; id: string; noteId: string} | {type: "delete"; id: string} | {type: "add"; item: RefactorItem} | {type: "project-create"; name: string; projectType: ProjectType} | {type: "project-rename"; id: string; name: string} | {type: "project-delete"; id: string} | {type: "project-switch"; id: string} | {type: "category-add"; label: string} | {type: "category-rename"; id: string; label: string} | {type: "category-set-glyph"; id: string; glyph: string} | {type: "category-delete"; id: string} | {type: "categories-merge"; categories: CategoryDef[]};

export type BoardSyncState =
  | {status: "local"; message: string}
  | {status: "loading"; message: string}
  | {status: "saving"; message: string}
  | {status: "synced"; message: string; updatedAt: string | null}
  | {status: "error"; message: string}
  | {status: "conflict"; message: string; updatedAt: string | null};
function newProject(name: string, projectType: ProjectType = "refactoring"): Project {
  return {id: uid(), name, type: projectType, createdAt: Date.now(), items: []};
}

function touch(item: RefactorItem): RefactorItem {
  return {...item, updatedAt: Date.now()};
}

/** Keep the cached blocked/blockReason fields in sync with the item's notes. */
function syncBlocked(item: RefactorItem): RefactorItem {
  return {...item, ...blockedFrom(item.notes)};
}

/** Apply a transform to the active project's items. */
function mapActive(state: BoardState, fn: (items: RefactorItem[]) => RefactorItem[]): BoardState {
  return {
    ...state,
    projects: state.projects.map((p) => (p.id === state.activeId ? {...p, items: fn(p.items)} : p)),
  };
}

export function reducer(state: BoardState, action: Action): BoardState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "import":
      return mapActive(state, (items) => [...items, ...action.items]);
    case "add":
      return mapActive(state, (items) => [...items, action.item]);
    case "move":
      return mapActive(state, (items) => {
        const moving = items.find((i) => i.id === action.id);
        if (!moving) return items;
        const rest = items.filter((i) => i.id !== action.id);
        const moved = touch({...moving, stage: action.stage});
        if (action.beforeId) {
          const at = rest.findIndex((i) => i.id === action.beforeId);
          if (at >= 0) return [...rest.slice(0, at), moved, ...rest.slice(at)];
        }
        return [...rest, moved];
      });
    case "update":
      return mapActive(state, (items) => items.map((i) => (i.id === action.id ? touch({...i, ...action.patch}) : i)));
    case "add-note": {
      const note: Note = {id: uid(), text: action.text, createdAt: Date.now()};
      return mapActive(state, (items) => items.map((i) => (i.id === action.id ? touch(syncBlocked({...i, notes: [...i.notes, note]})) : i)));
    }
    case "edit-note":
      return mapActive(state, (items) => items.map((i) => (i.id === action.id ? touch(syncBlocked({...i, notes: i.notes.map((n) => (n.id === action.noteId ? {...n, text: action.text} : n))})) : i)));
    case "delete-note":
      return mapActive(state, (items) => items.map((i) => (i.id === action.id ? touch(syncBlocked({...i, notes: i.notes.filter((n) => n.id !== action.noteId)})) : i)));
    case "toggle-note-block":
      return mapActive(state, (items) => items.map((i) => (i.id === action.id ? touch(syncBlocked({...i, notes: i.notes.map((n) => (n.id === action.noteId ? {...n, blocked: !n.blocked, resolved: false} : n))})) : i)));
    case "toggle-note-resolved":
      return mapActive(state, (items) => items.map((i) => (i.id === action.id ? touch(syncBlocked({...i, notes: i.notes.map((n) => (n.id === action.noteId ? {...n, resolved: !n.resolved, blocked: n.resolved ? n.blocked : false} : n))})) : i)));
    case "delete":
      return mapActive(state, (items) => items.filter((i) => i.id !== action.id));

    case "project-create": {
      const name = action.name.trim() || "Untitled project";
      const project = newProject(name, action.projectType);
      return {...state, projects: [...state.projects, project], activeId: project.id};
    }
    case "project-rename":
      return {
        ...state,
        projects: state.projects.map((p) => (p.id === action.id ? {...p, name: action.name.trim() || p.name} : p)),
      };
    case "project-delete": {
      const remaining = state.projects.filter((p) => p.id !== action.id);
      if (remaining.length === 0) {
        const fresh = newProject(DEFAULT_PROJECT_NAME);
        return {...state, projects: [fresh], activeId: fresh.id};
      }
      const activeId = state.activeId === action.id ? remaining[0].id : state.activeId;
      return {...state, projects: remaining, activeId};
    }
    case "project-switch":
      return state.projects.some((p) => p.id === action.id) ? {...state, activeId: action.id} : state;

    case "category-add": {
      const label = action.label.trim();
      if (!label) return state;
      const type = activeType(state);
      const list = state.categories[type];
      const base = slugifyCategory(label);
      const existing = new Set(list.map((c) => c.id));
      let id = base;
      for (let n = 2; existing.has(id); n++) id = `${base}-${n}`;
      const def: CategoryDef = {id, label, glyph: "\u00B7"};
      // Keep the "Other" fallback last so new categories slot in above it.
      const at = list.findIndex((c) => c.id === FALLBACK_CATEGORY_ID);
      const next = at >= 0 ? [...list.slice(0, at), def, ...list.slice(at)] : [...list, def];
      return {...state, categories: {...state.categories, [type]: next}};
    }
    case "categories-merge": {
      const type = activeType(state);
      const list = state.categories[type];
      const existing = new Set(list.map((c) => c.id));
      const additions = action.categories.filter((c) => c.id !== FALLBACK_CATEGORY_ID && !existing.has(c.id));
      if (additions.length === 0) return state;
      // Keep the "Other" fallback last so merged categories slot in above it.
      const at = list.findIndex((c) => c.id === FALLBACK_CATEGORY_ID);
      const next = at >= 0 ? [...list.slice(0, at), ...additions, ...list.slice(at)] : [...list, ...additions];
      return {...state, categories: {...state.categories, [type]: next}};
    }
    case "category-rename": {
      const label = action.label.trim();
      if (!label) return state;
      const type = activeType(state);
      const next = state.categories[type].map((c) => (c.id === action.id ? {...c, label} : c));
      return {...state, categories: {...state.categories, [type]: next}};
    }
    case "category-set-glyph": {
      const glyph = action.glyph.trim();
      if (!glyph) return state;
      const type = activeType(state);
      const next = state.categories[type].map((c) => (c.id === action.id ? {...c, glyph} : c));
      return {...state, categories: {...state.categories, [type]: next}};
    }
    case "category-delete": {
      if (action.id === FALLBACK_CATEGORY_ID) return state;
      const type = activeType(state);
      const next = state.categories[type].filter((c) => c.id !== action.id);
      // Reassign any orphaned items (only within projects of this type) to the fallback.
      const projects = state.projects.map((p) =>
        p.type === type
          ? {
              ...p,
              items: p.items.map((i) => (i.category === action.id ? {...i, category: FALLBACK_CATEGORY_ID} : i)),
            }
          : p,
      );
      return {...state, categories: {...state.categories, [type]: next}, projects};
    }
  }
}

export function activeProject(state: BoardState): Project {
  return state.projects.find((p) => p.id === state.activeId) ?? state.projects[0];
}

/** The project type of the currently active board (defaults to refactoring). */
export function activeType(state: BoardState): ProjectType {
  return activeProject(state)?.type ?? "refactoring";
}

/** localStorage key for a given board scope (e.g. a signed-in user's id). */
function storageKey(scope?: string): string {
  return scope ? `${STORAGE_KEY}.${scope}` : STORAGE_KEY;
}

/** Fill in defaults + guarantee the "Other" fallback for one type's category list. */
function fillCategories(list: unknown, type: ProjectType): CategoryDef[] {
  const defaults = defaultCategoriesFor(type);
  const base = Array.isArray(list) && list.length > 0 ? (list as CategoryDef[]).map((c) => ({...c})) : defaults.map((c) => ({...c}));
  // Merge in any default categories missing from a stored list (e.g. newly added defaults).
  const existing = new Set(base.map((c) => c.id));
  const missing = defaults.filter((c) => c.id !== FALLBACK_CATEGORY_ID && !existing.has(c.id)).map((c) => ({...c}));
  const withFallback = base.some((c) => c.id === FALLBACK_CATEGORY_ID) ? base : [...base, {id: FALLBACK_CATEGORY_ID, label: "Other", glyph: "\u00B7"}];
  if (missing.length === 0) return withFallback;
  // Keep the "Other" fallback last so merged defaults slot in above it.
  const at = withFallback.findIndex((c) => c.id === FALLBACK_CATEGORY_ID);
  return [...withFallback.slice(0, at), ...missing, ...withFallback.slice(at)];
}

/**
 * Normalize a loaded/migrated state so it always has per-type category lists and
 * a type on every project. Accepts the legacy shared-array `categories` shape too.
 */
function normalize(state: {projects: Project[]; activeId: string; categories: unknown}): BoardState {
  const raw = state.categories;
  const source: Partial<Record<ProjectType, CategoryDef[]>> = Array.isArray(raw) ? {refactoring: raw as CategoryDef[]} : ((raw ?? {}) as Partial<Record<ProjectType, CategoryDef[]>>);
  const categories = {} as CategoriesByType;
  for (const type of PROJECT_TYPES) categories[type] = fillCategories(source[type], type);
  const projects = state.projects.map((p) => (p.type ? p : {...p, type: "refactoring" as ProjectType}));
  const activeId = projects.some((p) => p.id === state.activeId) ? state.activeId : projects[0].id;
  return {projects, activeId, categories};
}

export function normalizeBoardState(value: unknown): BoardState | null {
  if (!value || typeof value !== "object") return null;
  const state = value as Partial<BoardState>;
  if (!Array.isArray(state.projects) || state.projects.length === 0 || typeof state.activeId !== "string") return null;
  return normalize({projects: state.projects, activeId: state.activeId, categories: state.categories});
}

function load(scope?: string): BoardState {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.projects) && parsed.projects.length > 0) {
        return normalize(parsed);
      }
    }
    // migrate the single-board v1 format into a default project (unscoped only)
    if (!scope) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (parsed && Array.isArray(parsed.items)) {
          const project = {...newProject(DEFAULT_PROJECT_NAME), items: parsed.items as RefactorItem[]};
          return normalize({projects: [project], activeId: project.id, categories: []});
        }
      }
    }
  } catch {
    /* corrupted storage — start fresh */
  }
  const project = newProject(DEFAULT_PROJECT_NAME);
  return normalize({projects: [project], activeId: project.id, categories: []});
}

export function useBoard(scope?: string, remoteToken?: string | null) {
  const token = remoteToken ?? null;
  const [state, dispatch] = useReducer(reducer, scope, load);
  const [remoteReady, setRemoteReady] = useState(!token);
  const [sync, setSync] = useState<BoardSyncState>(
    token ? {status: "loading", message: "Loading cloud board..."} : {status: "local", message: "Local-only storage"},
  );
  const remoteVersionRef = useRef(0);
  const skipNextRemoteSaveRef = useRef(false);
  const remotePausedRef = useRef(false);

  useEffect(() => {
    localStorage.setItem(storageKey(scope), JSON.stringify(state));
  }, [state, scope]);

  useEffect(() => {
    let cancelled = false;
    remoteVersionRef.current = 0;
    skipNextRemoteSaveRef.current = false;
    remotePausedRef.current = false;

    if (!token) {
      setRemoteReady(true);
      setSync({status: "local", message: "Local-only storage"});
      return () => {
        cancelled = true;
      };
    }

    setRemoteReady(false);
    setSync({status: "loading", message: "Loading cloud board..."});

    fetchRemoteBoard(token)
      .then((remote) => {
        if (cancelled) return;
        remoteVersionRef.current = remote.version;
        if (remote.state) {
          const normalized = normalizeBoardState(remote.state);
          if (!normalized) throw new Error("Cloud board data is invalid.");
          skipNextRemoteSaveRef.current = true;
          dispatch({type: "hydrate", state: normalized});
          setSync({status: "synced", message: "Synced to Neon", updatedAt: remote.updatedAt});
        } else {
          setSync({status: "saving", message: "Creating cloud board..."});
        }
        setRemoteReady(true);
      })
      .catch((err) => {
        if (cancelled) return;
        remotePausedRef.current = true;
        setSync({status: "error", message: err instanceof Error ? err.message : "Cloud sync unavailable"});
      });

    return () => {
      cancelled = true;
    };
  }, [scope, token]);

  useEffect(() => {
    if (!token || !remoteReady || remotePausedRef.current) return;
    if (skipNextRemoteSaveRef.current) {
      skipNextRemoteSaveRef.current = false;
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSync({status: "saving", message: "Saving to Neon..."});
      saveRemoteBoard(token, state, remoteVersionRef.current)
        .then((remote) => {
          if (cancelled) return;
          remoteVersionRef.current = remote.version;
          setSync({status: "synced", message: "Synced to Neon", updatedAt: remote.updatedAt});
        })
        .catch((err) => {
          if (cancelled) return;
          if (err instanceof RemoteBoardConflict) {
            remotePausedRef.current = true;
            remoteVersionRef.current = err.remote.version;
            setSync({
              status: "conflict",
              message: "Remote board changed. Refresh before continuing.",
              updatedAt: err.remote.updatedAt,
            });
          } else {
            setSync({status: "error", message: err instanceof Error ? err.message : "Cloud sync unavailable"});
          }
        });
    }, 800);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [state, token, remoteReady]);

  return {state, dispatch, sync};
}
