import {generateText} from "ai";
import {authenticateUserId, type ApiResponse} from "./_auth.js";
import {loadUserBoard} from "./_automation.js";
import {mergeCollaborations} from "./_collaboration.js";
import {ensureSchema, getQuery} from "./_db.js";
import {errorStatus, readJson, sendError, type BodyRequest} from "./_http.js";
import {buildProjectSummaryPrompt, formatProjectSummary, PROJECT_SUMMARY_INSTRUCTIONS} from "./_projectSummary.js";
import {normalizeAppState, type AppState} from "../src/lib/store.js";
import type {CategoryDef, Project} from "../src/types.js";

const DEFAULT_MODEL = "openai/gpt-5.6-luna";

interface SummaryDependencies {
  authenticate: (req: BodyRequest) => Promise<string>;
  loadState: (userId: string) => Promise<AppState | null>;
  generate: (project: Project, categories: CategoryDef[]) => Promise<string>;
}

const productionDependencies: SummaryDependencies = {
  authenticate: authenticateUserId,
  loadState: async (userId) => {
    await ensureSchema();
    const state = normalizeAppState(await loadUserBoard(userId));
    return mergeCollaborations(getQuery(), userId, state);
  },
  generate: async (project, categories) => {
    const {prompt} = buildProjectSummaryPrompt(project, categories);
    const result = await generateText({
      model: process.env.AI_SUMMARY_MODEL?.trim() || DEFAULT_MODEL,
      instructions: PROJECT_SUMMARY_INSTRUCTIONS,
      prompt,
      maxOutputTokens: 900,
      timeout: {totalMs: 30_000},
    });
    return formatProjectSummary(result.text);
  },
};

function requiredId(value: unknown): string {
  return typeof value === "string" && value.trim() && value.length <= 200 ? value : "";
}

export function createProjectSummaryHandler(dependencies: SummaryDependencies = productionDependencies) {
  return async function handler(req: BodyRequest, res: ApiResponse) {
    res.setHeader("Cache-Control", "no-store");
    try {
      if (req.method !== "POST") {
        res.setHeader("Allow", "POST");
        sendError(res, 405, "Method not allowed.");
        return;
      }
      const userId = await dependencies.authenticate(req);
      let body: {workspaceId?: unknown; projectId?: unknown} | null;
      try {
        body = await readJson(req) as typeof body;
      } catch {
        throw Object.assign(new Error("Request body must be valid JSON."), {status: 400});
      }
      const workspaceId = requiredId(body?.workspaceId), projectId = requiredId(body?.projectId);
      if (!workspaceId || !projectId) throw Object.assign(new Error("workspaceId and projectId are required."), {status: 400});
      const state = await dependencies.loadState(userId);
      const workspace = state?.workspaces.find((candidate) => candidate.id === workspaceId);
      const project = workspace?.projects.find((candidate) => candidate.id === projectId);
      if (!workspace || !project) throw Object.assign(new Error("Project not found."), {status: 404});
      let summary: string;
      try {
        summary = await dependencies.generate(project, workspace.categories);
      } catch (error) {
        console.error("Project summary generation failed.", error);
        throw Object.assign(new Error("AI summary service is unavailable."), {status: 502});
      }
      if (!summary.trim()) throw Object.assign(new Error("AI summary service is unavailable."), {status: 502});
      res.status(200).json({summary});
    } catch (error) {
      const status = errorStatus(error);
      if (status >= 500 && status !== 502) console.error(error);
      sendError(res, status, status >= 500 ? "AI summary service is unavailable." : (error as Error).message);
    }
  };
}

export default createProjectSummaryHandler();
