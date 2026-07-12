import {randomUUID} from "node:crypto";
import {authenticateUserId, queryValue, type ApiResponse} from "./_auth.js";
import {ruleFromRow, type AutomationRuleRow, loadUserBoard} from "./_automation.js";
import {dispatchPendingRuns} from "./_automationQueue.js";
import {ensureSchema, getQuery} from "./_db.js";
import {errorStatus, readJson, sendError, type BodyRequest} from "./_http.js";
import {validateAutomationRuleInput} from "../src/lib/automations.js";
import {normalizeAppState} from "../src/lib/store.js";

export default async function handler(req: BodyRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (!req.method || !["GET", "POST", "PUT", "DELETE"].includes(req.method)) {
      res.setHeader("Allow", "GET, POST, PUT, DELETE");
      sendError(res, 405, "Method not allowed.");
      return;
    }
    const userId = await authenticateUserId(req);
    await ensureSchema();
    const state = normalizeAppState(await loadUserBoard(userId));
    if (!state) throw Object.assign(new Error("Create and sync a workspace before adding automations."), {status: 409});
    const sql = getQuery();

    if (req.method === "GET") {
      const workspaceId = queryValue(req.query, "workspaceId");
      if (!state.workspaces.some((workspace) => workspace.id === workspaceId)) throw Object.assign(new Error("Workspace not found."), {status: 404});
      void dispatchPendingRuns(userId);
      const rows = await sql`select id, workspace_id, name, enabled, trigger, action, created_at, updated_at from automation_rules where user_id = ${userId} and workspace_id = ${workspaceId} order by created_at` as AutomationRuleRow[];
      res.status(200).json({rules: rows.map(ruleFromRow)});
      return;
    }

    if (req.method === "DELETE") {
      const id = queryValue(req.query, "id");
      const rows = await sql`delete from automation_rules where id = ${id} and user_id = ${userId} returning id` as {id: string}[];
      if (!rows.length) throw Object.assign(new Error("Automation not found."), {status: 404});
      res.status(200).json({deleted: id});
      return;
    }

    const body = await readJson(req) as Record<string, unknown> | null;
    const input = validateAutomationRuleInput(body, state);
    if (req.method === "POST") {
      const id = randomUUID();
      const rows = await sql`
        insert into automation_rules (id, user_id, workspace_id, name, enabled, trigger, action)
        values (${id}, ${userId}, ${input.workspaceId}, ${input.name}, ${input.enabled}, ${JSON.stringify(input.trigger)}::jsonb, ${JSON.stringify(input.action)}::jsonb)
        returning id, workspace_id, name, enabled, trigger, action, created_at, updated_at
      ` as AutomationRuleRow[];
      res.status(201).json({rule: ruleFromRow(rows[0])});
      return;
    }

    const id = typeof body?.id === "string" ? body.id : "";
    const rows = await sql`
      update automation_rules set workspace_id = ${input.workspaceId}, name = ${input.name}, enabled = ${input.enabled}, trigger = ${JSON.stringify(input.trigger)}::jsonb, action = ${JSON.stringify(input.action)}::jsonb, updated_at = now()
      where id = ${id} and user_id = ${userId}
      returning id, workspace_id, name, enabled, trigger, action, created_at, updated_at
    ` as AutomationRuleRow[];
    if (!rows.length) throw Object.assign(new Error("Automation not found."), {status: 404});
    res.status(200).json({rule: ruleFromRow(rows[0])});
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) console.error(error);
    sendError(res, status, status >= 500 ? "Automation storage is unavailable." : (error as Error).message);
  }
}
