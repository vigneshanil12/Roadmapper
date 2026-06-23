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
- **Delete**: hover → ✕.
