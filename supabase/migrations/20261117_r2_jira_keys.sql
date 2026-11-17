-- R2: link roadmap cards to Jira tickets. Additive and idempotent: adds one
-- column with an empty-array default (existing rows get '{}'), plus a CHECK that
-- mirrors src/lib/validate.ts (≤ 20 keys, each URBN-<n>, no nulls). Nothing here
-- drops, truncates or rewrites data. The row_history trigger records the column
-- automatically (it stores whole rows as jsonb).
-- Run in the Supabase SQL editor; the last statement prints the result.

alter table public.cards add column if not exists jira_keys text[] not null default '{}';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'cards_jira_keys_chk' and conrelid = 'public.cards'::regclass
  ) then
    alter table public.cards add constraint cards_jira_keys_chk check (
      cardinality(jira_keys) <= 20
      and array_position(jira_keys, null) is null
      and array_to_string(jira_keys, ',') ~ '^(URBN-[0-9]+(,URBN-[0-9]+)*)?$'
    ) not valid;
  end if;
  alter table public.cards validate constraint cards_jira_keys_chk;
end
$$;

-- Verification: expect 1 row — column_default '{}'::text[], not_null true,
-- validated true, cards_with_keys 0 (before any backfill).
select
  (select column_default from information_schema.columns
     where table_schema = 'public' and table_name = 'cards' and column_name = 'jira_keys') as column_default,
  (select is_nullable = 'NO' from information_schema.columns
     where table_schema = 'public' and table_name = 'cards' and column_name = 'jira_keys') as not_null,
  (select convalidated from pg_constraint
     where conname = 'cards_jira_keys_chk' and conrelid = 'public.cards'::regclass) as validated,
  (select count(*) from public.cards where cardinality(jira_keys) > 0) as cards_with_keys;
