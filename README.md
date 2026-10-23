# Product Roadmap

A FigJam-style roadmap board. Four colored category rows × half-month columns.
Drag cards to snap into cells, double-click to add, toggle done/tentative.

- **Categories** (fixed, colored): Growth & User Delight, Partner Convenience, New Features, Bugs
- **Columns**: 9 months forward from the current month, each split into two halves (1–15, 16+). Scroll left to reach 6 past months.
- **Card states**: normal · tentative (dashed border) · done (strikethrough). Cycle with the status button.
- **Auth**: one shared password gate.

## Stack

Next.js (App Router) · Tailwind · @dnd-kit · Supabase Postgres · deploy on Vercel.
All DB access goes through Next server routes using the Supabase **service-role** key,
gated by a password cookie. RLS is enabled with no policies, so the anon key can't read/write — only the server can.

## Local dev

```bash
npm install
cp .env.local.example .env.local   # fill in real values
npm run dev
```

Open http://localhost:3000 → enter the password from `APP_PASSWORD`.

## Environment variables

| Var | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` secret |
| `APP_PASSWORD` | Pick the shared password your team types to log in |
| `APP_SESSION_SECRET` | Random string for the session cookie. `openssl rand -hex 32` |
| `EXPORT_TOKEN` | Bearer token for `GET /api/export` (nightly snapshot). `openssl rand -hex 32`. Unset = export always 401 |

## Supabase setup

1. Create a project at https://supabase.com → **New project**. Pick a region near you, set a DB password (you won't need it for this app).
2. Wait for it to provision (~2 min).
3. Open **SQL Editor** → **New query** → paste the contents of `supabase/schema.sql` → **Run**. This creates the `cards` table and enables RLS.
4. Open **Project Settings → API**. Copy **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`, and the **`service_role`** key → `SUPABASE_SERVICE_ROLE_KEY`. Keep `service_role` secret — it bypasses RLS.

That's all on Supabase. No Auth provider, no policies, no buckets needed.

## Vercel deploy

1. Push this folder to a GitHub repo.
2. https://vercel.com → **Add New → Project** → import the repo. Framework auto-detects as **Next.js**.
3. Before deploying, open **Environment Variables** and add all four vars from the table above (set them for Production + Preview).
4. **Deploy**. First build takes ~1–2 min.
5. Visit the URL, enter `APP_PASSWORD`. Done.

To change the password later: update `APP_PASSWORD` in Vercel env vars → redeploy.

## How it's used

- **Add**: double-click empty space in any cell, or hover a cell → "+ add". Type a bold title and bullet lines (one per line), Enter to save.
- **Move**: drag a card; it snaps into the target cell and stacks. Drag within a cell to reorder.
- **Edit**: double-click a card, or hover → ✎.
- **Status**: hover → ○ button cycles normal → tentative (dashed) → done (strikethrough).
- **Delete**: hover → ✕. Deletes are soft — editors can bring cards and comments back from **Recently deleted** in the header (last 30 days).

## Crash reports

Client-side crashes are captured and stored, not just logged to the console:

- `src/lib/crash.ts` keeps a rolling trail of the last ~30 actions (drag start/end,
  poll applies, card add/delete, undo) and POSTs a crash to `/api/client-error`
  with the message, stack, React component stack, and that trail.
- `src/components/ErrorBoundary.tsx` wraps the board and catches render throws;
  `src/app/global-error.tsx` is the backstop; `window.onerror` /
  `unhandledrejection` cover async throws that no boundary sees.
- Rows land in the `client_errors` table. Read the recent ones as an editor:

  ```
  curl -s --cookie "rm_auth=$APP_SESSION_SECRET" \
    https://<your-app>/api/client-error?limit=10 | jq
  ```

Run `npm test` for the drag container-math regression tests (`src/lib/drag.ts`),
which pin the invariants behind two past drag crashes.

## Data safety

Nothing on the board is hard-deleted by the app, and every change is recorded.

- **Soft delete.** Deleting a card, a comment or resolving a thread sets
  `deleted_at` instead of removing the row. Every read (board, comments,
  assistant) filters `deleted_at is null`.
- **Who changed what.** `created_by` / `updated_by` on `cards` and `comments`
  (`updated_by` on `settings`) are stamped server-side from the `rm_name` login
  cookie, never from the request body (`src/lib/safety.ts`).
- **History.** A trigger copies every INSERT / UPDATE / DELETE on `cards`,
  `comments` and `settings` into `row_history` (`old` + `new` row as jsonb,
  `actor`, `changed_at`). Reorders within a cell (position-only updates) are skipped to
  save space; moves to another cell are kept. Because it's a trigger, it also
  catches edits made by hand in the SQL editor.
- **Nightly snapshot.** `.github/workflows/snapshot.yml` calls `/api/export` at
  21:00 UTC and commits `snapshots/roadmap/<date>.json` to the private ops repo
  (`vigneshanil1297/urbanaut-agent-ops`) when something changed. The export
  includes soft-deleted rows.

### Restore a card or comment
Editors: header → **Recently deleted** → **Restore** (last 30 days). The card
comes back in its old cell with its comment thread. Older than 30 days, in the
SQL editor:

```sql
update cards set deleted_at = null, updated_by = 'Vignesh' where id = '<card id>';
```

### Find who changed something

```sql
select changed_at, op, actor, old->>'title' as old_title, new->>'title' as new_title,
       old->>'col_month' as old_month, new->>'col_month' as new_month
from row_history
where table_name = 'cards' and row_id = '<card id>'
order by changed_at desc;
```

### Put back an older version of a card's text

```sql
-- 1. pick the version: copy the history id
select id, changed_at, actor, old->>'title' as title, old->>'body' as body
from row_history where table_name = 'cards' and row_id = '<card id>' order by changed_at desc;

-- 2. restore title + body from it
update cards c set title = h.old->>'title', body = h.old->>'body', updated_by = 'Vignesh'
from row_history h where h.id = '<history id>' and c.id = h.row_id::uuid;
```

### Restore from a snapshot
Snapshots live in the ops repo under `snapshots/roadmap/`. To bring back a
card that was hard-deleted (only possible from SQL), copy its object from the
snapshot's `cards` array and insert it:

```sql
insert into cards select * from jsonb_populate_record(null::cards, '<card json>'::jsonb);
```

Same for `comments` (insert the card first). Never bulk-replace the table from
a snapshot without checking `row_history` for changes made after it.

### Export contract (`GET /api/export`)
`Authorization: Bearer $EXPORT_TOKEN`. Returns
`{ schema: "roadmapper-export/1", exported_at, counts: { cards, cards_deleted,
comments, comments_deleted, settings }, cards[], comments[], settings[] }`,
full rows including `deleted_at`, `created_by`, `updated_by`. Agents (R2) read
the snapshots, never this route directly. Bump `schema` on any breaking change.

