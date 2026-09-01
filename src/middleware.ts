import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Everything except Next internals, the PWA shell files and static assets.
     * Keeping the service worker and manifest out of the matcher is important:
     * they must be fetchable before a session exists.
     */
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|offline.html|icons/|images/).*)",
  ],
};
