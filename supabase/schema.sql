-- Roadmap schema. Run in Supabase SQL editor.

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  body text not null default '',           -- bullet lines, one per newline
  category text not null,                  -- growth | partner | features | bugs
  col_year int not null,
  col_month int not null,                  -- 1-12
  col_half int not null,                   -- 0 = first half, 1 = second half
  span int not null default 1,             -- column width: 1 = half month, 2 = full month
  position int not null default 0,         -- stack order within a cell
  status text not null default 'normal',   -- normal | done | tentative
  tray boolean not null default false,     -- true = parked in staging tray
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill for tables created before `span` existed.
alter table public.cards add column if not exists span int not null default 1;

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
