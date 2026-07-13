import {authenticateUserId, type ApiResponse} from "./_auth.js";
import {dispatchPendingRuns} from "./_automationQueue.js";
import {ensureSchema} from "./_db.js";
import {errorStatus, readJson, sendError, type BodyRequest} from "./_http.js";
import {insertTestRun, listRules, loadUserBoard} from "./_automation.js";
import {buildAutomationEmailPayload, stageLabel, type TaskStageTransition} from "../src/lib/automations.js";
import {newProject, newTask, normalizeAppState} from "../src/lib/store.js";

export default async function handler(req: BodyRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "POST") {
      res.setHeader("Allow", "POST");
      sendError(res, 405, "Method not allowed.");
      return;
    }
    const userId = await authenticateUserId(req);
    await ensureSchema();
    const body = await readJson(req) as {ruleId?: unknown} | null;
    const rule = (await listRules(userId)).find((candidate) => candidate.id === body?.ruleId);
    if (!rule) throw Object.assign(new Error("Automation not found."), {status: 404});
    const state = normalizeAppState(await loadUserBoard(userId));
    const workspace = state?.workspaces.find((candidate) => candidate.id === rule.workspaceId);
    if (!workspace) throw Object.assign(new Error("Workspace not found."), {status: 404});
    const project = workspace.projects.find((candidate) => candidate.id === rule.trigger.projectId) ?? workspace.projects[0] ?? newProject("Example project");
    const toStage = rule.trigger.toStage;
    const fromStage = rule.trigger.fromStage ?? (toStage === "queued" ? "active" : "queued");
    const task = {...newTask(toStage), title: "Example task", description: `This is a test of the ${stageLabel(toStage)} automation.`};
    const transition: TaskStageTransition = {workspace, project, task, fromStage, toStage};
    const run = await insertTestRun(userId, rule, buildAutomationEmailPayload(rule, transition, true));
    await dispatchPendingRuns(userId);
    res.status(202).json({run});
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) console.error(error);
    sendError(res, status, status >= 500 ? "The test email could not be queued." : (error as Error).message);
  }
}
