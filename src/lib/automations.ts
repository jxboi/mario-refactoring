import type {AppState, Workspace} from "./store";
import type {Project, Stage, Task} from "../types";
import {TASK_STAGES} from "../types";

export const AUTOMATION_PLACEHOLDERS = [
  "workspace.name",
  "project.title",
  "task.title",
  "task.description",
  "fromStage.label",
  "toStage.label",
] as const;

export type AutomationPlaceholder = (typeof AUTOMATION_PLACEHOLDERS)[number];

export interface TaskStageChangedTrigger {
  type: "task_stage_changed";
  projectId: string | null;
  fromStage: Stage | null;
  toStage: Stage;
}

export interface EmailAutomationAction {
  type: "email";
  to: string;
  subjectTemplate: string;
  messageTemplate: string;
}

export type AutomationAction = EmailAutomationAction;

export interface AutomationRule {
  id: string;
  workspaceId: string;
  name: string;
  enabled: boolean;
  trigger: TaskStageChangedTrigger;
  action: AutomationAction;
  createdAt: string;
  updatedAt: string;
}

export type AutomationRuleInput = Pick<AutomationRule, "workspaceId" | "name" | "enabled" | "trigger" | "action">;
export type AutomationRunStatus = "pending" | "queued" | "retrying" | "sent" | "failed";

export interface AutomationEmailPayload {
  to: string;
  subject: string;
  message: string;
  workspaceName: string;
  projectTitle: string;
  taskTitle: string;
  taskDescription: string;
  fromStageLabel: string;
  toStageLabel: string;
  test: boolean;
}

export interface AutomationRun {
  id: string;
  workspaceId: string;
  ruleId: string;
  eventKey: string;
  status: AutomationRunStatus;
  payload: AutomationEmailPayload;
  attempts: number;
  providerMessageId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
  sentAt: string | null;
}

export interface TaskStageTransition {
  workspace: Workspace;
  project: Project;
  task: Task;
  fromStage: Stage;
  toStage: Stage;
}

export const DEFAULT_AUTOMATION_SUBJECT = "{{task.title}} moved to {{toStage.label}}";
export const DEFAULT_AUTOMATION_MESSAGE = "{{task.title}} moved from {{fromStage.label}} to {{toStage.label}} in {{project.title}}.";

const STAGES = new Set<Stage>(TASK_STAGES.map((stage) => stage.id));
const PLACEHOLDERS = new Set<string>(AUTOMATION_PLACEHOLDERS);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function stageLabel(stage: Stage): string {
  return TASK_STAGES.find((candidate) => candidate.id === stage)?.label ?? stage;
}

export function findTaskStageTransitions(previous: AppState, next: AppState): TaskStageTransition[] {
  const transitions: TaskStageTransition[] = [];
  for (const nextWorkspace of next.workspaces) {
    const previousWorkspace = previous.workspaces.find((workspace) => workspace.id === nextWorkspace.id);
    if (!previousWorkspace) continue;
    for (const nextProject of nextWorkspace.projects) {
      const previousProject = previousWorkspace.projects.find((project) => project.id === nextProject.id);
      if (!previousProject) continue;
      for (const nextTask of nextProject.tasks) {
        const previousTask = previousProject.tasks.find((task) => task.id === nextTask.id);
        if (!previousTask || previousTask.stage === nextTask.stage) continue;
        transitions.push({workspace: nextWorkspace, project: nextProject, task: nextTask, fromStage: previousTask.stage, toStage: nextTask.stage});
      }
    }
  }
  return transitions;
}

export function ruleMatchesTransition(rule: AutomationRule, transition: TaskStageTransition): boolean {
  return rule.enabled
    && rule.workspaceId === transition.workspace.id
    && rule.trigger.type === "task_stage_changed"
    && rule.trigger.toStage === transition.toStage
    && (rule.trigger.fromStage === null || rule.trigger.fromStage === transition.fromStage)
    && (rule.trigger.projectId === null || rule.trigger.projectId === transition.project.id);
}

export function renderAutomationTemplate(template: string, values: Record<AutomationPlaceholder, string>): string {
  return template.replace(/{{\s*([^{}]+?)\s*}}/g, (_match, key: string) => values[key.trim() as AutomationPlaceholder] ?? "");
}

export function automationTemplateValues(transition: TaskStageTransition): Record<AutomationPlaceholder, string> {
  return {
    "workspace.name": transition.workspace.name,
    "project.title": transition.project.title || "Untitled project",
    "task.title": transition.task.title || "Untitled task",
    "task.description": transition.task.description,
    "fromStage.label": stageLabel(transition.fromStage),
    "toStage.label": stageLabel(transition.toStage),
  };
}

export function buildAutomationEmailPayload(rule: AutomationRule, transition: TaskStageTransition, test = false): AutomationEmailPayload {
  const values = automationTemplateValues(transition);
  const subject = renderAutomationTemplate(rule.action.subjectTemplate, values);
  return {
    to: rule.action.to,
    subject: test ? `[Test] ${subject}` : subject,
    message: renderAutomationTemplate(rule.action.messageTemplate, values),
    workspaceName: values["workspace.name"],
    projectTitle: values["project.title"],
    taskTitle: values["task.title"],
    taskDescription: values["task.description"],
    fromStageLabel: values["fromStage.label"],
    toStageLabel: values["toStage.label"],
    test,
  };
}

function invalidPlaceholder(template: string): string | null {
  for (const match of template.matchAll(/{{\s*([^{}]+?)\s*}}/g)) {
    const key = match[1].trim();
    if (!PLACEHOLDERS.has(key)) return key;
  }
  return null;
}

export function validateAutomationRuleInput(value: unknown, state: AppState): AutomationRuleInput {
  if (!value || typeof value !== "object") throw new Error("Automation details are required.");
  const input = value as Partial<AutomationRuleInput>;
  const workspace = typeof input.workspaceId === "string" ? state.workspaces.find((candidate) => candidate.id === input.workspaceId) : undefined;
  if (!workspace) throw new Error("Workspace not found.");
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 80) throw new Error("Rule name must be between 1 and 80 characters.");
  const trigger = input.trigger;
  if (!trigger || trigger.type !== "task_stage_changed" || !STAGES.has(trigger.toStage)) throw new Error("Choose a valid destination stage.");
  if (trigger.fromStage !== null && !STAGES.has(trigger.fromStage)) throw new Error("Choose a valid source stage.");
  if (trigger.fromStage === trigger.toStage) throw new Error("Source and destination stages must differ.");
  if (trigger.projectId !== null && !workspace.projects.some((project) => project.id === trigger.projectId)) throw new Error("Project not found in this workspace.");
  const action = input.action;
  if (!action || action.type !== "email") throw new Error("Choose a supported action.");
  const to = typeof action.to === "string" ? action.to.trim() : "";
  if (to.length > 320 || !EMAIL.test(to)) throw new Error("Enter a valid recipient email address.");
  const subjectTemplate = typeof action.subjectTemplate === "string" ? action.subjectTemplate.trim() : "";
  const messageTemplate = typeof action.messageTemplate === "string" ? action.messageTemplate.trim() : "";
  if (!subjectTemplate || subjectTemplate.length > 200) throw new Error("Subject must be between 1 and 200 characters.");
  if (!messageTemplate || messageTemplate.length > 5000) throw new Error("Message must be between 1 and 5,000 characters.");
  const unknown = invalidPlaceholder(`${subjectTemplate}\n${messageTemplate}`);
  if (unknown) throw new Error(`Unknown placeholder: {{${unknown}}}.`);
  return {
    workspaceId: workspace.id,
    name,
    enabled: input.enabled !== false,
    trigger: {type: "task_stage_changed", projectId: trigger.projectId, fromStage: trigger.fromStage, toStage: trigger.toStage},
    action: {type: "email", to, subjectTemplate, messageTemplate},
  };
}
