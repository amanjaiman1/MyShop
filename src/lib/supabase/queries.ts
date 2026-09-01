import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "./server";
import type {
  DashboardSnapshot,
  ProfileRow,
  ShopContextRow,
} from "./database.types";

/**
 * Server-side data access.
 *
 * These run in Server Components, so they read through the owner's RLS-scoped
 * session. `cache()` deduplicates within a single render pass — the layout and
 * a page can both ask for the profile without a second round trip.
 */

/** The owner's profile, or a redirect to login if the session is gone. */
export const getProfile = cache(async (): Promise<ProfileRow> => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    // The bootstrap trigger creates this row at sign-up; a missing row means a
    // broken session rather than a recoverable state.
    redirect("/login");
  }
  return data;
});

/** Shop calendar context (today in the shop's timezone), resolved server-side. */
export const getShopContext = cache(async (): Promise<ShopContextRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shop_context").single();
  if (error || !data) {
    // Fall back to a sane default rather than crashing the whole shell.
    return {
      today: new Date().toISOString().slice(0, 10),
      timezone: "Asia/Kolkata",
      now_local: new Date().toISOString(),
    };
  }
  return data as ShopContextRow;
});

export const getDashboardSnapshot = cache(async (): Promise<DashboardSnapshot> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_snapshot");
  if (error || !data) throw error ?? new Error("Failed to load dashboard");
  return data as unknown as DashboardSnapshot;
});
