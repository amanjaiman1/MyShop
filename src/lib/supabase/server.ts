import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import type { Database } from "./database.types";

/**
 * Server client for Server Components, Server Actions and Route Handlers.
 *
 * Cookie writes are wrapped in try/catch because Server Components are not
 * allowed to set cookies; in that context the middleware has already refreshed
 * the session, so silently ignoring the write is correct rather than fatal.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — middleware owns the refresh.
          }
        },
      },
    },
  );
}

/**
 * The signed-in owner, or null.
 * Always uses getUser() (which validates the JWT with Supabase) rather than
 * trusting a session read straight from the cookie.
 */
export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}
