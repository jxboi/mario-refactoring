import {randomUUID} from "node:crypto";
import type {AutomationEmailPayload, AutomationRule, AutomationRun, AutomationRunStatus} from "../src/lib/automations.js";
import {getQuery} from "./_db.js";

export interface AutomationRuleRow {
  id: string;
  workspace_id: string;
  name: string;
  enabled: boolean;
  trigger: AutomationRule["trigger"];
  action: AutomationRule["action"];
  created_at: string | Date;
  updated_at: string | Date;
}

export interface AutomationRunRow {
  id: string;
  workspace_id: string;
  rule_id: string;
  event_key: string;
  status: AutomationRunStatus;
  payload: AutomationEmailPayload;
  attempts: number;
  provider_message_id: string | null;
  last_error: string | null;
  created_at: string | Date;
  updated_at: string | Date;
  sent_at: string | Date | null;
}

const iso = (value: string | Date) => value instanceof Date ? value.toISOString() : String(value);

export function ruleFromRow(row: AutomationRuleRow): AutomationRule {
  return {id: row.id, workspaceId: row.workspace_id, name: row.name, enabled: row.enabled, trigger: row.trigger, action: row.action, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)};
}

export function runFromRow(row: AutomationRunRow): AutomationRun {
  return {id: row.id, workspaceId: row.workspace_id, ruleId: row.rule_id, eventKey: row.event_key, status: row.status, payload: row.payload, attempts: Number(row.attempts) || 0, providerMessageId: row.provider_message_id, lastError: row.last_error, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at), sentAt: row.sent_at ? iso(row.sent_at) : null};
}

export function newRunId(): string {
  return randomUUID();
}

export async function loadUserBoard(userId: string): Promise<unknown | null> {
  const rows = await getQuery()`select state from boards where user_id = ${userId} limit 1` as {state: unknown}[];
  return rows[0]?.state ?? null;
}

export async function listRules(userId: string, workspaceId?: string): Promise<AutomationRule[]> {
  const sql = getQuery();
  const rows = workspaceId
    ? await sql`select id, workspace_id, name, enabled, trigger, action, created_at, updated_at from automation_rules where user_id = ${userId} and workspace_id = ${workspaceId} order by created_at`
    : await sql`select id, workspace_id, name, enabled, trigger, action, created_at, updated_at from automation_rules where user_id = ${userId} order by created_at`;
  return (rows as AutomationRuleRow[]).map(ruleFromRow);
}

export async function listRuns(userId: string, workspaceId: string, ruleId: string): Promise<AutomationRun[]> {
  const rows = await getQuery()`
    select id, workspace_id, rule_id, event_key, status, payload, attempts, provider_message_id, last_error, created_at, updated_at, sent_at
    from automation_runs
    where user_id = ${userId} and workspace_id = ${workspaceId} and rule_id = ${ruleId}
    order by created_at desc limit 20
  ` as AutomationRunRow[];
  return rows.map(runFromRow);
}

export async function insertTestRun(userId: string, rule: AutomationRule, payload: AutomationEmailPayload): Promise<AutomationRun> {
  const id = newRunId();
  const eventKey = `test:${id}`;
  const rows = await getQuery()`
    insert into automation_runs (id, user_id, workspace_id, rule_id, event_key, status, payload)
    values (${id}, ${userId}, ${rule.workspaceId}, ${rule.id}, ${eventKey}, 'pending', ${JSON.stringify(payload)}::jsonb)
    returning id, workspace_id, rule_id, event_key, status, payload, attempts, provider_message_id, last_error, created_at, updated_at, sent_at
  ` as AutomationRunRow[];
  return runFromRow(rows[0]);
}
