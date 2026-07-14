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
      tx`create table if not exists activity_events (
        id text primary key,
        user_id text not null,
        workspace_id text not null,
        project_id text,
        family text not null check (family in ('status','updates','notes','organization')),
        entity_type text not null,
        entity_id text not null,
        search_text text not null,
        event jsonb not null,
        board_version integer not null,
        event_index integer not null,
        occurred_at timestamptz not null default now(),
        unique(user_id, board_version, event_index)
      )`,
      tx`create index if not exists activity_events_scope on activity_events(user_id, workspace_id, occurred_at desc, id desc)`,
      tx`create index if not exists activity_events_project on activity_events(user_id, workspace_id, project_id, occurred_at desc, id desc)`,
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
      tx`create table if not exists task_reminders (
        id text primary key, user_id text not null, workspace_id text not null, project_id text not null, task_id text not null,
        share_id text, remind_at timestamptz not null, status text not null check (status in ('scheduled','queued','fired','cancelled')),
        queue_message_id text, last_error text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
        queued_at timestamptz, fired_at timestamptz, cancelled_at timestamptz
      )`,
      tx`create unique index if not exists task_reminders_active on task_reminders(user_id, workspace_id, project_id, task_id) where status in ('scheduled','queued')`,
      tx`create index if not exists task_reminders_dispatch on task_reminders(remind_at) where status = 'scheduled'`,
      tx`create index if not exists task_reminders_shared on task_reminders(share_id, project_id, task_id) where status in ('scheduled','queued')`,
      tx`create table if not exists task_alerts (
        id text primary key, reminder_id text not null unique, user_id text not null, workspace_id text not null, project_id text not null,
        task_id text not null, workspace_title text not null, project_title text not null, task_title text not null,
        triggered_at timestamptz not null default now(), read_at timestamptz
      )`,
      tx`create index if not exists task_alerts_feed on task_alerts(user_id, triggered_at desc, id desc)`,
      tx`create index if not exists task_alerts_unread on task_alerts(user_id, triggered_at desc) where read_at is null`,
      tx`create table if not exists user_profiles (
        user_id text primary key, login text not null, name text, avatar_url text not null default '', updated_at timestamptz not null default now()
      )`,
      tx`create unique index if not exists user_profiles_login on user_profiles(lower(login))`,
      tx`create table if not exists shared_projects (
        share_id text primary key, project_id text not null, owner_user_id text not null, source_workspace_id text not null,
        source_workspace_name text not null, project jsonb not null, categories jsonb not null, category_groups jsonb not null,
        version integer not null default 1, updated_at timestamptz not null default now(), unique(owner_user_id, project_id)
      )`,
      tx`create index if not exists shared_projects_owner on shared_projects(owner_user_id, source_workspace_id)`,
      tx`create table if not exists project_members (
        share_id text not null, user_id text not null, role text not null check (role in ('owner','editor')),
        joined_at timestamptz not null default now(), primary key(share_id, user_id)
      )`,
      tx`create index if not exists project_members_user on project_members(user_id, joined_at desc)`,
      tx`create table if not exists project_invitations (
        id text primary key, share_id text not null, inviter_user_id text not null, invitee_login text not null, invitee_user_id text,
        role text not null default 'editor' check (role = 'editor'), status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
        created_at timestamptz not null default now(), responded_at timestamptz
      )`,
      tx`create index if not exists project_invitations_invitee on project_invitations(lower(invitee_login), status, created_at desc)`,
      tx`create unique index if not exists project_invitations_pending on project_invitations(share_id, lower(invitee_login)) where status = 'pending'`,
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
