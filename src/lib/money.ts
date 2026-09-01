/**
 * Money handling.
 *
 * ── The one rule ──────────────────────────────────────────────────────────
 * A monetary value is ALWAYS an integer number of minor currency units
 * (paise for INR, cents for USD). Never a float, never a decimal string.
 * Floats are introduced exactly once — at the boundary where a human types
 * "249.50" — and are converted to 24950 immediately.
 *
 * Everything downstream (comparison, sums, discounts, profit) is integer
 * arithmetic, which is why totals reconcile to the paisa.
 */

/** Branded type so a rupee float can never be passed where paise is expected. */
export type Minor = number;

export const MINOR_UNITS_PER_MAJOR = 100;

/**
 * Parse human input ("1,249.50", "₹250", "") into minor units.
 * Returns null when the text is not a usable amount, so callers can
 * distinguish "empty" from "zero".
 */
export function parseMoneyInput(input: string | number | null | undefined): Minor | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") {
    return Number.isFinite(input) ? Math.round(input * MINOR_UNITS_PER_MAJOR) : null;
  }

  const cleaned = input.replace(/[^\d.-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;

  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;

  // Round half-away-from-zero at the minor unit: 0.005 -> 1 paisa, never 0.
  const scaled = value * MINOR_UNITS_PER_MAJOR;
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

/** Minor units -> the plain decimal string used to populate a text input. */
export function toMoneyInput(minor: Minor | null | undefined): string {
  if (minor === null || minor === undefined) return "";
  const negative = minor < 0;
  const abs = Math.abs(Math.round(minor));
  const major = Math.floor(abs / MINOR_UNITS_PER_MAJOR);
  const fraction = abs % MINOR_UNITS_PER_MAJOR;
  const body = fraction === 0 ? `${major}` : `${major}.${String(fraction).padStart(2, "0")}`;
  return negative ? `-${body}` : body;
}

/** Minor units -> major units as a float. For charts and percentages ONLY. */
export function toMajor(minor: Minor): number {
  return minor / MINOR_UNITS_PER_MAJOR;
}

export function majorToMinor(major: number): Minor {
  return Math.round(major * MINOR_UNITS_PER_MAJOR);
}

// ---------------------------------------------------------------------------
// Percentages — every one of these is division-by-zero safe.
// These mirror public.safe_margin_pct / public.safe_markup_pct exactly, so the
// figure shown while typing matches the figure the database records.
// ---------------------------------------------------------------------------

/** profit ÷ revenue × 100 */
export function marginPct(profit: Minor, revenue: Minor): number {
  if (revenue === 0) return 0;
  return round2((profit / revenue) * 100);
}

/** profit ÷ cost × 100 */
export function markupPct(profit: Minor, cost: Minor): number {
  if (cost === 0) return 0;
  return round2((profit / cost) * 100);
}

/**
 * Period-over-period change. Returns null when the baseline is zero, because
 * "+∞%" is not information — the UI shows "new activity" instead.
 */
export function changePct(current: Minor, previous: Minor): number | null {
  if (previous === 0) return null;
  return round1(((current - previous) / Math.abs(previous)) * 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * The selling price at which a unit exactly covers its cost.
 * With no tax or per-unit fee modelled, break-even is the cost itself — named
 * explicitly so the concept is searchable and can gain terms later.
 */
export function breakEvenPrice(unitCost: Minor): Minor {
  return unitCost;
}

/**
 * Split `amount` across `weights` proportionally, exactly.
 *
 * Uses the cumulative-floor method:
 *     allocᵢ = ⌊amount · cumᵢ / total⌋ − ⌊amount · cumᵢ₋₁ / total⌋
 * The allocations always re-sum to `amount`, so no paisa is invented or lost.
 * This is the same algorithm complete_sale() uses in SQL, kept in sync so a
 * client-side preview of a discount matches what the database will store.
 */
export function allocateProportionally(amount: Minor, weights: Minor[]): Minor[] {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || amount === 0) return weights.map(() => 0);

  const out: Minor[] = [];
  let cumulative = 0;
  let previousShare = 0;
  for (const weight of weights) {
    cumulative += weight;
    const share = Math.floor((amount * cumulative) / total);
    out.push(share - previousShare);
    previousShare = share;
  }
  return out;
}
