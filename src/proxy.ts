import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next.js 16 renamed the `middleware` convention to `proxy`; the exported
 * function must be named `proxy` to match the file.
 *
 * Runs on every matched request to refresh the Supabase session and gate the
 * protected routes, so a Server Component never renders with an expired token.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, the PWA shell files and static assets.
     * Keeping the service worker and manifest out of the matcher matters: they
     * must be fetchable before a session exists.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/|images/).*)",
  ],
};
