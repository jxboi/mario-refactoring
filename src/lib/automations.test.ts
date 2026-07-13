import {describe, expect, it} from "vitest";
import {newProject, newTask, newWorkspace, type AppState} from "./store";
import {
  buildAutomationEmailPayload,
  findTaskStageTransitions,
  renderAutomationTemplate,
  ruleMatchesTransition,
  validateAutomationRuleInput,
  type AutomationRule,
} from "./automations";

function states() {
  const task = {...newTask("queued"), id: "task", title: "Ship it", description: "Roll out carefully"};
  const project = {...newProject("Launch"), id: "project", tasks: [task]};
  const workspace = {...newWorkspace("Product"), id: "workspace", projects: [project]};
  const previous: AppState = {workspaces: [workspace], activeWorkspaceId: workspace.id};
  const next: AppState = {workspaces: [{...workspace, projects: [{...project, tasks: [{...task, stage: "deployed"}]}]}], activeWorkspaceId: workspace.id};
  return {previous, next};
}

function rule(patch: Partial<AutomationRule> = {}): AutomationRule {
  return {
    id: "rule",
    workspaceId: "workspace",
    name: "Done email",
    enabled: true,
    trigger: {type: "task_stage_changed", projectId: null, fromStage: null, toStage: "deployed"},
    action: {type: "email", to: "owner@example.com", subjectTemplate: "{{task.title}} → {{toStage.label}}", messageTemplate: "{{workspace.name}} / {{project.title}}"},
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...patch,
  };
}

describe("task stage automations", () => {
  it("detects persisted task stage transitions", () => {
    const {previous, next} = states();
    expect(findTaskStageTransitions(previous, next)).toMatchObject([{fromStage: "queued", toStage: "deployed", task: {id: "task"}}]);
  });

  it("ignores reordering, task creation, and deletion", () => {
    const {previous} = states();
    const workspace = previous.workspaces[0];
    const project = workspace.projects[0];
    const reordered: AppState = {workspaces: [{...workspace, projects: [{...project, tasks: [...project.tasks].reverse()}]}], activeWorkspaceId: workspace.id};
    expect(findTaskStageTransitions(previous, reordered)).toEqual([]);
    expect(findTaskStageTransitions({workspaces: [{...workspace, projects: [{...project, tasks: []}]}], activeWorkspaceId: workspace.id}, previous)).toEqual([]);
    expect(findTaskStageTransitions(previous, {workspaces: [{...workspace, projects: [{...project, tasks: []}]}], activeWorkspaceId: workspace.id})).toEqual([]);
  });

  it("matches wildcard and exact project/source rules", () => {
    const transition = findTaskStageTransitions(states().previous, states().next)[0];
    expect(ruleMatchesTransition(rule(), transition)).toBe(true);
    expect(ruleMatchesTransition(rule({trigger: {...rule().trigger, projectId: "project", fromStage: "queued"}}), transition)).toBe(true);
    expect(ruleMatchesTransition(rule({trigger: {...rule().trigger, projectId: "other"}}), transition)).toBe(false);
    expect(ruleMatchesTransition(rule({enabled: false}), transition)).toBe(false);
  });

  it("renders an immutable email payload from the transition snapshot", () => {
    const transition = findTaskStageTransitions(states().previous, states().next)[0];
    const payload = buildAutomationEmailPayload(rule(), transition);
    expect(payload).toMatchObject({to: "owner@example.com", subject: "Ship it → Done", message: "Product / Launch", fromStageLabel: "To do", toStageLabel: "Done"});
    transition.task.title = "Changed later";
    expect(payload.subject).toBe("Ship it → Done");
  });

  it("validates stage references, recipient, lengths, and placeholders", () => {
    const {next} = states();
    const valid = rule();
    expect(validateAutomationRuleInput(valid, next)).toMatchObject({name: "Done email", action: {to: "owner@example.com"}});
    expect(() => validateAutomationRuleInput({...valid, action: {...valid.action, to: "bad"}}, next)).toThrow("valid recipient");
    expect(() => validateAutomationRuleInput({...valid, action: {...valid.action, subjectTemplate: "{{unknown}}"}}, next)).toThrow("Unknown placeholder");
    expect(() => validateAutomationRuleInput({...valid, trigger: {...valid.trigger, fromStage: "deployed"}}, next)).toThrow("must differ");
  });

  it("replaces supported placeholders without interpreting text as HTML", () => {
    expect(renderAutomationTemplate("Hello {{task.title}}", {
      "workspace.name": "W", "project.title": "P", "task.title": "<b>Task</b>", "task.description": "", "fromStage.label": "To do", "toStage.label": "Done",
    })).toBe("Hello <b>Task</b>");
  });
});
