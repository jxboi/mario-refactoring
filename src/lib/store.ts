import {useEffect, useReducer} from "react";
import type {Note, RefactorItem, Stage} from "../types";
import {blockedFrom, uid} from "../types";

const STORAGE_KEY = "chisel.projects.v2";
const LEGACY_KEY = "chisel.board.v1";

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  items: RefactorItem[];
}

export interface BoardState {
  projects: Project[];
  activeId: string;
}

export type Action = {type: "import"; items: RefactorItem[]} | {type: "move"; id: string; stage: Stage; beforeId?: string} | {type: "update"; id: string; patch: Partial<Omit<RefactorItem, "id" | "notes">>} | {type: "add-note"; id: string; text: string} | {type: "edit-note"; id: string; noteId: string; text: string} | {type: "delete-note"; id: string; noteId: string} | {type: "toggle-note-block"; id: string; noteId: string} | {type: "delete"; id: string} | {type: "add"; item: RefactorItem} | {type: "project-create"; name: string} | {type: "project-rename"; id: string; name: string} | {type: "project-delete"; id: string} | {type: "project-switch"; id: string};

function newProject(name: string): Project {
  return {id: uid(), name, createdAt: Date.now(), items: []};
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
      return mapActive(state, (items) => items.map((i) => (i.id === action.id ? touch(syncBlocked({...i, notes: i.notes.map((n) => (n.id === action.noteId ? {...n, blocked: !n.blocked, resolved: n.blocked} : n))})) : i)));
    case "delete":
      return mapActive(state, (items) => items.filter((i) => i.id !== action.id));

    case "project-create": {
      const name = action.name.trim() || "Untitled project";
      const project = newProject(name);
      return {projects: [...state.projects, project], activeId: project.id};
    }
    case "project-rename":
      return {
        ...state,
        projects: state.projects.map((p) => (p.id === action.id ? {...p, name: action.name.trim() || p.name} : p)),
      };
    case "project-delete": {
      const remaining = state.projects.filter((p) => p.id !== action.id);
      if (remaining.length === 0) {
        const fresh = newProject("My refactors");
        return {projects: [fresh], activeId: fresh.id};
      }
      const activeId = state.activeId === action.id ? remaining[0].id : state.activeId;
      return {projects: remaining, activeId};
    }
    case "project-switch":
      return state.projects.some((p) => p.id === action.id) ? {...state, activeId: action.id} : state;
  }
}

export function activeProject(state: BoardState): Project {
  return state.projects.find((p) => p.id === state.activeId) ?? state.projects[0];
}

/** localStorage key for a given board scope (e.g. a signed-in user's id). */
function storageKey(scope?: string): string {
  return scope ? `${STORAGE_KEY}.${scope}` : STORAGE_KEY;
}

function load(scope?: string): BoardState {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.projects) && parsed.projects.length > 0) {
        const state = parsed as BoardState;
        if (!state.projects.some((p) => p.id === state.activeId)) state.activeId = state.projects[0].id;
        return state;
      }
    }
    // migrate the single-board v1 format into a default project (unscoped only)
    if (!scope) {
      const legacy = localStorage.getItem(LEGACY_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy);
        if (parsed && Array.isArray(parsed.items)) {
          const project = {...newProject("My refactors"), items: parsed.items as RefactorItem[]};
          return {projects: [project], activeId: project.id};
        }
      }
    }
  } catch {
    /* corrupted storage — start fresh */
  }
  const project = newProject("My refactors");
  return {projects: [project], activeId: project.id};
}

export function useBoard(scope?: string) {
  const [state, dispatch] = useReducer(reducer, scope, load);
  useEffect(() => {
    localStorage.setItem(storageKey(scope), JSON.stringify(state));
  }, [state, scope]);
  return {state, dispatch};
}
