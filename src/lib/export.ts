import {normalizeWorkspace, type Project, type Workspace} from "./store";
import type {CategoryDef} from "../types";
import {uid} from "../types";

/** Turn a project name into a safe, lowercase file stem. */
export function slugifyName(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

function downloadJson(filename: string, content: string): void {
  const blob = new Blob([content], {type: "application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Serialize a single project to a JSON string. The `items` container key keeps
 * the output round-trippable through the importer, and `categories` carries the
 * board's category list so custom categories survive a round-trip too.
 */
export function projectToJson(project: Project, categories: CategoryDef[]): string {
  const payload = {
    name: project.name,
    type: project.type,
    exportedAt: new Date().toISOString(),
    categories,
    items: project.items.filter((item) => item.title.trim() !== ""),
  };
  return JSON.stringify(payload, null, 2);
}

/** Trigger a browser download of the given project as a JSON file. */
export function exportProject(project: Project, categories: CategoryDef[]): void {
  downloadJson(`${slugifyName(project.name)}.json`, projectToJson(project, categories));
}

export interface WorkspaceExportDocument {
  kind: "chisel-workspace";
  version: 1;
  exportedAt: string;
  workspace: Workspace;
}

export function workspaceToJson(workspace: Workspace): string {
  const payload: WorkspaceExportDocument = {
    kind: "chisel-workspace",
    version: 1,
    exportedAt: new Date().toISOString(),
    workspace,
  };
  return JSON.stringify(payload, null, 2);
}

export function exportWorkspace(workspace: Workspace): void {
  downloadJson(`${slugifyName(workspace.name)}-workspace.json`, workspaceToJson(workspace));
}

export function isWorkspaceExport(text: string): boolean {
  try {
    const value = JSON.parse(text) as {kind?: unknown};
    return value?.kind === "chisel-workspace";
  } catch {
    return false;
  }
}

export function parseWorkspaceJson(text: string): {workspace?: Workspace; error?: string} {
  try {
    const value = JSON.parse(text) as Partial<WorkspaceExportDocument>;
    if (value.kind !== "chisel-workspace") return {error: "This is not a Chisel workspace export."};
    if (value.version !== 1) return {error: "This workspace export version is not supported."};
    const workspace = normalizeWorkspace(value.workspace);
    if (!workspace) return {error: "The workspace export is missing valid workspace or project data."};
    return {workspace};
  } catch (error) {
    return {error: `Not valid JSON — ${error instanceof Error ? error.message : "could not parse file"}`};
  }
}

export function copyWorkspaceForImport(source: Workspace): Workspace {
  const projectIds = new Map<string, string>();
  const projects = source.projects.map((project) => {
    const projectId = uid();
    projectIds.set(project.id, projectId);
    return {
      ...project,
      id: projectId,
      items: project.items.map((item) => ({
        ...item,
        id: uid(),
        notes: item.notes.map((note) => ({...note, id: uid()})),
      })),
    };
  });
  return {
    ...source,
    id: uid(),
    name: `${source.name} copy`,
    createdAt: Date.now(),
    projects,
    activeProjectId: projectIds.get(source.activeProjectId) ?? projects[0].id,
    categories: {
      refactoring: source.categories.refactoring.map((category) => ({...category})),
      task: source.categories.task.map((category) => ({...category})),
    },
    skills: source.skills.map((skill) => ({...skill, id: uid()})),
  };
}
