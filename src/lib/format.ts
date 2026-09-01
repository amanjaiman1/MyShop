import { MINOR_UNITS_PER_MAJOR, type Minor } from "./money";

/**
 * Presentation layer for currency, dates and numbers.
 *
 * Currency and timezone are shop settings, so every formatter takes them
 * explicitly rather than reading a global. That is what keeps a report rendered
 * on a phone in another timezone identical to the shop's own books.
 */

export interface CurrencyConfig {
  code: string;
  symbol: string;
  locale?: string;
}

export const DEFAULT_CURRENCY: CurrencyConfig = {
  code: "INR",
  symbol: "₹",
  locale: "en-IN",
};

const formatterCache = new Map<string, Intl.NumberFormat>();

function numberFormatter(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options)}`;
  let f = formatterCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(locale, options);
    formatterCache.set(key, f);
  }
  return f;
}

/**
 * Money for display. `compactPaise` drops ".00" so lists stay scannable while
 * odd amounts keep their precision.
 */
export function formatMoney(
  minor: Minor | null | undefined,
  currency: CurrencyConfig = DEFAULT_CURRENCY,
  options: { showSign?: boolean; compactPaise?: boolean } = {},
): string {
  if (minor === null || minor === undefined) return "—";
  const { showSign = false, compactPaise = true } = options;

  const negative = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const hasFraction = abs % MINOR_UNITS_PER_MAJOR !== 0;
  const digits = compactPaise && !hasFraction ? 0 : 2;

  const body = numberFormatter(currency.locale ?? "en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(abs / MINOR_UNITS_PER_MAJOR);

  const sign = negative ? "−" : showSign && minor > 0 ? "+" : "";
  return `${sign}${currency.symbol}${body}`;
}

/** Abbreviated money for chart axes and dense KPI tiles: ₹1.2L, ₹45.0k. */
export function formatMoneyCompact(
  minor: Minor | null | undefined,
  currency: CurrencyConfig = DEFAULT_CURRENCY,
): string {
  if (minor === null || minor === undefined) return "—";
  const negative = minor < 0;
  const major = Math.abs(minor) / MINOR_UNITS_PER_MAJOR;
  const sign = negative ? "−" : "";

  // Indian numbering uses lakh/crore; other locales use k/M.
  if (currency.code === "INR") {
    if (major >= 10_000_000) return `${sign}${currency.symbol}${(major / 10_000_000).toFixed(2)}Cr`;
    if (major >= 100_000) return `${sign}${currency.symbol}${(major / 100_000).toFixed(2)}L`;
    if (major >= 1_000) return `${sign}${currency.symbol}${(major / 1_000).toFixed(1)}k`;
    return `${sign}${currency.symbol}${major.toFixed(major % 1 === 0 ? 0 : 2)}`;
  }
  if (major >= 1_000_000) return `${sign}${currency.symbol}${(major / 1_000_000).toFixed(2)}M`;
  if (major >= 1_000) return `${sign}${currency.symbol}${(major / 1_000).toFixed(1)}k`;
  return `${sign}${currency.symbol}${major.toFixed(major % 1 === 0 ? 0 : 2)}`;
}

export function formatPercent(
  value: number | null | undefined,
  options: { showSign?: boolean; digits?: number } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const { showSign = false, digits = value % 1 === 0 ? 0 : 2 } = options;
  const sign = value < 0 ? "−" : showSign && value > 0 ? "+" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}%`;
}

export function formatQuantity(
  value: number | null | undefined,
  locale = "en-IN",
): string {
  if (value === null || value === undefined) return "—";
  return numberFormatter(locale, { maximumFractionDigits: 0 }).format(value);
}

export function pluralise(count: number, singular: string, plural?: string): string {
  return count === 1 ? singular : (plural ?? `${singular}s`);
}

// ---------------------------------------------------------------------------
// Dates — always rendered in the shop's timezone
// ---------------------------------------------------------------------------

/**
 * A "YYYY-MM-DD" string is a calendar date with no time and no zone. Parsing it
 * with `new Date()` would drag it into the runtime's timezone and can shift the
 * day, so it is parsed as UTC noon and always formatted with timeZone: "UTC".
 */
function calendarDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12));
}

const DATE_STYLES = {
  short: { day: "2-digit", month: "short" },
  medium: { day: "2-digit", month: "short", year: "numeric" },
  long: { weekday: "long", day: "numeric", month: "long", year: "numeric" },
  monthYear: { month: "long", year: "numeric" },
  monthShort: { month: "short" },
} satisfies Record<string, Intl.DateTimeFormatOptions>;

export type DateStyle = keyof typeof DATE_STYLES;

/** Format a calendar date ("2026-04-11"). Timezone-neutral by construction. */
export function formatDate(
  isoDate: string | null | undefined,
  style: DateStyle = "medium",
  locale = "en-IN",
): string {
  if (!isoDate) return "—";
  return new Intl.DateTimeFormat(locale, { ...DATE_STYLES[style], timeZone: "UTC" }).format(
    calendarDate(isoDate.slice(0, 10)),
  );
}

/** Format an instant (timestamptz) in the shop's timezone. */
export function formatDateTime(
  isoTimestamp: string | null | undefined,
  timezone: string,
  options: { withSeconds?: boolean; dateStyle?: DateStyle } = {},
  locale = "en-IN",
): string {
  if (!isoTimestamp) return "—";
  const { withSeconds = false, dateStyle = "medium" } = options;
  return new Intl.DateTimeFormat(locale, {
    ...DATE_STYLES[dateStyle],
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    timeZone: timezone,
  }).format(new Date(isoTimestamp));
}

/** Just the clock time, in the shop's timezone. */
export function formatTime(
  isoTimestamp: string | null | undefined,
  timezone: string,
  locale = "en-IN",
): string {
  if (!isoTimestamp) return "—";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(isoTimestamp));
}

/** "Today", "Yesterday", or a date — relative to the shop's today. */
export function formatRelativeDay(
  isoDate: string,
  shopToday: string,
  locale = "en-IN",
): string {
  const date = isoDate.slice(0, 10);
  if (date === shopToday) return "Today";

  const yesterday = addDays(shopToday, -1);
  if (date === yesterday) return "Yesterday";

  const tomorrow = addDays(shopToday, 1);
  if (date === tomorrow) return "Tomorrow";

  return formatDate(date, "medium", locale);
}

// ---------------------------------------------------------------------------
// Calendar arithmetic on "YYYY-MM-DD" strings (no Date objects, no drift)
// ---------------------------------------------------------------------------

export function addDays(isoDate: string, days: number): string {
  const d = calendarDate(isoDate);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  const from = calendarDate(fromIso).getTime();
  const to = calendarDate(toIso).getTime();
  return Math.round((to - from) / 86_400_000);
}

export function startOfMonth(isoDate: string): string {
  return `${isoDate.slice(0, 7)}-01`;
}

export function endOfMonth(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number);
  const d = new Date(Date.UTC(y ?? 1970, m ?? 1, 0, 12)); // day 0 = last of previous
  return d.toISOString().slice(0, 10);
}

export function monthLabel(isoMonth: string, locale = "en-IN"): string {
  return formatDate(isoMonth, "monthYear", locale);
}

export function shortMonthLabel(isoMonth: string, locale = "en-IN"): string {
  return formatDate(isoMonth, "monthShort", locale);
}

/** Extract "YYYY-MM-DD" for an instant, in a given timezone. */
export function localDateOf(isoTimestamp: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: timezone,
  }).format(new Date(isoTimestamp));
  return parts; // en-CA yields YYYY-MM-DD
}

/** Today, in the shop's timezone. Used only for form defaults. */
export function todayIn(timezone: string): string {
  return localDateOf(new Date().toISOString(), timezone);
}
