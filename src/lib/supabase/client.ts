"use client";

import { createBrowserClient } from "@supabase/ssr";
import { assertSupabaseConfig, env } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Browser client. Uses the publishable anon key only — every table is protected
 * by RLS, so the key grants nothing on its own.
 */
let cached: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  assertSupabaseConfig();
  cached ??= createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  return cached;
}
