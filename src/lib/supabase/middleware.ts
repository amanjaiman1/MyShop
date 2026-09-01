import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { assertSupabaseConfig, env } from "@/lib/env";
import type { Database } from "./database.types";

/** Routes reachable without a session. Everything else is protected. */
const PUBLIC_PATHS = ["/login", "/forgot-password", "/reset-password", "/auth"];

const isPublic = (pathname: string): boolean =>
  PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

/**
 * Refreshes the Supabase session on every request and gates protected routes.
 *
 * Doing this in middleware means a Server Component never renders with an
 * expired token, and an unauthenticated visitor never sees a flash of the app
 * shell before being bounced to the login screen.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  // Fail clearly (in logs) rather than with a cryptic client error if the
  // deployment is missing its Supabase env vars.
  assertSupabaseConfig();

  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;

  if (!user && !isPublic(pathname)) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.search = "";
    // Remember where they were headed so login can complete the journey.
    if (pathname !== "/") {
      redirect.searchParams.set("next", `${pathname}${search}`);
    }
    return NextResponse.redirect(redirect);
  }

  // A signed-in owner has no reason to see the login screen.
  if (user && (pathname === "/login" || pathname === "/forgot-password")) {
    const redirect = request.nextUrl.clone();
    redirect.pathname = "/dashboard";
    redirect.search = "";
    return NextResponse.redirect(redirect);
  }

  return response;
}
