import {useEffect, useReducer, useRef, useState} from "react";
import type {CategoryDef, Note, ProjectType, Stage, WorkItem} from "../types";
import {blockedFrom, defaultCategoriesFor, FALLBACK_CATEGORY_ID, parentTypeFor, PROJECT_TYPES, slugifyCategory, uid} from "../types";
import {defaultSkills, normalizeSkills, type Skill} from "./skills";
import {fetchRemoteBoard, RemoteBoardConflict, saveRemoteBoard} from "./remoteBoard";

const STORAGE_KEY = "chisel.workspaces.v3";
const LEGACY_PROJECTS_KEY = "chisel.projects.v2";
const LEGACY_BOARD_KEY = "chisel.board.v1";
const LEGACY_SKILLS_KEY = "chisel.skills.v1";
export const DEFAULT_PROJECT_NAME = "My project";
export const DEFAULT_WORKSPACE_NAME = "My workspace";

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  createdAt: number;
  items: WorkItem[];
}

export type CategoriesByType = Record<ProjectType, CategoryDef[]>;

export interface Workspace {
  id: string;
  name: string;
  createdAt: number;
  projects: Project[];
  activeProjectId: string;
  categories: CategoriesByType;
  skills: Skill[];
}

export interface AppState {
  workspaces: Workspace[];
  activeWorkspaceId: string;
}

export type Action =
  | {type: "hydrate"; state: AppState}
  | {type: "workspace-create"; name: string}
  | {type: "workspace-import"; workspace: Workspace}
  | {type: "workspace-rename"; id: string; name: string}
  | {type: "workspace-delete"; id: string}
  | {type: "workspace-switch"; id: string}
  | {type: "import"; items: WorkItem[]}
  | {type: "move"; id: string; stage: Stage; beforeId?: string}
  | {type: "update"; id: string; patch: Partial<Omit<WorkItem, "id" | "notes">>}
  | {type: "add-note"; id: string; text: string}
  | {type: "edit-note"; id: string; noteId: string; text: string}
  | {type: "delete-note"; id: string; noteId: string}
  | {type: "toggle-note-block"; id: string; noteId: string}
  | {type: "toggle-note-resolved"; id: string; noteId: string}
  | {type: "delete"; id: string}
  | {type: "add"; item: WorkItem}
  | {type: "add-to-project"; projectId: string; item: WorkItem}
  | {type: "link-parent"; childId: string; parentId: string}
  | {type: "unlink-parent"; childId: string; parentId: string}
  | {type: "project-create"; name: string; projectType: ProjectType; id?: string}
  | {type: "project-rename"; id: string; name: string}
  | {type: "project-delete"; id: string}
  | {type: "project-switch"; id: string}
  | {type: "category-add"; label: string}
  | {type: "category-rename"; id: string; label: string}
  | {type: "category-set-glyph"; id: string; glyph: string}
  | {type: "category-delete"; id: string}
  | {type: "categories-merge"; categories: CategoryDef[]}
  | {type: "skill-create"; skill: Skill}
  | {type: "skill-update"; id: string; patch: Partial<Omit<Skill, "id" | "createdAt">>}
  | {type: "skill-delete"; id: string};

export type BoardSyncState =
  | {status: "local"; message: string}
  | {status: "loading"; message: string}
  | {status: "saving"; message: string}
  | {status: "synced"; message: string; updatedAt: string | null}
  | {status: "error"; message: string}
  | {status: "conflict"; message: string; updatedAt: string | null};

export function newProject(name = DEFAULT_PROJECT_NAME, projectType: ProjectType = "coding", id = uid()): Project {
  return {id, name, type: projectType, createdAt: Date.now(), items: []};
}

function freshCategories(): CategoriesByType {
  return Object.fromEntries(PROJECT_TYPES.map((type) => [type, defaultCategoriesFor(type)])) as CategoriesByType;
}

export function newWorkspace(name = DEFAULT_WORKSPACE_NAME): Workspace {
  const project = newProject();
  return {
    id: uid(),
    name: name.trim() || "Untitled workspace",
    createdAt: Date.now(),
    projects: [project],
    activeProjectId: project.id,
    categories: freshCategories(),
    skills: defaultSkills(),
  };
}

function touch(item: WorkItem): WorkItem {
  return {...item, updatedAt: Date.now()};
}

function syncBlocked(item: WorkItem): WorkItem {
  return {...item, ...blockedFrom(item.notes)};
}

function mapActiveWorkspace(state: AppState, fn: (workspace: Workspace) => Workspace): AppState {
  return {...state, workspaces: state.workspaces.map((workspace) => (workspace.id === state.activeWorkspaceId ? fn(workspace) : workspace))};
}

function mapActiveItems(state: AppState, fn: (items: WorkItem[]) => WorkItem[]): AppState {
  return mapActiveWorkspace(state, (workspace) => ({
    ...workspace,
    projects: workspace.projects.map((project) => (project.id === workspace.activeProjectId ? {...project, items: fn(project.items)} : project)),
  }));
}

function mapWorkspaceItems(workspace: Workspace, fn: (item: WorkItem, project: Project) => WorkItem): Workspace {
  return {...workspace, projects: workspace.projects.map((project) => ({...project, items: project.items.map((item) => fn(item, project))}))};
}

function locateItem(workspace: Workspace, id: string): {item: WorkItem; project: Project} | undefined {
  for (const project of workspace.projects) {
    const item = project.items.find((entry) => entry.id === id);
    if (item) return {item, project};
  }
  return undefined;
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "hydrate":
      return action.state;
    case "workspace-create": {
      const workspace = newWorkspace(action.name);
      return {...state, workspaces: [...state.workspaces, workspace], activeWorkspaceId: workspace.id};
    }
    case "workspace-import":
      return {...state, workspaces: [...state.workspaces, action.workspace], activeWorkspaceId: action.workspace.id};
    case "workspace-rename":
      return {...state, workspaces: state.workspaces.map((workspace) => (workspace.id === action.id ? {...workspace, name: action.name.trim() || workspace.name} : workspace))};
    case "workspace-delete": {
      const remaining = state.workspaces.filter((workspace) => workspace.id !== action.id);
      if (remaining.length === 0) {
        const workspace = newWorkspace();
        return {workspaces: [workspace], activeWorkspaceId: workspace.id};
      }
      return {...state, workspaces: remaining, activeWorkspaceId: state.activeWorkspaceId === action.id ? remaining[0].id : state.activeWorkspaceId};
    }
    case "workspace-switch":
      return state.workspaces.some((workspace) => workspace.id === action.id) ? {...state, activeWorkspaceId: action.id} : state;
    case "import":
      return mapActiveItems(state, (items) => [...items, ...action.items]);
    case "add":
      return mapActiveItems(state, (items) => [...items, action.item]);
    case "add-to-project":
      return mapActiveWorkspace(state, (workspace) => workspace.projects.some((project) => project.id === action.projectId)
        ? {...workspace, projects: workspace.projects.map((project) => project.id === action.projectId ? {...project, items: [...project.items, action.item]} : project)}
        : workspace);
    case "link-parent":
      return mapActiveWorkspace(state, (workspace) => {
        const child = locateItem(workspace, action.childId);
        const parent = locateItem(workspace, action.parentId);
        if (!child || !parent || parentTypeFor(child.project.type) !== parent.project.type || child.item.id === parent.item.id) return workspace;
        if (child.item.parentIds.includes(parent.item.id)) return workspace;
        return mapWorkspaceItems(workspace, (item) => item.id === child.item.id ? touch({...item, parentIds: [...item.parentIds, parent.item.id]}) : item);
      });
    case "unlink-parent":
      return mapActiveWorkspace(state, (workspace) => mapWorkspaceItems(workspace, (item) => item.id === action.childId && item.parentIds.includes(action.parentId)
        ? touch({...item, parentIds: item.parentIds.filter((id) => id !== action.parentId)})
        : item));
    case "move":
      return mapActiveItems(state, (items) => {
        const moving = items.find((item) => item.id === action.id);
        if (!moving) return items;
        const rest = items.filter((item) => item.id !== action.id);
        const moved = touch({...moving, stage: action.stage});
        if (action.beforeId) {
          const at = rest.findIndex((item) => item.id === action.beforeId);
          if (at >= 0) return [...rest.slice(0, at), moved, ...rest.slice(at)];
        }
        return [...rest, moved];
      });
    case "update":
      return mapActiveItems(state, (items) => items.map((item) => (item.id === action.id ? touch({...item, ...action.patch}) : item)));
    case "add-note": {
      const note: Note = {id: uid(), text: action.text, createdAt: Date.now()};
      return mapActiveItems(state, (items) => items.map((item) => (item.id === action.id ? touch(syncBlocked({...item, notes: [...item.notes, note]})) : item)));
    }
    case "edit-note":
      return mapActiveItems(state, (items) => items.map((item) => (item.id === action.id ? touch(syncBlocked({...item, notes: item.notes.map((note) => (note.id === action.noteId ? {...note, text: action.text} : note))})) : item)));
    case "delete-note":
      return mapActiveItems(state, (items) => items.map((item) => (item.id === action.id ? touch(syncBlocked({...item, notes: item.notes.filter((note) => note.id !== action.noteId)})) : item)));
    case "toggle-note-block":
      return mapActiveItems(state, (items) => items.map((item) => (item.id === action.id ? touch(syncBlocked({...item, notes: item.notes.map((note) => (note.id === action.noteId ? {...note, blocked: !note.blocked, resolved: false} : note))})) : item)));
    case "toggle-note-resolved":
      return mapActiveItems(state, (items) => items.map((item) => (item.id === action.id ? touch(syncBlocked({...item, notes: item.notes.map((note) => (note.id === action.noteId ? {...note, resolved: !note.resolved, blocked: note.resolved ? note.blocked : false} : note))})) : item)));
    case "delete":
      return mapActiveWorkspace(state, (workspace) => {
        const activeId = workspace.activeProjectId;
        return {...workspace, projects: workspace.projects.map((project) => ({
          ...project,
          items: project.id === activeId
            ? project.items.filter((item) => item.id !== action.id).map((item) => item.parentIds.includes(action.id) ? {...item, parentIds: item.parentIds.filter((id) => id !== action.id)} : item)
            : project.items.map((item) => item.parentIds.includes(action.id) ? {...item, parentIds: item.parentIds.filter((id) => id !== action.id)} : item),
        }))};
      });
    case "project-create":
      return mapActiveWorkspace(state, (workspace) => {
        const project = newProject(action.name.trim() || "Untitled project", action.projectType, action.id);
        return {...workspace, projects: [...workspace.projects, project], activeProjectId: project.id};
      });
    case "project-rename":
      return mapActiveWorkspace(state, (workspace) => ({...workspace, projects: workspace.projects.map((project) => (project.id === action.id ? {...project, name: action.name.trim() || project.name} : project))}));
    case "project-delete":
      return mapActiveWorkspace(state, (workspace) => {
        const removedItemIds = new Set(workspace.projects.find((project) => project.id === action.id)?.items.map((item) => item.id) ?? []);
        const remaining = workspace.projects.filter((project) => project.id !== action.id);
        if (remaining.length === 0) {
          const project = newProject();
          return {...workspace, projects: [project], activeProjectId: project.id};
        }
        const cleaned = remaining.map((project) => ({...project, items: project.items.map((item) => ({...item, parentIds: item.parentIds.filter((id) => !removedItemIds.has(id))}))}));
        return {...workspace, projects: cleaned, activeProjectId: workspace.activeProjectId === action.id ? cleaned[0].id : workspace.activeProjectId};
      });
    case "project-switch":
      return mapActiveWorkspace(state, (workspace) => (workspace.projects.some((project) => project.id === action.id) ? {...workspace, activeProjectId: action.id} : workspace));
    case "category-add":
      return mapActiveWorkspace(state, (workspace) => {
        const label = action.label.trim();
        if (!label) return workspace;
        const type = activeProjectIn(workspace).type;
        const list = workspace.categories[type];
        const base = slugifyCategory(label);
        const existing = new Set(list.map((category) => category.id));
        let id = base;
        for (let n = 2; existing.has(id); n++) id = `${base}-${n}`;
        const category: CategoryDef = {id, label, glyph: "·"};
        const at = list.findIndex((entry) => entry.id === FALLBACK_CATEGORY_ID);
        const next = at >= 0 ? [...list.slice(0, at), category, ...list.slice(at)] : [...list, category];
        return {...workspace, categories: {...workspace.categories, [type]: next}};
      });
    case "categories-merge":
      return mapActiveWorkspace(state, (workspace) => {
        const type = activeProjectIn(workspace).type;
        const list = workspace.categories[type];
        const existing = new Set(list.map((category) => category.id));
        const additions = action.categories.filter((category) => category.id !== FALLBACK_CATEGORY_ID && !existing.has(category.id));
        if (additions.length === 0) return workspace;
        const at = list.findIndex((category) => category.id === FALLBACK_CATEGORY_ID);
        const next = at >= 0 ? [...list.slice(0, at), ...additions, ...list.slice(at)] : [...list, ...additions];
        return {...workspace, categories: {...workspace.categories, [type]: next}};
      });
    case "category-rename":
      return mapActiveWorkspace(state, (workspace) => {
        const label = action.label.trim();
        if (!label) return workspace;
        const type = activeProjectIn(workspace).type;
        return {...workspace, categories: {...workspace.categories, [type]: workspace.categories[type].map((category) => (category.id === action.id ? {...category, label} : category))}};
      });
    case "category-set-glyph":
      return mapActiveWorkspace(state, (workspace) => {
        const glyph = action.glyph.trim();
        if (!glyph) return workspace;
        const type = activeProjectIn(workspace).type;
        return {...workspace, categories: {...workspace.categories, [type]: workspace.categories[type].map((category) => (category.id === action.id ? {...category, glyph} : category))}};
      });
    case "category-delete":
      return mapActiveWorkspace(state, (workspace) => {
        if (action.id === FALLBACK_CATEGORY_ID) return workspace;
        const type = activeProjectIn(workspace).type;
        return {
          ...workspace,
          categories: {...workspace.categories, [type]: workspace.categories[type].filter((category) => category.id !== action.id)},
          projects: workspace.projects.map((project) => project.type === type ? {...project, items: project.items.map((item) => item.category === action.id ? {...item, category: FALLBACK_CATEGORY_ID} : item)} : project),
        };
      });
    case "skill-create":
      return mapActiveWorkspace(state, (workspace) => ({...workspace, skills: [...workspace.skills, action.skill]}));
    case "skill-update":
      return mapActiveWorkspace(state, (workspace) => ({...workspace, skills: workspace.skills.map((skill) => skill.id === action.id ? {...skill, ...action.patch, updatedAt: Date.now()} : skill)}));
    case "skill-delete":
      return mapActiveWorkspace(state, (workspace) => ({...workspace, skills: workspace.skills.filter((skill) => skill.id !== action.id)}));
  }
}

export function activeWorkspace(state: AppState): Workspace {
  return state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) ?? state.workspaces[0];
}

function activeProjectIn(workspace: Workspace): Project {
  return workspace.projects.find((project) => project.id === workspace.activeProjectId) ?? workspace.projects[0];
}

export function activeProject(state: AppState): Project {
  return activeProjectIn(activeWorkspace(state));
}

export function activeType(state: AppState): ProjectType {
  return activeProject(state)?.type ?? "coding";
}

function storageKey(base: string, scope?: string): string {
  return scope ? `${base}.${scope}` : base;
}

function fillCategories(list: unknown, type: ProjectType): CategoryDef[] {
  const defaults = defaultCategoriesFor(type);
  const base = Array.isArray(list) && list.length > 0 ? (list as CategoryDef[]).map((category) => ({...category})) : defaults.map((category) => ({...category}));
  const existing = new Set(base.map((category) => category.id));
  const missing = defaults.filter((category) => category.id !== FALLBACK_CATEGORY_ID && !existing.has(category.id)).map((category) => ({...category}));
  const withFallback = base.some((category) => category.id === FALLBACK_CATEGORY_ID) ? base : [...base, {id: FALLBACK_CATEGORY_ID, label: "Other", glyph: "·"}];
  const at = withFallback.findIndex((category) => category.id === FALLBACK_CATEGORY_ID);
  return missing.length === 0 ? withFallback : [...withFallback.slice(0, at), ...missing, ...withFallback.slice(at)];
}

function normalizeCategories(raw: unknown): CategoriesByType {
  const value = Array.isArray(raw) ? {coding: raw as CategoryDef[]} : ((raw ?? {}) as Record<string, CategoryDef[]>);
  const source: Partial<Record<ProjectType, CategoryDef[]>> = {
    plan: value.plan,
    task: value.task,
    coding: value.coding ?? value.refactoring,
  };
  return Object.fromEntries(PROJECT_TYPES.map((type) => [type, fillCategories(source[type], type)])) as CategoriesByType;
}

function normalizeProjects(value: unknown): Project[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((project): project is Project => {
      if (!project || typeof project !== "object") return false;
      const candidate = project as Project;
      return typeof candidate.id === "string" && Array.isArray(candidate.items) && candidate.items.every((item) => {
        if (!item || typeof item !== "object") return false;
        const entry = item as WorkItem;
        return typeof entry.id === "string" && typeof entry.title === "string" && Array.isArray(entry.files) && Array.isArray(entry.tags) && Array.isArray(entry.notes) && entry.notes.every((note) => note && typeof note.id === "string" && typeof note.text === "string");
      });
    })
    .map((project) => {
      const rawType = (project as Project & {type?: string}).type;
      const type: ProjectType = rawType === "plan" ? "plan" : rawType === "task" ? "task" : "coding";
      return {...project, type, name: project.name || DEFAULT_PROJECT_NAME, items: project.items.map((item) => ({...item, parentIds: Array.isArray(item.parentIds) ? item.parentIds.filter((id): id is string => typeof id === "string") : []}))};
    });
}

function normalizeLinks(projects: Project[]): Project[] {
  const index = new Map<string, ProjectType>();
  for (const project of projects) for (const item of project.items) index.set(item.id, project.type);
  return projects.map((project) => ({...project, items: project.items.map((item) => {
    const expected = parentTypeFor(project.type);
    const parentIds = expected ? [...new Set(item.parentIds)].filter((id) => id !== item.id && index.get(id) === expected) : [];
    return {...item, parentIds};
  })}));
}

export function normalizeWorkspace(value: unknown): Workspace | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<Workspace>;
  const projects = normalizeLinks(normalizeProjects(raw.projects));
  if (typeof raw.id !== "string" || projects.length === 0) return null;
  return {
    id: raw.id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : DEFAULT_WORKSPACE_NAME,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    projects,
    activeProjectId: projects.some((project) => project.id === raw.activeProjectId) ? raw.activeProjectId! : projects[0].id,
    categories: normalizeCategories(raw.categories),
    skills: normalizeSkills(raw.skills),
  };
}

function workspaceFromLegacy(value: unknown, skills?: unknown): Workspace | null {
  if (!value || typeof value !== "object") return null;
  const legacy = value as {projects?: unknown; activeId?: unknown; categories?: unknown};
  const projects = normalizeProjects(legacy.projects);
  if (projects.length === 0) return null;
  return {
    id: uid(),
    name: DEFAULT_WORKSPACE_NAME,
    createdAt: Date.now(),
    projects,
    activeProjectId: typeof legacy.activeId === "string" && projects.some((project) => project.id === legacy.activeId) ? legacy.activeId : projects[0].id,
    categories: normalizeCategories(legacy.categories),
    skills: normalizeSkills(skills),
  };
}

export function normalizeAppState(value: unknown, legacySkills?: unknown): AppState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AppState>;
  if (Array.isArray(raw.workspaces)) {
    const workspaces = raw.workspaces.map(normalizeWorkspace).filter((workspace): workspace is Workspace => workspace !== null);
    if (workspaces.length === 0) return null;
    return {workspaces, activeWorkspaceId: workspaces.some((workspace) => workspace.id === raw.activeWorkspaceId) ? raw.activeWorkspaceId! : workspaces[0].id};
  }
  const workspace = workspaceFromLegacy(value, legacySkills);
  return workspace ? {workspaces: [workspace], activeWorkspaceId: workspace.id} : null;
}

function readLegacySkills(scope?: string): unknown {
  try {
    const raw = localStorage.getItem(storageKey(LEGACY_SKILLS_KEY, scope));
    return raw === null ? undefined : JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function load(scope?: string): AppState {
  try {
    const current = localStorage.getItem(storageKey(STORAGE_KEY, scope));
    if (current) {
      const normalized = normalizeAppState(JSON.parse(current));
      if (normalized) return normalized;
    }
    const legacy = localStorage.getItem(storageKey(LEGACY_PROJECTS_KEY, scope));
    if (legacy) {
      const normalized = normalizeAppState(JSON.parse(legacy), readLegacySkills(scope));
      if (normalized) return normalized;
    }
    if (!scope) {
      const single = localStorage.getItem(LEGACY_BOARD_KEY);
      if (single) {
        const parsed = JSON.parse(single) as {items?: unknown};
        if (Array.isArray(parsed.items)) {
          const project = {...newProject(), items: (parsed.items as WorkItem[]).map((item) => ({...item, parentIds: Array.isArray(item.parentIds) ? item.parentIds : []}))};
          const workspace = newWorkspace();
          workspace.projects = [project];
          workspace.activeProjectId = project.id;
          workspace.skills = normalizeSkills(readLegacySkills(scope));
          return {workspaces: [workspace], activeWorkspaceId: workspace.id};
        }
      }
    }
  } catch {
    // Corrupted storage starts with a fresh workspace.
  }
  const workspace = newWorkspace();
  return {workspaces: [workspace], activeWorkspaceId: workspace.id};
}

export function useBoard(scope?: string, remoteToken?: string | null) {
  const token = remoteToken ?? null;
  const [state, dispatch] = useReducer(reducer, scope, load);
  const [remoteReady, setRemoteReady] = useState(!token);
  const [sync, setSync] = useState<BoardSyncState>(token ? {status: "loading", message: "Loading cloud workspaces..."} : {status: "local", message: "Local-only storage"});
  const remoteVersionRef = useRef(0);
  const skipNextRemoteSaveRef = useRef(false);
  const remotePausedRef = useRef(false);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const localDirtyRef = useRef(false);
  const localRevisionRef = useRef(0);

  useEffect(() => {
    localStorage.setItem(storageKey(STORAGE_KEY, scope), JSON.stringify(state));
  }, [state, scope]);

  useEffect(() => {
    let cancelled = false;
    remoteVersionRef.current = 0;
    skipNextRemoteSaveRef.current = false;
    remotePausedRef.current = false;
    localDirtyRef.current = false;
    localRevisionRef.current = 0;
    if (!token) {
      setRemoteReady(true);
      setSync({status: "local", message: "Local-only storage"});
      return () => { cancelled = true; };
    }
    setRemoteReady(false);
    setSync({status: "loading", message: "Loading cloud workspaces..."});
    fetchRemoteBoard(token)
      .then((remote) => {
        if (cancelled) return;
        remoteVersionRef.current = remote.version;
        if (remote.state) {
          const normalized = normalizeAppState(remote.state, readLegacySkills(scope));
          if (!normalized) throw new Error("Cloud workspace data is invalid.");
          skipNextRemoteSaveRef.current = true;
          dispatch({type: "hydrate", state: normalized});
          setSync({status: "synced", message: "Synced to Neon", updatedAt: remote.updatedAt});
        } else {
          setSync({status: "saving", message: "Creating cloud workspaces..."});
        }
        setRemoteReady(true);
      })
      .catch((error) => {
        if (cancelled) return;
        remotePausedRef.current = true;
        setSync({status: "error", message: error instanceof Error ? error.message : "Cloud sync unavailable"});
      });
    return () => { cancelled = true; };
  }, [scope, token]);

  useEffect(() => {
    if (!token || !remoteReady || remotePausedRef.current) return;
    if (skipNextRemoteSaveRef.current) {
      skipNextRemoteSaveRef.current = false;
      localDirtyRef.current = false;
      return;
    }
    localDirtyRef.current = true;
    const revision = ++localRevisionRef.current;
    setSync({status: "saving", message: "Saving to Neon..."});
    const timer = window.setTimeout(() => {
      saveQueueRef.current = saveQueueRef.current.then(async () => {
        if (remotePausedRef.current) return;
        try {
          const remote = await saveRemoteBoard(token, state, remoteVersionRef.current);
          remoteVersionRef.current = remote.version;
          if (revision === localRevisionRef.current) {
            localDirtyRef.current = false;
            setSync({status: "synced", message: "Synced to Neon", updatedAt: remote.updatedAt});
          } else {
            setSync({status: "saving", message: "Saving to Neon..."});
          }
        } catch (error) {
          if (error instanceof RemoteBoardConflict) {
            remotePausedRef.current = true;
            remoteVersionRef.current = error.remote.version;
            setSync({status: "conflict", message: "Remote workspaces changed. Refresh before continuing.", updatedAt: error.remote.updatedAt});
          } else {
            setSync({status: "error", message: error instanceof Error ? error.message : "Cloud sync unavailable"});
          }
        }
      });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [state, token, remoteReady]);

  useEffect(() => {
    if (!token || !remoteReady) return;
    let cancelled = false;
    let polling = false;

    const poll = async () => {
      if (cancelled || polling || document.visibilityState === "hidden" || remotePausedRef.current || localDirtyRef.current) return;
      polling = true;
      try {
        const remote = await fetchRemoteBoard(token);
        if (cancelled || localDirtyRef.current || remotePausedRef.current) return;
        if (remote.state && remote.version > remoteVersionRef.current) {
          const normalized = normalizeAppState(remote.state, readLegacySkills(scope));
          if (!normalized) throw new Error("Cloud workspace data is invalid.");
          remoteVersionRef.current = remote.version;
          skipNextRemoteSaveRef.current = true;
          dispatch({type: "hydrate", state: normalized});
        }
        setSync({status: "synced", message: "Synced to Neon", updatedAt: remote.updatedAt});
      } catch (error) {
        if (!cancelled) setSync({status: "error", message: error instanceof Error ? error.message : "Cloud sync unavailable"});
      } finally {
        polling = false;
      }
    };

    const timer = window.setInterval(() => void poll(), 3000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void poll();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [dispatch, remoteReady, scope, token]);

  return {state, dispatch, sync};
}
