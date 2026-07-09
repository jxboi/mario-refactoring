create table if not exists boards (
  user_id text primary key,
  state jsonb not null,
  version integer not null default 1,
  updated_at timestamptz not null default now()
);
