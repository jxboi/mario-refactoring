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
    parentId: null,
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
    expect(activeWorkspace(current).categories.plan.some((category) => category.label === "Alpha only")).toBe(false);
    expect(activeWorkspace(current).skills.some((skill) => skill.id === "alpha-skill")).toBe(false);

    current = reducer(current, {type: "workspace-switch", id: firstId});
    expect(activeProject(current).items.map((entry) => entry.id)).toEqual(["first"]);
    expect(activeWorkspace(current).categories.plan.some((category) => category.label === "Alpha only")).toBe(true);
    expect(activeWorkspace(current).skills.some((skill) => skill.id === "alpha-skill")).toBe(true);
    expect(secondId).not.toBe(firstId);
  });

  it("remembers the active project in each workspace", () => {
    let current = state();
    current = reducer(current, {type: "add", item: item("plan-owner")});
    const firstWorkspaceId = current.activeWorkspaceId;
    current = reducer(current, {type: "project-create", name: "Tasks", projectType: "task", parentId: "plan-owner"});
    const taskProjectId = activeWorkspace(current).activeProjectId;
    current = reducer(current, {type: "workspace-create", name: "Beta"});
    current = reducer(current, {type: "workspace-switch", id: firstWorkspaceId});
    expect(activeWorkspace(current).activeProjectId).toBe(taskProjectId);
  });

  it("rejects direct downstream projects and orphaned downstream items", () => {
    let current = state();
    current = reducer(current, {type: "project-create", name: "Orphan tasks", projectType: "task"});
    expect(activeWorkspace(current).projects).toHaveLength(1);

    current = reducer(current, {type: "add", item: item("plan-owner")});
    current = reducer(current, {type: "project-create", name: "Tasks", projectType: "task", parentId: "plan-owner"});
    expect(activeProject(current).type).toBe("task");
    current = reducer(current, {type: "add", item: item("orphan-task")});
    current = reducer(current, {type: "add", item: {...item("owned-task"), parentId: "plan-owner"}});
    expect(activeProject(current).items.map((entry) => entry.id)).toEqual(["owned-task"]);
  });

  it("replaces the final deleted workspace with a fresh default", () => {
    let current = state();
    const deletedId = current.activeWorkspaceId;
    current = reducer(current, {type: "workspace-delete", id: deletedId});
    expect(current.workspaces).toHaveLength(1);
    expect(current.activeWorkspaceId).not.toBe(deletedId);
    expect(activeWorkspace(current).name).toBe(DEFAULT_WORKSPACE_NAME);
    expect(activeProject(current).type).toBe("plan");
  });

  it("reparents only to the adjacent level and keeps one owner", () => {
    let current = state();
    const workspace = activeWorkspace(current);
    const plan = {...newProject("Plan", "plan", "plan"), items: [item("p1"), item("p2")]};
    const tasks = {...newProject("Tasks", "task", "tasks"), items: [{...item("t1"), parentId: "p1"}]};
    const coding = {...newProject("Coding", "coding", "coding"), items: [{...item("c1"), parentId: "t1"}]};
    current = {...current, workspaces: [{...workspace, projects: [plan, tasks, coding], activeProjectId: "tasks"}]};

    current = reducer(current, {type: "reparent", childId: "t1", parentId: "p2"});
    current = reducer(current, {type: "reparent", childId: "c1", parentId: "p1"});
    expect(activeWorkspace(current).projects[1].items[0].parentId).toBe("p2");
    expect(activeWorkspace(current).projects[2].items[0].parentId).toBe("t1");
  });

  it("blocks deleting an item or project that still owns descendants", () => {
    let current = state();
    const workspace = activeWorkspace(current);
    const plan = {...newProject("Plan", "plan", "plan"), items: [item("p1")]};
    const taskItem = {...item("t1"), parentId: "p1"};
    const tasks = {...newProject("Tasks", "task", "tasks"), items: [taskItem]};
    current = {...current, workspaces: [{...workspace, projects: [plan, tasks], activeProjectId: "tasks"}]};
    current = reducer(current, {type: "delete", id: "p1"});
    expect(activeWorkspace(current).projects[0].items).toHaveLength(1);

    current = reducer(current, {type: "project-delete", id: "plan"});
    expect(activeWorkspace(current).projects).toHaveLength(2);
  });
});

describe("workspace normalization", () => {
  it("migrates legacy projects, categories, active project, and skills", () => {
    const project = newProject("Legacy coding", "coding");
    project.items = [item("legacy")];
    const skills = [{id: "skill-1", name: "Legacy", description: "", body: "Prompt", createdAt: 1, updatedAt: 1}];
    const migrated = normalizeAppState({projects: [project], activeId: project.id, categories: {refactoring: [], task: []}}, skills);

    expect(migrated?.workspaces).toHaveLength(1);
    expect(activeWorkspace(migrated!).name).toBe(DEFAULT_WORKSPACE_NAME);
    expect(activeProject(migrated!).type).toBe("coding");
    expect(activeProject(migrated!).items).toHaveLength(0);
    expect(activeWorkspace(migrated!).categories.coding.some((category) => category.id === "feature")).toBe(true);
    expect(activeWorkspace(migrated!).skills).toEqual(skills);
  });

  it("keeps the first valid legacy parent and removes orphaned descendants", () => {
    const plan = {...newProject("Plan", "plan", "plan"), items: [item("p1"), item("p2")]};
    const tasks = {...newProject("Tasks", "task", "tasks"), items: [
      {...item("t1"), parentIds: ["missing", "p2", "p1"]},
      {...item("orphan-task"), parentIds: ["missing"]},
    ]};
    const coding = {...newProject("Coding", "coding", "coding"), items: [
      {...item("c1"), parentIds: ["p1", "t1"]},
      {...item("orphan-code"), parentIds: ["orphan-task"]},
    ]};
    const normalized = normalizeAppState({workspaces: [{id: "w", name: "Work", createdAt: 1, projects: [plan, tasks, coding], activeProjectId: "tasks", categories: {}, skills: []}], activeWorkspaceId: "w"});
    expect(normalized!.workspaces[0].projects[1].items.map((entry) => [entry.id, entry.parentId])).toEqual([["t1", "p2"]]);
    expect(normalized!.workspaces[0].projects[2].items.map((entry) => [entry.id, entry.parentId])).toEqual([["c1", "t1"]]);
  });

  it("rejects malformed workspace project data", () => {
    expect(normalizeAppState({workspaces: [{id: "w", name: "Bad", projects: [{id: "p", items: [{}]}]}], activeWorkspaceId: "w"})).toBeNull();
  });
});
