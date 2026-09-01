import type { PriceStatus } from "@/lib/supabase/database.types";
import {
  breakEvenPrice,
  marginPct,
  markupPct,
  type Minor,
} from "@/lib/money";

/**
 * Selling-price analysis — the feature this whole product exists for.
 *
 * `resolvePriceStatus` is a deliberate, exact mirror of the SQL function
 * `public.price_status`. It runs on every keystroke in the price simulator so
 * the owner sees the verdict instantly, and because the two implementations
 * agree, the badge shown while typing is the same verdict the database will
 * enforce at checkout. If one changes, the other must change with it.
 */
export function resolvePriceStatus(
  price: Minor,
  cost: Minor | null | undefined,
  lowMarginThreshold: number,
): PriceStatus {
  if (cost === null || cost === undefined) return "unknown";
  if (price < cost) return "loss";
  if (price === cost) return "breakeven";
  // price > cost >= 0 implies price > 0, so the division is safe.
  const margin = ((price - cost) / price) * 100;
  return margin <= lowMarginThreshold ? "low_profit" : "profit";
}

export interface PriceStatusMeta {
  status: PriceStatus;
  /** Always shown as text — colour is never the only signal. */
  label: string;
  description: string;
  /** Token-based classes; no arbitrary colours. */
  text: string;
  bg: string;
  border: string;
  /** Solid fill for emphatic states. */
  solid: string;
  chartColor: string;
}

export const PRICE_STATUS_META: Record<PriceStatus, PriceStatusMeta> = {
  profit: {
    status: "profit",
    label: "PROFIT",
    description: "Healthy margin above cost.",
    text: "text-profit",
    bg: "bg-profit-soft",
    border: "border-profit-border",
    solid: "bg-profit text-on-accent",
    chartColor: "var(--profit)",
  },
  low_profit: {
    status: "low_profit",
    label: "LOW PROFIT",
    description: "Above cost, but the margin is thin.",
    text: "text-lowprofit",
    bg: "bg-lowprofit-soft",
    border: "border-lowprofit-border",
    solid: "bg-lowprofit text-on-accent",
    chartColor: "var(--low-profit)",
  },
  breakeven: {
    status: "breakeven",
    label: "BREAK-EVEN",
    description: "This price exactly covers the purchase cost.",
    text: "text-breakeven-strong",
    bg: "bg-breakeven-soft",
    border: "border-breakeven-border",
    solid: "bg-breakeven text-on-accent",
    chartColor: "var(--breakeven)",
  },
  loss: {
    status: "loss",
    label: "LOSS",
    description: "This price is below what you paid.",
    text: "text-loss",
    bg: "bg-loss-soft",
    border: "border-loss-border",
    solid: "bg-loss text-on-accent",
    chartColor: "var(--loss)",
  },
  unknown: {
    status: "unknown",
    label: "NO COST YET",
    description: "Record a purchase so profit can be calculated.",
    text: "text-muted",
    bg: "bg-surface-sunken",
    border: "border-line",
    solid: "bg-breakeven text-on-accent",
    chartColor: "var(--breakeven)",
  },
};

export interface PriceAnalysisInput {
  /** The price being simulated or entered. */
  sellingPrice: Minor;
  /** Cost of the batch FIFO will consume next — the cost that actually applies. */
  fifoUnitCost: Minor | null;
  recommendedPrice: Minor;
  minimumPrice: Minor;
  quantityOnHand: number;
  /** Σ(remaining qty × that batch's unit cost) across every open batch. */
  inventoryCost: Minor;
  /** Dearest cost still on the shelf, for the per-batch warning. */
  maxOpenBatchCost: Minor | null;
  lowMarginThreshold: number;
  targetMargin?: number;
}

export interface PriceAnalysis {
  status: PriceStatus;
  meta: PriceStatusMeta;

  sellingPrice: Minor;
  unitCost: Minor | null;
  recommendedPrice: Minor;
  minimumPrice: Minor;
  breakEvenPrice: Minor | null;

  /** selling price − purchase cost */
  unitProfit: Minor;
  /** profit ÷ selling price × 100 */
  marginPct: number;
  /** profit ÷ purchase cost × 100 */
  markupPct: number;

  quantityOnHand: number;
  inventoryCost: Minor;
  /** selling price × remaining quantity */
  projectedRevenue: Minor;
  /** projected revenue − remaining inventory cost */
  projectedGrossProfit: Minor;
  projectedMarginPct: number;

  warnings: PriceWarning[];
  /** True when saving/selling at this price needs a deliberate confirmation. */
  requiresConfirmation: boolean;
}

export type PriceWarningLevel = "info" | "caution" | "danger";

export interface PriceWarning {
  id:
    | "below_recommended"
    | "below_minimum"
    | "at_cost"
    | "below_cost"
    | "below_some_batch"
    | "below_target_margin"
    | "no_cost";
  level: PriceWarningLevel;
  title: string;
  detail: string;
}

/**
 * The complete picture for one product at one price.
 *
 * Note that projected profit uses the *sum of each batch's remaining quantity ×
 * that batch's own unit cost* — not the latest cost and not an average — which
 * is why a holding bought at two different prices reports the truth.
 */
export function analysePrice(input: PriceAnalysisInput): PriceAnalysis {
  const {
    sellingPrice,
    fifoUnitCost,
    recommendedPrice,
    minimumPrice,
    quantityOnHand,
    inventoryCost,
    maxOpenBatchCost,
    lowMarginThreshold,
    targetMargin,
  } = input;

  const status = resolvePriceStatus(sellingPrice, fifoUnitCost, lowMarginThreshold);
  const unitProfit = fifoUnitCost === null ? 0 : sellingPrice - fifoUnitCost;

  const projectedRevenue = sellingPrice * quantityOnHand;
  const projectedGrossProfit = projectedRevenue - inventoryCost;

  const warnings: PriceWarning[] = [];

  if (fifoUnitCost === null) {
    warnings.push({
      id: "no_cost",
      level: "info",
      title: "No purchase cost recorded yet",
      detail:
        "Record a purchase for this product and Aurelia can tell you whether this price earns money.",
    });
  } else if (sellingPrice < fifoUnitCost) {
    warnings.push({
      id: "below_cost",
      level: "danger",
      title: "Below your purchase cost",
      detail: `You paid more than this per unit. Every unit sold at this price loses money.`,
    });
  } else if (sellingPrice === fifoUnitCost) {
    warnings.push({
      id: "at_cost",
      level: "danger",
      title: "Exactly your purchase cost",
      detail: "This price returns your money and nothing more.",
    });
  }

  if (minimumPrice > 0 && sellingPrice < minimumPrice) {
    warnings.push({
      id: "below_minimum",
      level: "danger",
      title: "Below your minimum price",
      detail: "You set a floor price for this product and this is under it.",
    });
  } else if (recommendedPrice > 0 && sellingPrice < recommendedPrice) {
    warnings.push({
      id: "below_recommended",
      level: "caution",
      title: "Below your recommended price",
      detail: "Still above your floor, but you are giving up margin.",
    });
  }

  // The blended result can look fine while an expensive batch quietly loses.
  if (
    maxOpenBatchCost !== null &&
    sellingPrice < maxOpenBatchCost &&
    (fifoUnitCost === null || sellingPrice >= fifoUnitCost)
  ) {
    warnings.push({
      id: "below_some_batch",
      level: "caution",
      title: "One purchase batch costs more than this",
      detail:
        "Overall this price is profitable, but the units from your dearest batch would sell at a loss.",
    });
  }

  if (
    status === "profit" &&
    targetMargin !== undefined &&
    sellingPrice > 0 &&
    marginPct(unitProfit, sellingPrice) < targetMargin
  ) {
    warnings.push({
      id: "below_target_margin",
      level: "info",
      title: `Under your ${targetMargin}% target margin`,
      detail: "Profitable, but not as profitable as you planned for.",
    });
  }

  return {
    status,
    meta: PRICE_STATUS_META[status],
    sellingPrice,
    unitCost: fifoUnitCost,
    recommendedPrice,
    minimumPrice,
    breakEvenPrice: fifoUnitCost === null ? null : breakEvenPrice(fifoUnitCost),
    unitProfit,
    marginPct: marginPct(unitProfit, sellingPrice),
    markupPct: fifoUnitCost === null ? 0 : markupPct(unitProfit, fifoUnitCost),
    quantityOnHand,
    inventoryCost,
    projectedRevenue,
    projectedGrossProfit,
    projectedMarginPct: marginPct(projectedGrossProfit, projectedRevenue),
    warnings,
    requiresConfirmation: status === "loss" || status === "breakeven",
  };
}

export interface BatchProfitability {
  batchId: string;
  purchaseDate: string;
  unitCost: Minor;
  quantityRemaining: number;
  status: PriceStatus;
  unitProfit: Minor;
  marginPct: number;
  remainingCost: Minor;
  projectedRevenue: Minor;
  projectedProfit: Minor;
}

/** Per-batch verdict at a given selling price, so a dear batch cannot hide. */
export function analyseBatches(
  batches: Array<{
    id: string;
    purchase_date: string;
    unit_cost: Minor;
    quantity_remaining: number;
  }>,
  sellingPrice: Minor,
  lowMarginThreshold: number,
): BatchProfitability[] {
  return batches.map((batch) => {
    const unitProfit = sellingPrice - batch.unit_cost;
    const projectedRevenue = sellingPrice * batch.quantity_remaining;
    const remainingCost = batch.unit_cost * batch.quantity_remaining;
    return {
      batchId: batch.id,
      purchaseDate: batch.purchase_date,
      unitCost: batch.unit_cost,
      quantityRemaining: batch.quantity_remaining,
      status: resolvePriceStatus(sellingPrice, batch.unit_cost, lowMarginThreshold),
      unitProfit,
      marginPct: marginPct(unitProfit, sellingPrice),
      remainingCost,
      projectedRevenue,
      projectedProfit: projectedRevenue - remainingCost,
    };
  });
}

// ---------------------------------------------------------------------------
// Net (period) status — for P&L headlines
// ---------------------------------------------------------------------------

export interface NetStatusMeta {
  label: string;
  text: string;
  bg: string;
  border: string;
  solid: string;
}

export function netStatusMeta(netProfit: Minor): NetStatusMeta {
  if (netProfit > 0) {
    return {
      label: "NET PROFIT",
      text: "text-profit",
      bg: "bg-profit-soft",
      border: "border-profit-border",
      solid: "bg-profit text-on-accent",
    };
  }
  if (netProfit < 0) {
    return {
      label: "NET LOSS",
      text: "text-loss",
      bg: "bg-loss-soft",
      border: "border-loss-border",
      solid: "bg-loss text-on-accent",
    };
  }
  return {
    label: "BREAK-EVEN",
    text: "text-breakeven-strong",
    bg: "bg-breakeven-soft",
    border: "border-breakeven-border",
    solid: "bg-breakeven text-on-accent",
  };
}

/** Tone for any signed figure: profit green, loss red, zero neutral. */
export function amountTone(value: Minor): string {
  if (value > 0) return "text-profit";
  if (value < 0) return "text-loss";
  return "text-muted";
}
