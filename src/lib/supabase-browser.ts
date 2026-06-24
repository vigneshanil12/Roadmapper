"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Browser Supabase client, used ONLY for Realtime Broadcast (live cursors) —
// never for table access. RLS blocks the anon key from reading/writing `cards`
// and `presence`, so the locked-down all-server-side data model is preserved;
// Broadcast is a transient pub/sub channel that touches no table.
let client: SupabaseClient | null = null;

export function getBrowserClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  // No anon key (e.g. local dev with fake creds) → cursors silently disabled.
  if (!url || !key) return null;
  if (!client) {
    client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
  }
  return client;
}
