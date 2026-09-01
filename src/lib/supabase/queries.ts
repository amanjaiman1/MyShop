import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient, getCurrentUser } from "./server";
import type {
  DashboardSnapshot,
  PlSummaryRow,
  ProfileRow,
  ShopContextRow,
} from "./database.types";

/**
 * Server-side data access.
 *
 * These run in Server Components through the owner's RLS-scoped session.
 * `cache()` deduplicates within a single render pass. Failures are logged with
 * a clear prefix (visible in Vercel's Runtime Logs) and, where possible,
 * degrade gracefully rather than white-screening the whole app.
 */

/** The owner's profile. Self-heals a missing profile row before giving up. */
export const getProfile = cache(async (): Promise<ProfileRow> => {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (data) return data;

  if (error) {
    console.error("[aurelia] getProfile failed:", error.message, error.code);
  }

  // No profile row yet — most often because the owner account was created
  // before the schema/trigger existed. Heal it instead of dead-ending in a
  // redirect loop.
  const { data: healed, error: healError } = await supabase.rpc("ensure_owner_setup");
  if (healError) {
    console.error("[aurelia] ensure_owner_setup failed:", healError.message, healError.code);
    // Genuinely can't establish a profile — the session is unusable.
    redirect("/login");
  }
  return healed as unknown as ProfileRow;
});

/** Shop calendar context (today in the shop's timezone), resolved server-side. */
export const getShopContext = cache(async (): Promise<ShopContextRow> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("shop_context").single();
  if (error || !data) {
    if (error) console.error("[aurelia] shop_context failed:", error.message, error.code);
    // Fall back to a sane default rather than crashing the whole shell.
    return {
      today: new Date().toISOString().slice(0, 10),
      timezone: "Asia/Kolkata",
      now_local: new Date().toISOString(),
    };
  }
  return data as ShopContextRow;
});

/**
 * Dashboard snapshot. If the RPC fails (e.g. an incomplete migration), log the
 * real error and return a zeroed snapshot so the app still loads and the rest
 * of the pages remain usable — the failure is visible in logs, not a crash.
 */
export const getDashboardSnapshot = cache(
  async (today: string): Promise<{ snapshot: DashboardSnapshot; ok: boolean }> => {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("dashboard_snapshot");
    if (error || !data) {
      if (error) {
        console.error(
          "[aurelia] dashboard_snapshot failed:",
          error.message,
          error.code,
          "— check that all migrations (esp. reporting) were applied.",
        );
      }
      return { snapshot: emptySnapshot(today), ok: false };
    }
    return { snapshot: data as unknown as DashboardSnapshot, ok: true };
  },
);

function emptyPl(today: string, label: string): PlSummaryRow {
  return {
    period_start: today,
    period_end: today,
    period_label: label,
    gross_sales: 0,
    discounts: 0,
    returns_amount: 0,
    net_sales: 0,
    cost_of_goods_sold: 0,
    realized_gross_profit: 0,
    gross_margin_pct: 0,
    operating_expenses: 0,
    net_profit: 0,
    net_margin_pct: 0,
    order_count: 0,
    units_sold: 0,
    average_order_value: 0,
    inventory_purchased: 0,
    inventory_units_purchased: 0,
    current_inventory_investment: 0,
    projected_gross_profit: 0,
    loss_making_order_count: 0,
    status: "breakeven",
  };
}

function emptySnapshot(today: string): DashboardSnapshot {
  return {
    today: emptyPl(today, "Today"),
    yesterday: emptyPl(today, "Yesterday"),
    this_month: emptyPl(today, "This Month"),
    comparison: {
      net_sales_delta: 0,
      gross_profit_delta: 0,
      net_profit_delta: 0,
      net_sales_pct: null,
      gross_profit_pct: null,
      net_profit_pct: null,
    },
    inventory: {
      investment: 0,
      units: 0,
      projected_revenue: 0,
      projected_gross_profit: 0,
      projected_margin_pct: 0,
    },
    alerts: {
      low_stock: 0,
      out_of_stock: 0,
      expiring_soon: 0,
      priced_at_loss: 0,
      priced_at_breakeven: 0,
    },
  };
}
