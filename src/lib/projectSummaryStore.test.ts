import {describe, expect, it} from "vitest";
import {newProject, newWorkspace, reducer, type AppState} from "./store";

describe("AI project summary notes", () => {
  it("persists a multiline generated summary as a neutral project note", () => {
    const project = newProject("Launch");
    const workspace = {...newWorkspace("Product"), projects: [project]};
    const initial: AppState = {workspaces: [workspace], activeWorkspaceId: workspace.id};
    const text = "AI project summary\n\nOverview\nReady to launch.\n\nProgress\n• Three tasks done.";
    const next = reducer(initial, {type: "note-add", entity: "project", projectId: project.id, text});
    expect(next.workspaces[0].projects[0].notes).toHaveLength(1);
    expect(next.workspaces[0].projects[0].notes[0]).toMatchObject({text, color: "neutral"});
  });
});
