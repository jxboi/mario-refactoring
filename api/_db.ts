import {neon} from "@neondatabase/serverless";

let query: ReturnType<typeof neon> | null = null;
let schemaReady: Promise<void> | null = null;

export function getQuery() {
  if (!query) {
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!connectionString) throw new Error("POSTGRES_URL or DATABASE_URL is required.");
    query = neon(connectionString);
  }
  return query;
}

export function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    const sql = getQuery();
    schemaReady = sql.transaction((tx) => [
      tx`create table if not exists boards (
        user_id text primary key,
        state jsonb not null,
        version integer not null default 1,
        updated_at timestamptz not null default now()
      )`,
      tx`create table if not exists automation_rules (
        id text primary key,
        user_id text not null,
        workspace_id text not null,
        name text not null,
        enabled boolean not null default true,
        trigger jsonb not null,
        action jsonb not null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      )`,
      tx`create index if not exists automation_rules_owner_workspace on automation_rules(user_id, workspace_id, updated_at desc)`,
      tx`create table if not exists automation_runs (
        id text primary key,
        user_id text not null,
        workspace_id text not null,
        rule_id text not null,
        event_key text not null,
        status text not null check (status in ('pending','queued','retrying','sent','failed')),
        payload jsonb not null,
        attempts integer not null default 0,
        queue_message_id text,
        provider_message_id text,
        last_error text,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        sent_at timestamptz,
        unique(user_id, rule_id, event_key)
      )`,
      tx`create index if not exists automation_runs_history on automation_runs(user_id, workspace_id, rule_id, created_at desc)`,
      tx`create index if not exists automation_runs_pending on automation_runs(status, created_at) where status = 'pending'`,
    ]).then(() => undefined).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }
  return schemaReady;
}

export function resetDbForTests() {
  query = null;
  schemaReady = null;
}
