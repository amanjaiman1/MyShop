import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";

// Reads the session (cookies), so it must run per-request, never prerendered.
export const dynamic = "force-dynamic";

/** The app has no marketing landing page — route straight to where you belong. */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
