import {describe, expect, it} from "vitest";
import {newProject, newTask} from "../../src/lib/store.js";
import {TASK_CATEGORIES} from "../../src/types.js";
import {AI_SUMMARY_PREFIX, buildProjectSummaryPrompt, formatProjectSummary} from "../../api/_projectSummary.js";

function promptData(prompt: string) {
  return JSON.parse(prompt.slice(prompt.indexOf("{")).trim());
}

describe("project summary prompt", () => {
  it("includes project context, task aggregates, labels, assignments, and human notes", () => {
    const task = {...newTask("in-progress"), title: "Ship checkout", category: "feature", assignee: {userId: "github:1", login: "octocat", name: "Mona", avatarUrl: ""}, notes: [{id: "task-note", text: "Waiting for QA", createdAt: 2}]};
    const project = {...newProject("Launch"), description: "Release the new checkout", stage: "review" as const, notes: [{id: "human", text: "Target customers confirmed", createdAt: 2}, {id: "ai", text: `${AI_SUMMARY_PREFIX}\n\nOld result`, createdAt: 3}], tasks: [task]};
    const result = buildProjectSummaryPrompt(project, TASK_CATEGORIES);
    const data = promptData(result.prompt);

    expect(data.project).toMatchObject({title: "Launch", status: "Ready", humanAuthoredNotes: ["Target customers confirmed"]});
    expect(data.taskCounts).toMatchObject({total: 1, byStatus: {"In progress": 1}});
    expect(data.taskDetails[0]).toMatchObject({title: "Ship checkout", status: "In progress", category: "Feature", assignee: "Mona", humanAuthoredNotes: ["Waiting for QA"]});
    expect(result).toMatchObject({includedTaskDetails: 1, omittedTaskDetails: 0});
  });

  it("handles an empty project without inventing tasks", () => {
    const result = buildProjectSummaryPrompt(newProject("Empty"), TASK_CATEGORIES);
    const data = promptData(result.prompt);
    expect(data.taskCounts.total).toBe(0);
    expect(data.taskDetails).toEqual([]);
    expect(result.omittedTaskDetails).toBe(0);
  });

  it("bounds large project details while keeping complete aggregate counts", () => {
    const tasks = Array.from({length: 120}, (_, index) => ({...newTask(index % 2 ? "in-progress" : "done"), title: `Task ${index}`, description: "x".repeat(1_500), updatedAt: index + 1}));
    const result = buildProjectSummaryPrompt({...newProject("Large"), tasks}, TASK_CATEGORIES);
    const data = promptData(result.prompt);
    expect(result.includedTaskDetails).toBeLessThan(tasks.length);
    expect(result.omittedTaskDetails).toBe(tasks.length - result.includedTaskDetails);
    expect(data.taskCounts.total).toBe(tasks.length);
    expect(data.taskCounts.byStatus).toMatchObject({"In progress": 60, Done: 60});
  });

  it("adds one stable note heading and rejects empty output", () => {
    expect(formatProjectSummary(`${AI_SUMMARY_PREFIX}\nOverview\nA launch.`)).toBe(`${AI_SUMMARY_PREFIX}\n\nOverview\nA launch.`);
    expect(() => formatProjectSummary("  ")).toThrow("empty summary");
  });
});
