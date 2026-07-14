import {authenticateUser, type ApiResponse} from "./_auth.js";
import {CollaborationConflict, mergeCollaborations, prepareCollaborativeSave, upsertUserProfile} from "./_collaboration.js";
import {listRules, newRunId} from "./_automation.js";
import {dispatchPendingRuns} from "./_automationQueue.js";
import {ensureSchema, getQuery} from "./_db.js";
import {errorStatus, readJson, sendError, type BodyRequest} from "./_http.js";
import {buildAutomationEmailPayload, findTaskStageTransitions, ruleMatchesTransition} from "../src/lib/automations.js";
import {normalizeAppState, type AppState} from "../src/lib/store.js";
import {activitySearchText, deriveActivityEvents} from "../src/lib/activity.js";
import {findReminderCancellations} from "../src/lib/reminders.js";

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
    const {userId, user} = await authenticateUser(req);
    await ensureSchema();
    const sql = getQuery();
    await upsertUserProfile(sql, userId, user);
    if (req.method === "GET") {
      const rows = await sql`select state, version, updated_at from boards where user_id = ${userId} limit 1` as BoardRow[];
      void dispatchPendingRuns(userId);
      const base = normalizeAppState(rows[0]?.state);
      const merged = await mergeCollaborations(sql, userId, base);
      res.status(200).json({...snapshot(rows[0]), state:merged});
      return;
    }

    const body = await readJson(req) as {state?: unknown; baseVersion?: unknown} | null;
    const requestedState = normalizeAppState(body?.state);
    if (!requestedState) {
      sendError(res, 400, "Missing or invalid board state.");
      return;
    }
    const collaborationBaseRows = await sql`select state, version, updated_at from boards where user_id=${userId} limit 1` as BoardRow[];
    const collaborationPrevious = await mergeCollaborations(sql, userId, normalizeAppState(collaborationBaseRows[0]?.state));
    let nextState: AppState;
    try {
      nextState = await prepareCollaborativeSave(sql, userId, requestedState);
    } catch (error) {
      if (error instanceof CollaborationConflict) {
        const rows = await sql`select state, version, updated_at from boards where user_id=${userId} limit 1` as BoardRow[];
        const remote = await mergeCollaborations(sql, userId, normalizeAppState(rows[0]?.state));
        res.status(409).json({error:error.message, remote:{...snapshot(rows[0]), state:remote}});
        return;
      }
      throw error;
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
        const merged = await mergeCollaborations(sql, userId, normalizeAppState(inserted[0].state));
        res.status(200).json({...snapshot(inserted[0]), state:merged});
        return;
      }
    } else {
      const currentRows = await sql`select state, version, updated_at from boards where user_id = ${userId} and version = ${baseVersion} limit 1` as BoardRow[];
      const previousState = Number(collaborationBaseRows[0]?.version) === baseVersion ? collaborationPrevious : normalizeAppState(currentRows[0]?.state);
      if (previousState) {
        const runs = pendingRuns(userId, previousState, requestedState, baseVersion + 1, await listRules(userId));
        const runJson = JSON.stringify(runs);
        const activity = deriveActivityEvents(previousState, requestedState).map((item, eventIndex) => ({id: item.id, workspace_id: item.workspaceId, project_id: item.projectId, family: item.family, entity_type: item.entityType, entity_id: item.entityId, search_text: activitySearchText(item), event: item, event_index: eventIndex}));
        const activityJson = JSON.stringify(activity);
        const removedJson = JSON.stringify(previousState.workspaces.filter(workspace => !requestedState.workspaces.some(next => next.id === workspace.id)).map(workspace => ({workspace_id: workspace.id})));
        const reminderCancellationJson = JSON.stringify(findReminderCancellations(previousState, requestedState).map(item => ({workspace_id:item.workspaceId, project_id:item.projectId, task_id:item.taskId, share_id:item.shareId})));
        const updated = await sql`
          with updated_board as (
            update boards
            set state = ${stateJson}::jsonb, version = version + 1, updated_at = now()
            where user_id = ${userId} and version = ${baseVersion}
            returning state, version, updated_at
          ), run_input as (
            select * from jsonb_to_recordset(${runJson}::jsonb)
            as x(id text, workspace_id text, rule_id text, event_key text, payload jsonb)
          ), activity_input as (
            select * from jsonb_to_recordset(${activityJson}::jsonb)
            as x(id text, workspace_id text, project_id text, family text, entity_type text, entity_id text, search_text text, event jsonb, event_index integer)
          ), removed_workspace_input as (
            select * from jsonb_to_recordset(${removedJson}::jsonb) as x(workspace_id text)
          ), reminder_cancellation_input as (
            select * from jsonb_to_recordset(${reminderCancellationJson}::jsonb) as x(workspace_id text, project_id text, task_id text, share_id text)
          ), inserted_runs as (
            insert into automation_runs (id, user_id, workspace_id, rule_id, event_key, status, payload)
            select input.id, ${userId}, input.workspace_id, input.rule_id, input.event_key, 'pending', input.payload
            from run_input input cross join updated_board
            on conflict (user_id, rule_id, event_key) do nothing
            returning id
          ), inserted_activity as (
            insert into activity_events (id, user_id, workspace_id, project_id, family, entity_type, entity_id, search_text, event, board_version, event_index, occurred_at)
            select input.id, ${userId}, input.workspace_id, input.project_id, input.family, input.entity_type, input.entity_id, input.search_text, input.event, ${baseVersion + 1}, input.event_index, now()
            from activity_input input cross join updated_board
            on conflict (user_id, board_version, event_index) do nothing
            returning id
          ), deleted_activity as (
            delete from activity_events history using removed_workspace_input removed, updated_board
            where history.user_id = ${userId} and history.workspace_id = removed.workspace_id
            returning history.id
          ), cancelled_reminders as (
            update task_reminders reminder set status='cancelled',cancelled_at=now(),updated_at=now()
            from reminder_cancellation_input input,updated_board
            where reminder.status in ('scheduled','queued') and reminder.project_id=input.project_id and reminder.task_id=input.task_id
              and ((input.share_id is not null and reminder.share_id=input.share_id)
                or (input.share_id is null and reminder.user_id=${userId} and reminder.workspace_id=input.workspace_id))
            returning reminder.id
          )
          select board.state, board.version, board.updated_at,
            coalesce((select json_agg(id) from inserted_runs), '[]'::json) as run_ids,
            (select count(*) from cancelled_reminders) as cancelled_reminder_count
          from updated_board board
        ` as BoardRow[];
        if (updated.length) {
          await dispatchPendingRuns(userId);
          const merged = await mergeCollaborations(sql, userId, normalizeAppState(updated[0].state));
          res.status(200).json({...snapshot(updated[0]), state:merged});
          return;
        }
      }
    }
    const rows = await sql`select state, version, updated_at from boards where user_id = ${userId} limit 1` as BoardRow[];
    const remote = await mergeCollaborations(sql, userId, normalizeAppState(rows[0]?.state));
    res.status(409).json({error: "Board changed in another session.", remote: {...snapshot(rows[0]), state:remote}});
  } catch (error) {
    const status = errorStatus(error);
    if (status >= 500) console.error(error);
    sendError(res, status, status >= 500 ? "Board storage is unavailable." : (error as Error).message);
  }
}
