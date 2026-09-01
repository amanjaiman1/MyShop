"use client";

import * as React from "react";
import { ChevronDown, Minus, Plus, Trash2 } from "lucide-react";
import { MoneyInput, QuantityInput } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Money } from "@/components/common/money";
import { PriceStatusBadge } from "@/components/common/status-badge";
import { ProductThumb } from "@/components/common/product-thumb";
import { useShop } from "@/components/providers/shop-provider";
import type { CartItem } from "@/lib/cart-store";
import type { PreviewSaleLine } from "@/lib/supabase/database.types";
import { resolvePriceStatus } from "@/lib/pricing";
import { formatMoney, formatPercent } from "@/lib/format";
import { parseMoneyInput, toMoneyInput, marginPct } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * One line in the till. Quantity steppers and a tappable price keep it usable
 * one-handed on a phone; the per-line profit verdict updates as the owner
 * edits, using the authoritative preview from the database when available and a
 * single-cost estimate instantly in between.
 */
export function CartLine({
  item,
  preview,
  onQuantity,
  onPrice,
  onLineDiscount,
  onRemove,
}: {
  item: CartItem;
  preview?: PreviewSaleLine;
  onQuantity: (q: number) => void;
  onPrice: (p: number) => void;
  onLineDiscount: (d: number) => void;
  onRemove: () => void;
}) {
  const { currency, lowMarginThreshold } = useShop();
  const [expanded, setExpanded] = React.useState(false);
  const [priceText, setPriceText] = React.useState(toMoneyInput(item.unitSellingPrice));
  const [discountText, setDiscountText] = React.useState(toMoneyInput(item.lineDiscount));

  // Keep the text field in step when the price changes from outside this input
  // (e.g. the cart is restored, or the same product is scanned again). Adjusting
  // state during render is React's documented pattern for deriving from props —
  // it avoids the extra commit an effect would cause.
  const [syncedPrice, setSyncedPrice] = React.useState(item.unitSellingPrice);
  if (item.unitSellingPrice !== syncedPrice) {
    setSyncedPrice(item.unitSellingPrice);
    setPriceText(toMoneyInput(item.unitSellingPrice));
  }

  // Prefer the DB preview (true multi-batch FIFO cost); fall back to the
  // line's oldest-batch cost for instant feedback while the preview loads.
  const unitCost = preview?.fifo_unit_cost ?? item.fifoUnitCost;
  const lineCost = preview?.line_cost ?? (unitCost ?? 0) * item.quantity;
  const gross = item.unitSellingPrice * item.quantity;
  const lineRevenue = gross - item.lineDiscount;
  const lineProfit = preview ? preview.line_profit - item.lineDiscount : lineRevenue - lineCost;
  const status = preview?.status ?? resolvePriceStatus(item.unitSellingPrice, unitCost, lowMarginThreshold);

  const belowMin = item.minimumPrice > 0 && item.unitSellingPrice < item.minimumPrice;
  const belowRec = item.recommendedPrice > 0 && item.unitSellingPrice < item.recommendedPrice;
  const insufficient = preview?.insufficient_stock ?? item.quantity > item.quantityOnHand;

  return (
    <li className="rounded-[--radius-lg] border border-line bg-surface p-3">
      <div className="flex items-start gap-3">
        <ProductThumb src={item.imageUrl} name={item.name} size="sm" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-strong">{item.name}</p>
          <p className="truncate text-xs text-muted">
            {[item.brand, item.shade].filter(Boolean).join(" · ") || item.internalCode}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <PriceStatusBadge status={status} size="sm" />
            {unitCost !== null ? (
              <span className="text-[0.6875rem] text-muted">
                cost {formatMoney(unitCost, currency)}
              </span>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={onRemove}
          className="flex size-8 items-center justify-center rounded-[--radius-xs] text-muted transition-colors hover:bg-loss-soft hover:text-loss"
          aria-label={`Remove ${item.name}`}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>

      {/* Quantity + price */}
      <div className="mt-3 flex items-center gap-3">
        <div className="flex items-center rounded-[--radius-sm] border border-line-strong bg-surface">
          <button
            type="button"
            onClick={() => onQuantity(Math.max(1, item.quantity - 1))}
            className="flex size-10 items-center justify-center rounded-l-[--radius-sm] text-ink transition-colors hover:bg-surface-sunken disabled:opacity-40"
            disabled={item.quantity <= 1}
            aria-label="Decrease quantity"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <QuantityInput
            value={String(item.quantity)}
            onChange={(e) => onQuantity(Number(e.target.value.replace(/\D/g, "")) || 1)}
            className="h-10 w-12 border-0 shadow-none focus-visible:ring-0"
            aria-label="Quantity"
          />
          <button
            type="button"
            onClick={() => onQuantity(item.quantity + 1)}
            className="flex size-10 items-center justify-center rounded-r-[--radius-sm] text-ink transition-colors hover:bg-surface-sunken"
            aria-label="Increase quantity"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>

        <div className="flex-1">
          <MoneyInput
            currencySymbol={currency.symbol}
            value={priceText}
            onChange={(e) => {
              setPriceText(e.target.value);
              onPrice(parseMoneyInput(e.target.value) ?? 0);
            }}
            aria-label="Unit selling price"
          />
        </div>

        <div className="text-right">
          <Money value={lineRevenue} size="default" className="block font-semibold" />
          <Money value={lineProfit} size="sm" tone showSign className="block" />
        </div>
      </div>

      {/* Warnings */}
      {(belowMin || insufficient || status === "loss" || status === "breakeven") ? (
        <div className="mt-2 space-y-1">
          {insufficient ? (
            <p className="text-xs font-medium text-loss">
              Only {item.quantityOnHand} in stock — reduce the quantity.
            </p>
          ) : null}
          {status === "loss" ? (
            <p className="text-xs font-medium text-loss">Below cost — this line loses money.</p>
          ) : belowMin ? (
            <p className="text-xs font-medium text-loss">
              Below your minimum price of {formatMoney(item.minimumPrice, currency)}.
            </p>
          ) : status === "breakeven" ? (
            <p className="text-xs font-medium text-breakeven-strong">No profit at this price.</p>
          ) : belowRec ? (
            <p className="text-xs text-lowprofit">
              Below recommended {formatMoney(item.recommendedPrice, currency)}.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Expandable line discount + detail */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
      >
        <ChevronDown className={cn("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
        {item.lineDiscount > 0
          ? `Line discount ${formatMoney(item.lineDiscount, currency)}`
          : "Add line discount"}
      </button>
      {expanded ? (
        <div className="mt-2 flex items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Discount on this line</Label>
            <MoneyInput
              currencySymbol={currency.symbol}
              value={discountText}
              onChange={(e) => {
                setDiscountText(e.target.value);
                onLineDiscount(parseMoneyInput(e.target.value) ?? 0);
              }}
              className="w-32"
            />
          </div>
          <p className="pb-2 text-xs text-muted">
            {formatPercent(marginPct(lineProfit, lineRevenue))} margin ·{" "}
            {item.quantity} × {formatMoney(item.unitSellingPrice, currency)}
          </p>
        </div>
      ) : null}
    </li>
  );
}
