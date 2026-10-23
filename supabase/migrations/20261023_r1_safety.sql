-- R1 data safety. Additive and idempotent: safe to run more than once, and the
-- app code already deployed keeps working before and after it. Run in the
-- Supabase SQL editor. Nothing here drops, truncates or rewrites existing rows.
--
-- 1. Who changed what: created_by / updated_by on cards + comments, updated_by
--    on settings. Stamped server-side from the rm_name cookie.
-- 2. Soft delete: deleted_at on cards + comments. The app sets it instead of
--    deleting; every read filters `deleted_at is null`.
-- 3. History: every INSERT / UPDATE / DELETE on cards, comments and settings is
--    copied to row_history (old + new row as jsonb). Because it is a trigger,
--    it also covers the current hard-delete code, cascaded comment deletes and
--    edits made by hand in the SQL editor.

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
