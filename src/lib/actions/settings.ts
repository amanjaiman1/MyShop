"use server";

import { revalidatePath } from "next/cache";
import { settingsSchema } from "@/lib/schemas";
import { success, failure, withOwner, type ActionResult } from "./helpers";

/** Owner profile + shop-wide settings (currency, timezone, margins, policy). */
export async function updateSettings(raw: unknown): Promise<ActionResult<void>> {
  const parsed = settingsSchema.safeParse(raw);
  if (!parsed.success) return failure(parsed.error);

  return withOwner(async ({ userId, supabase }) => {
    const v = parsed.data;
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: v.display_name,
        shop_name: v.shop_name,
        phone: v.phone ?? null,
        currency_code: v.currency_code,
        currency_symbol: v.currency_symbol,
        timezone: v.timezone,
        target_profit_margin: v.target_profit_margin,
        low_margin_threshold: v.low_margin_threshold,
        below_cost_sale_behavior: v.below_cost_sale_behavior,
      })
      .eq("id", userId);

    if (error) return failure(error);
    // Currency/timezone changes ripple through every formatted figure.
    revalidatePath("/", "layout");
    return success(undefined);
  });
}
