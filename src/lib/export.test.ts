import {describe, expect, it} from "vitest";
import {copyWorkspaceForImport, isWorkspaceExport, parseWorkspaceJson, workspaceToJson} from "./export";
import {newProject, newWorkspace} from "./store";

describe("workspace import and export", () => {
  it("round-trips a versioned workspace document", () => {
    const workspace = newWorkspace("Engineering");
    const json = workspaceToJson(workspace);
    const parsed = parseWorkspaceJson(json);

    expect(isWorkspaceExport(json)).toBe(true);
    expect(parsed.error).toBeUndefined();
    expect(parsed.workspace?.name).toBe("Engineering");
    expect(parsed.workspace?.projects).toHaveLength(1);
  });

  it("creates an isolated copy with regenerated nested IDs", () => {
    const source = newWorkspace("Engineering");
    const project = source.projects[0];
    project.items = [{
      id: "item-1",
      title: "Extract service",
      description: "",
      files: [],
      risk: "medium",
      effort: "medium",
      category: "other",
      tags: [],
      stage: "queued",
      blocked: false,
      blockReason: "",
      notes: [{id: "note-1", text: "Keep context", createdAt: 1}],
      parentIds: [],
      createdAt: 1,
      updatedAt: 1,
    }];
    const copy = copyWorkspaceForImport(source);

    expect(copy.id).not.toBe(source.id);
    expect(copy.projects[0].id).not.toBe(project.id);
    expect(copy.projects[0].items[0].id).not.toBe("item-1");
    expect(copy.projects[0].items[0].notes[0].id).not.toBe("note-1");
    expect(copy.skills[0].id).not.toBe(source.skills[0].id);
    expect(copy.projects[0].items[0].category).toBe("other");
    expect(copy.projects[0].items[0].createdAt).toBe(1);
  });

  it("remaps relationships when copying a workspace", () => {
    const source = newWorkspace("Product");
    const plan = {...newProject("Plan", "plan"), items: [{...source.projects[0].items[0], ...{
      id: "plan-item", title: "Plan", description: "", files: [], risk: "medium" as const, effort: "medium" as const, category: "other", tags: [], stage: "queued" as const, blocked: false, blockReason: "", notes: [], parentIds: [], createdAt: 1, updatedAt: 1,
    }}]};
    const task = {...newProject("Tasks", "task"), items: [{...plan.items[0], id: "task-item", title: "Task", parentIds: ["plan-item"]}]};
    source.projects = [plan, task];
    source.activeProjectId = task.id;
    const copy = copyWorkspaceForImport(source);
    expect(copy.projects[1].items[0].parentIds).toEqual([copy.projects[0].items[0].id]);
  });

  it("rejects unsupported and malformed files", () => {
    expect(parseWorkspaceJson("not-json").error).toMatch(/Not valid JSON/);
    expect(parseWorkspaceJson(JSON.stringify({kind: "chisel-workspace", version: 3, workspace: {}})).error).toMatch(/not supported/);
  });
});
