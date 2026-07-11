import {describe, expect, it} from "vitest";
import {activeProject, activeWorkspace, DEFAULT_WORKSPACE_NAME, newProject, newWorkspace, normalizeAppState, reducer, type AppState} from "./store";
import type {WorkItem} from "../types";

function item(id: string): WorkItem {
  return {
    id,
    title: `Item ${id}`,
    description: "",
    files: [],
    risk: "medium",
    effort: "medium",
    category: "other",
    tags: [],
    stage: "queued",
    blocked: false,
    blockReason: "",
    notes: [],
    parentIds: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

function state(): AppState {
  const workspace = newWorkspace("Alpha");
  return {workspaces: [workspace], activeWorkspaceId: workspace.id};
}

describe("workspace reducer", () => {
  it("isolates projects, items, categories, and skills by workspace", () => {
    let current = state();
    const firstId = current.activeWorkspaceId;
    current = reducer(current, {type: "add", item: item("first")});
    current = reducer(current, {type: "category-add", label: "Alpha only"});
    current = reducer(current, {type: "skill-create", skill: {id: "alpha-skill", name: "Alpha only", description: "", body: "Prompt", createdAt: 1, updatedAt: 1}});
    current = reducer(current, {type: "workspace-create", name: "Beta"});
    const secondId = current.activeWorkspaceId;
    current = reducer(current, {type: "add", item: item("second")});

    expect(activeProject(current).items.map((entry) => entry.id)).toEqual(["second"]);
    expect(activeWorkspace(current).categories.coding.some((category) => category.label === "Alpha only")).toBe(false);
    expect(activeWorkspace(current).skills.some((skill) => skill.id === "alpha-skill")).toBe(false);

    current = reducer(current, {type: "workspace-switch", id: firstId});
    expect(activeProject(current).items.map((entry) => entry.id)).toEqual(["first"]);
    expect(activeWorkspace(current).categories.coding.some((category) => category.label === "Alpha only")).toBe(true);
    expect(activeWorkspace(current).skills.some((skill) => skill.id === "alpha-skill")).toBe(true);
    expect(secondId).not.toBe(firstId);
  });

  it("remembers the active project in each workspace", () => {
    let current = state();
    const firstWorkspaceId = current.activeWorkspaceId;
    current = reducer(current, {type: "project-create", name: "Tasks", projectType: "task"});
    const taskProjectId = activeWorkspace(current).activeProjectId;
    current = reducer(current, {type: "workspace-create", name: "Beta"});
    current = reducer(current, {type: "workspace-switch", id: firstWorkspaceId});
    expect(activeWorkspace(current).activeProjectId).toBe(taskProjectId);
  });

  it("replaces the final deleted workspace with a fresh default", () => {
    let current = state();
    const deletedId = current.activeWorkspaceId;
    current = reducer(current, {type: "workspace-delete", id: deletedId});
    expect(current.workspaces).toHaveLength(1);
    expect(current.activeWorkspaceId).not.toBe(deletedId);
    expect(activeWorkspace(current).name).toBe(DEFAULT_WORKSPACE_NAME);
    expect(activeProject(current).type).toBe("coding");
  });

  it("links only adjacent project types and supports multiple parents", () => {
    let current = state();
    const workspace = activeWorkspace(current);
    const plan = {...newProject("Plan", "plan", "plan"), items: [item("p1"), item("p2")]};
    const tasks = {...newProject("Tasks", "task", "tasks"), items: [item("t1")]};
    const coding = {...newProject("Coding", "coding", "coding"), items: [item("c1")]};
    current = {...current, workspaces: [{...workspace, projects: [plan, tasks, coding], activeProjectId: "tasks"}]};

    current = reducer(current, {type: "link-parent", childId: "t1", parentId: "p1"});
    current = reducer(current, {type: "link-parent", childId: "t1", parentId: "p2"});
    current = reducer(current, {type: "link-parent", childId: "c1", parentId: "p1"});
    expect(activeWorkspace(current).projects[1].items[0].parentIds).toEqual(["p1", "p2"]);
    expect(activeWorkspace(current).projects[2].items[0].parentIds).toEqual([]);
  });

  it("cleans links without cascading when a linked project is deleted", () => {
    let current = state();
    const workspace = activeWorkspace(current);
    const plan = {...newProject("Plan", "plan", "plan"), items: [item("p1")]};
    const taskItem = {...item("t1"), parentIds: ["p1"]};
    const tasks = {...newProject("Tasks", "task", "tasks"), items: [taskItem]};
    current = {...current, workspaces: [{...workspace, projects: [plan, tasks], activeProjectId: "tasks"}]};
    current = reducer(current, {type: "project-delete", id: "plan"});

    expect(activeWorkspace(current).projects).toHaveLength(1);
    expect(activeWorkspace(current).projects[0].items.map((entry) => entry.id)).toEqual(["t1"]);
    expect(activeWorkspace(current).projects[0].items[0].parentIds).toEqual([]);
  });
});

describe("workspace normalization", () => {
  it("migrates legacy projects, categories, active project, and skills", () => {
    const project = newWorkspace().projects[0];
    project.items = [item("legacy")];
    const skills = [{id: "skill-1", name: "Legacy", description: "", body: "Prompt", createdAt: 1, updatedAt: 1}];
    const migrated = normalizeAppState({projects: [project], activeId: project.id, categories: {refactoring: [], task: []}}, skills);

    expect(migrated?.workspaces).toHaveLength(1);
    expect(activeWorkspace(migrated!).name).toBe(DEFAULT_WORKSPACE_NAME);
    expect(activeProject(migrated!).items[0].id).toBe("legacy");
    expect(activeProject(migrated!).type).toBe("coding");
    expect(activeWorkspace(migrated!).categories.coding.some((category) => category.id === "feature")).toBe(true);
    expect(activeWorkspace(migrated!).skills).toEqual(skills);
  });

  it("drops duplicate, missing, and wrong-level links during normalization", () => {
    const plan = {...newProject("Plan", "plan", "plan"), items: [item("p1")]};
    const tasks = {...newProject("Tasks", "task", "tasks"), items: [{...item("t1"), parentIds: ["p1", "p1", "missing"]}]};
    const coding = {...newProject("Coding", "coding", "coding"), items: [{...item("c1"), parentIds: ["p1", "t1"]}]};
    const normalized = normalizeAppState({workspaces: [{id: "w", name: "Work", createdAt: 1, projects: [plan, tasks, coding], activeProjectId: "tasks", categories: {}, skills: []}], activeWorkspaceId: "w"});
    expect(normalized!.workspaces[0].projects[1].items[0].parentIds).toEqual(["p1"]);
    expect(normalized!.workspaces[0].projects[2].items[0].parentIds).toEqual(["t1"]);
  });

  it("rejects malformed workspace project data", () => {
    expect(normalizeAppState({workspaces: [{id: "w", name: "Bad", projects: [{id: "p", items: [{}]}]}], activeWorkspaceId: "w"})).toBeNull();
  });
});
