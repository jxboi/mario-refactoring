import {authenticateUserId, type ApiResponse} from "./_auth.js";
import {listRules, newRunId} from "./_automation.js";
import {dispatchPendingRuns} from "./_automationQueue.js";
import {ensureSchema, getQuery} from "./_db.js";
import {errorStatus, readJson, sendError, type BodyRequest} from "./_http.js";
import {buildAutomationEmailPayload, findTaskStageTransitions, ruleMatchesTransition} from "../src/lib/automations.js";
import {normalizeAppState, type AppState} from "../src/lib/store.js";

interface BoardRow {
  state: unknown;
  version: number;
  updated_at: string | Date;
  run_ids?: string[];
}

interface PendingRunInput {
  id: string;
  workspace_id: string;
  rule_id: string;
  event_key: string;
  payload: ReturnType<typeof buildAutomationEmailPayload>;
}

function snapshot(row: BoardRow | undefined) {
  return row
    ? {state: row.state, version: Number(row.version) || 0, updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at)}
    : {state: null, version: 0, updatedAt: null};
}

function pendingRuns(userId: string, previous: AppState, next: AppState, nextVersion: number, rules: Awaited<ReturnType<typeof listRules>>): PendingRunInput[] {
  const runs: PendingRunInput[] = [];
  for (const transition of findTaskStageTransitions(previous, next)) {
    const eventKey = `${userId}:${nextVersion}:${transition.workspace.id}:${transition.project.id}:${transition.task.id}:${transition.fromStage}:${transition.toStage}`;
    for (const rule of rules) {
      if (!ruleMatchesTransition(rule, transition)) continue;
      runs.push({id: newRunId(), workspace_id: transition.workspace.id, rule_id: rule.id, event_key: eventKey, payload: buildAutomationEmailPayload(rule, transition)});
    }
  }
  return runs;
}

export default async function handler(req: BodyRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    if (req.method !== "GET" && req.method !== "PUT") {
      res.setHeader("Allow", "GET, PUT");
      sendError(res, 405, "Method not allowed.");
      return;
    }
    const userId = await authenticateUserId(req);
    await ensureSchema();
    const sql = getQuery();
    if (req.method === "GET") {
      const rows = await sql`select state, version, updated_at from boards where user_id = ${userId} limit 1` as BoardRow[];
      void dispatchPendingRuns(userId);
      res.status(200).json(snapshot(rows[0]));
      return;
    }

    const body = await readJson(req) as {state?: unknown; baseVersion?: unknown} | null;
    const nextState = normalizeAppState(body?.state);
    if (!nextState) {
      sendError(res, 400, "Missing or invalid board state.");
      return;
    }
    const baseVersion = typeof body?.baseVersion === "number" && Number.isInteger(body.baseVersion) ? body.baseVersion : 0;
    const stateJson = JSON.stringify(nextState);
    if (baseVersion === 0) {
      const inserted = await sql`
        insert into boards (user_id, state, version, updated_at)
        values (${userId}, ${stateJson}::jsonb, 1, now())
        on conflict (user_id) do nothing
        returning state, version, updated_at
      ` as BoardRow[];
      if (inserted.length) {
        res.status(200).json(snapshot(inserted[0]));
        return;
      }
    } else {
      const currentRows = await sql`select state, version, updated_at from boards where user_id = ${userId} and version = ${baseVersion} limit 1` as BoardRow[];
      const previousState = normalizeAppState(currentRows[0]?.state);
      if (previousState) {
        const runs = pendingRuns(userId, previousState, nextState, baseVersion + 1, await listRules(userId));
        const runJson = JSON.stringify(runs);
        const updated = await sql`
          with updated_board as (
            update boards
            set state = ${stateJson}::jsonb, version = version + 1, updated_at = now()
            where user_id = ${userId} and version = ${baseVersion}
            returning state, version, updated_at
          ), run_input as (
            select * from jsonb_to_recordset(${runJson}::jsonb)
            as x(id text, workspace_id text, rule_id text, event_key text, payload jsonb)
          ), inserted_runs as (
            insert into automation_runs (id, user_id, workspace_id, rule_id, event_key, status, payload)
            select input.id, ${userId}, input.workspace_id, input.rule_id, input.event_key, 'pending', input.payload
            from run_input input cross join updated_board
            on conflict (user_id, rule_id, event_key) do nothing
            returning id
          )
          select board.state, board.version, board.updated_at,
            coalesce((select json_agg(id) from inserted_runs), '[]'::json) as run_ids
          from updated_board board
        ` as BoardRow[];
        if (updated.length) {
          await dispatchPendingRuns(userId);
          res.status(200).json(snapshot(updated[0]));
          return;
        }
      }
    }
    const rows = await sql`select state, version, updated_at from boards where user_id = ${userId} limit 1` as BoardRow[];
    res.status(409).json({error: "Board changed in another session.", remote: snapshot(rows[0])});
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) console.error(error);
    sendError(res, status, status >= 500 ? "Board storage is unavailable." : (error as Error).message);
  }
}
