"use client";

import * as React from "react";
import type { CurrencyConfig } from "@/lib/format";
import type { BelowCostBehavior, ProfileRow } from "@/lib/supabase/database.types";

/**
 * Shop settings, made available to every Client Component.
 *
 * Populated once by the protected layout (a Server Component) so currency,
 * timezone and the margin thresholds are consistent everywhere — a figure never
 * gets formatted with a guessed locale or the browser's timezone.
 */
export interface ShopContextValue {
  ownerId: string;
  displayName: string;
  shopName: string;
  currency: CurrencyConfig;
  timezone: string;
  /** Today's date in the shop's timezone, resolved server-side. */
  today: string;
  targetMargin: number;
  lowMarginThreshold: number;
  belowCostBehavior: BelowCostBehavior;
  appStartedAt: string;
}

const ShopContext = React.createContext<ShopContextValue | null>(null);

export function ShopProvider({
  value,
  children,
}: {
  value: ShopContextValue;
  children: React.ReactNode;
}) {
  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop(): ShopContextValue {
  const context = React.useContext(ShopContext);
  if (!context) {
    throw new Error("useShop must be used inside the authenticated app layout.");
  }
  return context;
}

/** Build the context value from a profile row plus the server-resolved date. */
export function shopContextFromProfile(
  profile: ProfileRow,
  today: string,
): ShopContextValue {
  return {
    ownerId: profile.id,
    displayName: profile.display_name,
    shopName: profile.shop_name,
    currency: {
      code: profile.currency_code,
      symbol: profile.currency_symbol,
      locale: profile.currency_code === "INR" ? "en-IN" : undefined,
    },
    timezone: profile.timezone,
    today,
    targetMargin: Number(profile.target_profit_margin),
    lowMarginThreshold: Number(profile.low_margin_threshold),
    belowCostBehavior: profile.below_cost_sale_behavior,
    appStartedAt: profile.app_started_at,
  };
}
