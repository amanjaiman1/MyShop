import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  HelpCircle,
  MinusCircle,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SALE_STATUS_LABELS, SALE_STATUS_TONE } from "@/lib/constants";
import { PRICE_STATUS_META } from "@/lib/pricing";
import type { PriceStatus, SaleStatus } from "@/lib/supabase/database.types";
import type { Minor } from "@/lib/money";
import { cn } from "@/lib/utils";

const PRICE_STATUS_ICON: Record<PriceStatus, typeof CheckCircle2> = {
  profit: CheckCircle2,
  low_profit: AlertTriangle,
  breakeven: MinusCircle,
  loss: TrendingDown,
  unknown: HelpCircle,
};

const PRICE_STATUS_VARIANT = {
  profit: "profit",
  low_profit: "lowProfit",
  breakeven: "breakeven",
  loss: "loss",
  unknown: "neutral",
} as const;

/**
 * PROFIT / LOW PROFIT / BREAK-EVEN / LOSS.
 * Colour, an icon AND the word — never colour alone, so the meaning survives
 * colour-blindness, bright sunlight and a cheap phone screen.
 */
export function PriceStatusBadge({
  status,
  size = "default",
  className,
  emphatic = false,
}: {
  status: PriceStatus;
  size?: "sm" | "default" | "lg";
  className?: string;
  /** Solid fill — used for the loss state where prominence matters. */
  emphatic?: boolean;
}) {
  const meta = PRICE_STATUS_META[status];
  const Icon = PRICE_STATUS_ICON[status];

  return (
    <Badge
      status
      size={size}
      variant={emphatic && status === "loss" ? "solidLoss" : PRICE_STATUS_VARIANT[status]}
      className={className}
      title={meta.description}
    >
      <Icon aria-hidden />
      {meta.label}
    </Badge>
  );
}

export function SaleStatusBadge({
  status,
  size = "default",
  className,
}: {
  status: SaleStatus;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  return (
    <Badge
      size={size}
      className={cn("border font-medium", SALE_STATUS_TONE[status], className)}
    >
      {SALE_STATUS_LABELS[status]}
    </Badge>
  );
}

/** NET PROFIT / BREAK-EVEN / NET LOSS for a reporting period. */
export function NetStatusBadge({
  netProfit,
  size = "default",
  className,
}: {
  netProfit: Minor;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  if (netProfit > 0) {
    return (
      <Badge status size={size} variant="profit" className={className}>
        <TrendingUp aria-hidden />
        NET PROFIT
      </Badge>
    );
  }
  if (netProfit < 0) {
    return (
      <Badge status size={size} variant="solidLoss" className={className}>
        <TrendingDown aria-hidden />
        NET LOSS
      </Badge>
    );
  }
  return (
    <Badge status size={size} variant="breakeven" className={className}>
      <MinusCircle aria-hidden />
      BREAK-EVEN
    </Badge>
  );
}

const STOCK_META = {
  in_stock: { label: "In stock", variant: "profit" as const },
  low_stock: { label: "Low stock", variant: "lowProfit" as const },
  out_of_stock: { label: "Out of stock", variant: "loss" as const },
};

export function StockStatusBadge({
  status,
  quantity,
  size = "sm",
  className,
}: {
  status: keyof typeof STOCK_META;
  quantity?: number;
  size?: "sm" | "default" | "lg";
  className?: string;
}) {
  const meta = STOCK_META[status];
  return (
    <Badge size={size} variant={meta.variant} className={className}>
      <CircleDollarSign className="hidden" aria-hidden />
      {quantity !== undefined && status !== "out_of_stock"
        ? `${quantity} in stock`
        : meta.label}
    </Badge>
  );
}
