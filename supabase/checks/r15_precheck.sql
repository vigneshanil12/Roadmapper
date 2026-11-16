-- R1.5 pre-check, READ-ONLY. Counts rows (soft-deleted included) each new
-- CHECK constraint would reject. Expect every column = 0 before running
-- migrations/20261116_r15_checks.sql.
select
  count(*) filter (where category not in ('growth', 'partner', 'features', 'bugs')) as bad_category,
  count(*) filter (where status not in ('normal', 'done', 'tentative'))           as bad_status,
  count(*) filter (where col_month not between 1 and 12)                          as bad_col_month,
  count(*) filter (where col_half not in (0, 1))                                  as bad_col_half,
  count(*) filter (where col_year not between 2026 and 2040)                      as bad_col_year,
  count(*) filter (where value not between 0 and 3)                               as bad_value,
  count(*) filter (where span not between 1 and 96)                               as bad_span,
  count(*) filter (where position not between 0 and 10000)                       as bad_position,
  count(*) filter (where char_length(title) > 120)                                as bad_title_len,
  count(*) filter (where char_length(body) > 2000)                                as bad_body_len,
  count(*)                                                                        as total_rows
from public.cards;
