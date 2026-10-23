-- Roadmap schema. Run in Supabase SQL editor.

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  body text not null default '',           -- bullet lines, one per newline
  category text not null,                  -- growth | partner | features | bugs
  col_year int not null,
  col_month int not null,                  -- 1-12
  col_half int not null,                   -- 0 = first half, 1 = second half
  span int not null default 1,             -- column width in half-months (1 = half, 2 = full month, ...)
  value int not null default 0,            -- value added, 0-3 (0 = none)
  position int not null default 0,         -- stack order within a cell
  status text not null default 'normal',   -- normal | done | tentative
  tray boolean not null default false,     -- true = parked in staging tray
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill for tables created before `span` existed.
alter table public.cards add column if not exists span int not null default 1;

-- Backfill for tables created before `value` existed.
alter table public.cards add column if not exists value int not null default 0;

-- Staging tray flag. When true, the card lives in the parking lot above the
-- grid and col_year/col_month/col_half are ignored until it is dropped into a cell.
alter table public.cards add column if not exists tray boolean not null default false;

create index if not exists cards_cell_idx
  on public.cards (category, col_year, col_month, col_half, position);

-- Lock down direct access. App talks to DB only via server (service role),
-- which bypasses RLS. Enabling RLS with no policies blocks anon/auth keys.
alter table public.cards enable row level security;

-- service_role bypasses RLS but still needs table-level privileges. Without
-- this grant, inserts/selects fail with "permission denied for table cards".
grant all privileges on table public.cards to service_role;

-- Auto-bump updated_at on every UPDATE. The API also sets it explicitly, but the
-- trigger guarantees it even for writes that don't, and is required for a
-- reliable ?since=<timestamp> delta sync once the board scales.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at
  before update on public.cards
  for each row execute function public.set_updated_at();

-- Live presence. Each browser session upserts a heartbeat row; the board lists
-- rows seen in the last ~15s as the "who's here" avatars. Ephemeral — safe to
-- truncate anytime.
create table if not exists public.presence (
  id text primary key,                       -- client-generated session id
  name text not null,
  color text not null,                       -- hex avatar color
  last_seen timestamptz not null default now()
);

create index if not exists presence_last_seen_idx on public.presence (last_seen);

alter table public.presence enable row level security;
grant all privileges on table public.presence to service_role;

-- Card comment threads. Each row is one comment anchored to a card. Editors and
-- view-only guests can both post; the role is stamped server-side from the auth
-- token (not a client field). The app soft-deletes cards (deleted_at), so the
-- cascade below only fires on a hard delete made by hand in SQL — and the
-- row_history trigger still records every comment it removes.
create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards (id) on delete cascade,
  author_name text not null,
  author_role text not null,                 -- editor | guest
  author_color text not null default '#64748b',
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists comments_card_idx on public.comments (card_id, created_at);

alter table public.comments enable row level security;
grant all privileges on table public.comments to service_role;

-- Shared app settings. A single pinned row (id = 1) holds the AI assistant's
-- "product context" (mission, target users, team size, goals) that seeds every
-- assistant answer. Set once by an editor; shared across everyone.
create table if not exists public.settings (
  id int primary key default 1,
  product_context text not null default '',
  updated_at timestamptz not null default now(),
  constraint settings_singleton check (id = 1)
);

insert into public.settings (id) values (1) on conflict (id) do nothing;

alter table public.settings enable row level security;
grant all privileges on table public.settings to service_role;

-- Client crash reports. A render-time throw in the board unmounts the tree into
-- an error page and the stack is lost on reload; the client posts it here first
-- (see src/lib/crash.ts) with the breadcrumb trail leading up to it.
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  message text not null,
  stack text,
  component_stack text,
  breadcrumbs jsonb not null default '[]'::jsonb,  -- last ~30 user/app actions
  url text,
  user_agent text,
  user_name text,
  role text,                                       -- editor | guest | unknown
  session_id text,                                 -- rm_session_id, ties to presence
  created_at timestamptz not null default now()
);

create index if not exists client_errors_created_idx
  on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;
grant all privileges on table public.client_errors to service_role;

-- R1 data safety (also shipped as supabase/migrations/20261023_r1_safety.sql):
-- actor stamps, soft delete, and a row_history trigger on cards / comments /
-- settings. See README → Data safety.
alter table public.cards add column if not exists deleted_at timestamptz;
alter table public.cards add column if not exists created_by text;
alter table public.cards add column if not exists updated_by text;

alter table public.comments add column if not exists deleted_at timestamptz;
alter table public.comments add column if not exists created_by text;
alter table public.comments add column if not exists updated_by text;

alter table public.settings add column if not exists updated_by text;

create table if not exists public.row_history (
  id uuid primary key default gen_random_uuid(),
  table_name text not null,                 -- cards | comments | settings
  row_id text not null,
  op text not null,                         -- INSERT | UPDATE | DELETE
  old jsonb,
  new jsonb,
  actor text not null default 'unknown',
  changed_at timestamptz not null default clock_timestamp()
);

create index if not exists row_history_row_idx
  on public.row_history (table_name, row_id, changed_at desc);
create index if not exists row_history_at_idx
  on public.row_history (changed_at desc);

alter table public.row_history enable row level security;
grant all privileges on table public.row_history to service_role;

-- Position-only reorders (a drag within a cell) are skipped: they carry no
-- content and are the bulk of all writes, so logging them would eat the free
-- tier's 500 MB for nothing. A move to another cell changes col_* and is kept.
create or replace function public.log_row_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  n jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  noise text[] := array['position', 'updated_at', 'updated_by'];
begin
  if tg_op = 'UPDATE' and (o - noise) = (n - noise) then
    return null;
  end if;
  insert into public.row_history (table_name, row_id, op, old, new, actor)
  values (
    tg_table_name,
    coalesce(n ->> 'id', o ->> 'id'),
    tg_op,
    o,
    n,
    coalesce(n ->> 'updated_by', n ->> 'created_by', o ->> 'updated_by', 'unknown')
  );
  return null;
end;
$$;

create or replace trigger cards_row_history
  after insert or update or delete on public.cards
  for each row execute function public.log_row_history();

create or replace trigger comments_row_history
  after insert or update or delete on public.comments
  for each row execute function public.log_row_history();

create or replace trigger settings_row_history
  after insert or update or delete on public.settings
  for each row execute function public.log_row_history();

create index if not exists cards_deleted_idx on public.cards (deleted_at)
  where deleted_at is not null;
create index if not exists comments_deleted_idx on public.comments (deleted_at)
  where deleted_at is not null;
