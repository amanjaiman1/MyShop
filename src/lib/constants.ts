import type {
  PaymentMethod,
  ReportPeriodKey,
  SaleStatus,
  StockMovementType,
} from "@/lib/supabase/database.types";

/** Human labels for enum values. No raw database identifiers reach the UI. */

export const PAYMENT_METHODS: ReadonlyArray<{ value: PaymentMethod; label: string }> = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "card", label: "Card" },
  { value: "bank_transfer", label: "Bank transfer" },
  { value: "wallet", label: "Wallet" },
  { value: "credit", label: "Credit (unpaid)" },
  { value: "other", label: "Other" },
];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = Object.fromEntries(
  PAYMENT_METHODS.map((m) => [m.value, m.label]),
) as Record<PaymentMethod, string>;

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  draft: "Draft",
  completed: "Completed",
  partially_returned: "Partly returned",
  returned: "Returned",
  voided: "Voided",
};

/** Tone tokens per sale status — text is always present alongside colour. */
export const SALE_STATUS_TONE: Record<SaleStatus, string> = {
  draft: "bg-surface-sunken text-muted border-line",
  completed: "bg-profit-soft text-profit border-profit-border",
  partially_returned: "bg-lowprofit-soft text-lowprofit border-lowprofit-border",
  returned: "bg-breakeven-soft text-breakeven-strong border-breakeven-border",
  voided: "bg-loss-soft text-loss border-loss-border",
};

export const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  purchase: "Purchase",
  sale: "Sale",
  sale_return: "Sale return",
  purchase_return: "Returned to supplier",
  damaged: "Damaged",
  expired: "Expired",
  manual_adjustment: "Manual adjustment",
};

/** Adjustment reasons the owner can pick — a subset of movement types. */
export const ADJUSTMENT_TYPES: ReadonlyArray<{
  value: Extract<
    StockMovementType,
    "damaged" | "expired" | "purchase_return" | "manual_adjustment"
  >;
  label: string;
  hint: string;
  direction: "out" | "either";
}> = [
  {
    value: "damaged",
    label: "Damaged",
    hint: "Broken, leaking or unsellable stock.",
    direction: "out",
  },
  {
    value: "expired",
    label: "Expired",
    hint: "Past its expiry date.",
    direction: "out",
  },
  {
    value: "purchase_return",
    label: "Returned to supplier",
    hint: "Sent back to where you bought it.",
    direction: "out",
  },
  {
    value: "manual_adjustment",
    label: "Correction",
    hint: "A recount — can add or remove units.",
    direction: "either",
  },
];

export const PERIOD_OPTIONS: ReadonlyArray<{ value: ReportPeriodKey; label: string }> = [
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last_5_days", label: "Last 5 Days" },
  { value: "last_10_days", label: "Last 10 Days" },
  { value: "last_20_days", label: "Last 20 Days" },
  { value: "last_30_days", label: "Last 30 Days" },
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "this_year", label: "This Year" },
  { value: "all_time", label: "All Time" },
  { value: "custom", label: "Custom Range" },
];

export const PERIOD_KEYS = PERIOD_OPTIONS.map((p) => p.value);

export function isPeriodKey(value: string | undefined): value is ReportPeriodKey {
  return value !== undefined && (PERIOD_KEYS as string[]).includes(value);
}

/** Rolling windows shown as summary cards. */
export const ROLLING_PERIODS: ReadonlyArray<{
  value: Extract<
    ReportPeriodKey,
    "last_5_days" | "last_10_days" | "last_20_days" | "last_30_days"
  >;
  label: string;
  days: number;
}> = [
  { value: "last_5_days", label: "Last 5 Days", days: 5 },
  { value: "last_10_days", label: "Last 10 Days", days: 10 },
  { value: "last_20_days", label: "Last 20 Days", days: 20 },
  { value: "last_30_days", label: "Last 30 Days", days: 30 },
];

/** A small, curated currency list; the shop can still type any ISO code. */
export const CURRENCY_PRESETS: ReadonlyArray<{
  code: string;
  symbol: string;
  label: string;
}> = [
  { code: "INR", symbol: "₹", label: "Indian Rupee" },
  { code: "USD", symbol: "$", label: "US Dollar" },
  { code: "EUR", symbol: "€", label: "Euro" },
  { code: "GBP", symbol: "£", label: "Pound Sterling" },
  { code: "AED", symbol: "د.إ", label: "UAE Dirham" },
  { code: "PKR", symbol: "₨", label: "Pakistani Rupee" },
  { code: "BDT", symbol: "৳", label: "Bangladeshi Taka" },
  { code: "LKR", symbol: "Rs", label: "Sri Lankan Rupee" },
  { code: "NPR", symbol: "रू", label: "Nepalese Rupee" },
  { code: "NGN", symbol: "₦", label: "Nigerian Naira" },
  { code: "ZAR", symbol: "R", label: "South African Rand" },
];

/** Common shop timezones. Any IANA zone is accepted by the database. */
export const TIMEZONE_PRESETS: readonly string[] = [
  "Asia/Kolkata",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Colombo",
  "Asia/Kathmandu",
  "Asia/Dubai",
  "Asia/Singapore",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Africa/Lagos",
  "Africa/Johannesburg",
  "Australia/Sydney",
  "UTC",
];

export const BELOW_COST_BEHAVIOURS = [
  {
    value: "warn",
    label: "Warn me and ask for confirmation",
    hint: "Recommended. You can still sell below cost, but never by accident.",
  },
  {
    value: "block",
    label: "Block the sale completely",
    hint: "The database refuses any sale priced under its purchase cost.",
  },
  {
    value: "allow",
    label: "Allow without confirming",
    hint: "Analysis is still shown, but nothing stands in your way.",
  },
] as const;

/** Products within this many days of expiry are surfaced as an alert. */
export const EXPIRY_ALERT_DAYS = 60;

export const PAGE_SIZE = 24;
