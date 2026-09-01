import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";

/** The app has no marketing landing page — route straight to where you belong. */
export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? "/dashboard" : "/login");
}
