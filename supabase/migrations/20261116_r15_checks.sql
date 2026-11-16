-- R1.5 card CHECK constraints. Same limits as src/lib/validate.ts (keep the two
-- in step). Additive and idempotent: each constraint is added NOT VALID only if
-- missing, then validated against existing rows (soft-deleted ones included).
-- Nothing here drops, truncates or rewrites rows. If VALIDATE fails, the
-- constraint stays NOT VALID (still enforced for new writes) and the error
-- names it; run the pre-check query in the README to find the rows.
-- Run in the Supabase SQL editor; the last statement prints the result.

do $$
declare
  c record;
begin
  for c in
    select * from (values
      ('cards_category_chk',  $c$category in ('growth', 'partner', 'features', 'bugs')$c$),
      ('cards_status_chk',    $c$status in ('normal', 'done', 'tentative')$c$),
      ('cards_col_month_chk', $c$col_month between 1 and 12$c$),
      ('cards_col_half_chk',  $c$col_half in (0, 1)$c$),
      ('cards_col_year_chk',  $c$col_year between 2026 and 2040$c$),
      ('cards_value_chk',     $c$value between 0 and 3$c$),
      ('cards_span_chk',      $c$span between 1 and 96$c$),
      ('cards_position_chk',  $c$position between 0 and 10000$c$),
      ('cards_title_len_chk', $c$char_length(title) <= 120$c$),
      ('cards_body_len_chk',  $c$char_length(body) <= 2000$c$)
    ) as t(name, expr)
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = c.name and conrelid = 'public.cards'::regclass
    ) then
      execute format('alter table public.cards add constraint %I check (%s) not valid', c.name, c.expr);
    end if;
    execute format('alter table public.cards validate constraint %I', c.name);
  end loop;
end
$$;

-- Verification: expect 10 rows, every one validated = true.
select conname as constraint_name, convalidated as validated, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid = 'public.cards'::regclass and conname like 'cards\_%\_chk' escape '\'
order by conname;
