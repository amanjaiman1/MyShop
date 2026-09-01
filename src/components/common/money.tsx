"use client";

import * as React from "react";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { useShop } from "@/components/providers/shop-provider";
import { formatMoney, formatMoneyCompact, formatPercent } from "@/lib/format";
import type { Minor } from "@/lib/money";
import { amountTone } from "@/lib/pricing";
import { cn } from "@/lib/utils";

/**
 * Currency display. Reads the shop's currency from context so a change in
 * Settings reformats every figure in the app at once.
 */
export function Money({
  value,
  className,
  showSign = false,
  compact = false,
  tone = false,
  size = "default",
}: {
  value: Minor | null | undefined;
  className?: string;
  showSign?: boolean;
  /** Abbreviate (₹1.2L) — for chart axes and dense tiles. */
  compact?: boolean;
  /** Colour by sign: profit green / loss red. */
  tone?: boolean;
  size?: "sm" | "default" | "lg" | "xl" | "hero";
}) {
  const { currency } = useShop();

  const sizes = {
    sm: "text-xs",
    default: "text-sm",
    lg: "text-base font-semibold",
    xl: "text-xl font-semibold tracking-[-0.015em]",
    hero: "text-3xl font-semibold tracking-[-0.02em] sm:text-4xl",
  } as const;

  return (
    <span
      className={cn(
        "tnum",
        sizes[size],
        tone && value !== null && value !== undefined ? amountTone(value) : undefined,
        className,
      )}
    >
      {compact
        ? formatMoneyCompact(value, currency)
        : formatMoney(value, currency, { showSign })}
    </span>
  );
}

/**
 * A period-over-period delta. Renders "New activity" instead of a percentage
 * when the baseline was zero, because "+∞%" tells the owner nothing.
 */
export function DeltaPill({
  delta,
  pct,
  className,
  label,
}: {
  delta: Minor;
  pct: number | null;
  className?: string;
  label?: string;
}) {
  const { currency } = useShop();
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus;
  const tone =
    delta > 0
      ? "bg-profit-soft text-profit border-profit-border"
      : delta < 0
        ? "bg-loss-soft text-loss border-loss-border"
        : "bg-breakeven-soft text-breakeven-strong border-breakeven-border";

  const noBaseline = pct === null && delta !== 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-[--radius-pill] border px-2.5 py-1 text-xs font-medium",
        tone,
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      <span className="tnum">
        {formatMoney(delta, currency, { showSign: true })}
        {noBaseline ? (
          <span className="ml-1 font-normal opacity-80">· new</span>
        ) : pct !== null ? (
          <span className="ml-1 font-normal opacity-80">
            ({formatPercent(pct, { showSign: true, digits: 1 })})
          </span>
        ) : null}
      </span>
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}

/** A labelled figure — the workhorse of every summary panel. */
export function Figure({
  label,
  children,
  hint,
  className,
  align = "left",
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  className?: string;
  align?: "left" | "right";
}) {
  return (
    <div className={cn("space-y-0.5", align === "right" && "text-right", className)}>
      <p className="text-[0.6875rem] font-medium tracking-[0.06em] uppercase text-subtle">
        {label}
      </p>
      <div className="text-sm font-medium text-ink">{children}</div>
      {hint ? <p className="text-[0.6875rem] leading-snug text-muted">{hint}</p> : null}
    </div>
  );
}
