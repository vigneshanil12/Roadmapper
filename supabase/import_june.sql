-- Import: FigJam "June" board → cards table.
-- Run in Supabase SQL Editor (after schema.sql has created the cards table).
-- Mapping: left FigJam column -> col_half 0 (1–15), right column -> col_half 1 (16+).
-- 'S' purple sticker ignored. Strikethrough -> status 'done'. Dashed border -> 'tentative'.

insert into public.cards (title, body, category, col_year, col_month, col_half, position, status) values
  -- Growth (green) — left column
  ('Flutter:', E'In-app checkout\nOption to invite friends post booking conf.\nLocation permissions\nMandatory sign up', 'growth', 2026, 6, 0, 0, 'tentative'),
  ('Mandate business info', '', 'growth', 2026, 6, 0, 1, 'normal'),
  ('SCHPOT integration for venue assistance', '', 'growth', 2026, 6, 0, 2, 'done'),
  -- Growth (green) — right column
  ('Make primary tag mandatory + combine all tags', '', 'growth', 2026, 6, 1, 0, 'normal'),
  ('Allow bulk addition of recommendations', '', 'growth', 2026, 6, 1, 1, 'normal'),
  -- Partner (amber) — left column
  ('QR flow -', 'Search by name and tap to check-in', 'partner', 2026, 6, 0, 0, 'normal'),
  ('Minor -', 'List of checked-in guests after event', 'partner', 2026, 6, 0, 1, 'done'),
  -- Partner (amber) — right column
  ('', E'New state for unpublished listings,\nPrivate/Public toggle\nAdd ''abandoned'' status to differentiate form cancellations', 'partner', 2026, 6, 1, 0, 'normal'),
  -- New Features (violet) — full width
  ('Mobile dashboard', E'Create listings, Edit pricing, see booking details, ticket capacities, add session, list of checked-in guests\n\nAdd comms on dashboard & B2B landing page. Prompt to add to home page (PWA)', 'features', 2026, 6, 0, 0, 'tentative');
