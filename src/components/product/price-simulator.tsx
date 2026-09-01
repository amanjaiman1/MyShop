"use client";

import * as React from "react";
import {
  AlertTriangle,
  Info,
  Sparkles,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Money, Figure } from "@/components/common/money";
import { PriceStatusBadge } from "@/components/common/status-badge";
import { MoneyInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useShop } from "@/components/providers/shop-provider";
import { analysePrice, type PriceWarning } from "@/lib/pricing";
import { formatPercent } from "@/lib/format";
import { parseMoneyInput, toMoneyInput, type Minor } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The price simulator — the reason Aurelia exists.
 *
 * The owner types a selling price and, on every keystroke, sees whether it makes
 * a profit, a thin profit, breaks even, or loses money — against the FIFO cost,
 * with a projection across all remaining stock. Nothing is saved here; a value
 * can be explored freely and only persisted by an explicit action elsewhere.
 *
 * `resolvePriceStatus` inside `analysePrice` mirrors the SQL `price_status`
 * exactly, so this preview always agrees with what the database will enforce.
 */
export interface PriceSimulatorProps {
  fifoUnitCost: Minor | null;
  recommendedPrice: Minor;
  minimumPrice: Minor;
  quantityOnHand: number;
  inventoryCost: Minor;
  maxOpenBatchCost: Minor | null;
  /** Controlled value (minor units) when embedded in a form. */
  value?: Minor;
  onChange?: (value: Minor) => void;
  /** Compact layout for a checkout row; full layout for the product page. */
  variant?: "full" | "compact";
  label?: string;
  autoFocus?: boolean;
}

export function PriceSimulator({
  fifoUnitCost,
  recommendedPrice,
  minimumPrice,
  quantityOnHand,
  inventoryCost,
  maxOpenBatchCost,
  value,
  onChange,
  variant = "full",
  label = "Selling price to simulate",
  autoFocus = false,
}: PriceSimulatorProps) {
  const { currency, lowMarginThreshold, targetMargin } = useShop();

  // Uncontrolled fallback seeds from the recommended price.
  const [internal, setInternal] = React.useState<Minor>(value ?? recommendedPrice);
  const price = value ?? internal;
  const [text, setText] = React.useState<string>(toMoneyInput(price));

  // Keep the text field in step when a parent changes the controlled value
  // (e.g. a "use recommended" quick action), without fighting the user's typing.
  React.useEffect(() => {
    if (value !== undefined) setText(toMoneyInput(value));
  }, [value]);

  const analysis = React.useMemo(
    () =>
      analysePrice({
        sellingPrice: price,
        fifoUnitCost,
        recommendedPrice,
        minimumPrice,
        quantityOnHand,
        inventoryCost,
        maxOpenBatchCost,
        lowMarginThreshold,
        targetMargin,
      }),
    [
      price,
      fifoUnitCost,
      recommendedPrice,
      minimumPrice,
      quantityOnHand,
      inventoryCost,
      maxOpenBatchCost,
      lowMarginThreshold,
      targetMargin,
    ],
  );

  function commit(raw: string) {
    setText(raw);
    const parsed = parseMoneyInput(raw) ?? 0;
    if (value === undefined) setInternal(parsed);
    onChange?.(parsed);
  }

  return (
    <div
      className={cn(
        "rounded-[--radius-lg] border transition-colors",
        analysis.meta.border,
        analysis.meta.bg,
      )}
    >
      <div className={cn("space-y-4", variant === "compact" ? "p-4" : "p-5")}>
        {/* Input + verdict */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="price-sim" className="text-ink">
              {label}
            </Label>
            <MoneyInput
              id="price-sim"
              currencySymbol={currency.symbol}
              emphasis={variant === "full"}
              value={text}
              onChange={(e) => commit(e.target.value)}
              autoFocus={autoFocus}
              className="bg-surface"
            />
          </div>
          <div className="flex items-center gap-2">
            <PriceStatusBadge status={analysis.status} size="lg" emphatic />
          </div>
        </div>

        {/* Headline earning */}
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          {analysis.unitCost === null ? (
            <p className="text-sm text-muted">
              Record a purchase to see profit for this product.
            </p>
          ) : (
            <>
              <span className="text-sm text-muted">You earn</span>
              <Money
                value={analysis.unitProfit}
                size="lg"
                tone
                showSign
                className="text-lg"
              />
              <span className="text-sm text-muted">per item</span>
              {analysis.unitProfit >= 0 ? (
                <TrendingUp className="size-4 text-profit" aria-hidden />
              ) : (
                <TrendingDown className="size-4 text-loss" aria-hidden />
              )}
            </>
          )}
        </div>

        {/* Metric grid */}
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-line/60 pt-4 sm:grid-cols-4">
          <Figure label="Purchase cost">
            <Money value={analysis.unitCost} />
          </Figure>
          <Figure label="Margin">
            <span className="tnum">{formatPercent(analysis.marginPct)}</span>
          </Figure>
          <Figure label="Markup">
            <span className="tnum">{formatPercent(analysis.markupPct)}</span>
          </Figure>
          <Figure label="Break-even">
            <Money value={analysis.breakEvenPrice} />
          </Figure>
        </div>

        {/* Projection across current stock */}
        {quantityOnHand > 0 ? (
          <div className="rounded-[--radius-md] border border-line/60 bg-surface/70 p-3.5">
            <div className="mb-2 flex items-center gap-1.5">
              <Sparkles className="size-3.5 text-primary" aria-hidden />
              <p className="text-[0.6875rem] font-semibold tracking-[0.08em] uppercase text-subtle">
                If you sell all {quantityOnHand} in stock at this price
              </p>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              <Figure label="Projected revenue">
                <Money value={analysis.projectedRevenue} />
              </Figure>
              <Figure label="Inventory cost">
                <Money value={analysis.inventoryCost} />
              </Figure>
              <Figure label="Projected profit">
                <span className="inline-flex items-baseline gap-1.5">
                  <Money value={analysis.projectedGrossProfit} tone showSign className="font-semibold" />
                  <span className="tnum text-xs text-muted">
                    {formatPercent(analysis.projectedMarginPct)}
                  </span>
                </span>
              </Figure>
            </div>
          </div>
        ) : null}

        {/* Warnings */}
        {analysis.warnings.length > 0 ? (
          <ul className="space-y-2">
            {analysis.warnings.map((warning) => (
              <WarningRow key={warning.id} warning={warning} />
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}

function WarningRow({ warning }: { warning: PriceWarning }) {
  const styles =
    warning.level === "danger"
      ? { box: "border-loss-border bg-loss-soft", icon: "text-loss", title: "text-loss" }
      : warning.level === "caution"
        ? {
            box: "border-lowprofit-border bg-lowprofit-soft",
            icon: "text-lowprofit",
            title: "text-lowprofit",
          }
        : { box: "border-line-accent bg-primary-soft", icon: "text-primary", title: "text-primary" };

  const Icon = warning.level === "info" ? Info : AlertTriangle;

  return (
    <li className={cn("flex items-start gap-2.5 rounded-[--radius-sm] border px-3 py-2.5", styles.box)}>
      <Icon className={cn("mt-0.5 size-4 shrink-0", styles.icon)} aria-hidden />
      <div className="min-w-0">
        <p className={cn("text-sm font-medium", styles.title)}>{warning.title}</p>
        <p className="text-xs leading-relaxed text-muted">{warning.detail}</p>
      </div>
    </li>
  );
}
