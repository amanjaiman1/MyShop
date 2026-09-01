"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { Card, cardVariants } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "profit" | "lowProfit" | "breakeven" | "loss" | "gold";

const TONE_STYLES: Record<Tone, { icon: string; ring: string }> = {
  default: { icon: "bg-surface-sunken text-muted", ring: "border-line" },
  primary: { icon: "bg-primary-soft text-primary", ring: "border-line-accent" },
  profit: { icon: "bg-profit-soft text-profit", ring: "border-profit-border" },
  lowProfit: { icon: "bg-lowprofit-soft text-lowprofit", ring: "border-lowprofit-border" },
  breakeven: {
    icon: "bg-breakeven-soft text-breakeven-strong",
    ring: "border-breakeven-border",
  },
  loss: { icon: "bg-loss-soft text-loss", ring: "border-loss-border" },
  gold: { icon: "bg-gold-soft text-gold", ring: "border-[--gold-soft]" },
};

/**
 * KPI tile. The whole card becomes a link when `href` is given, which is how
 * every dashboard warning opens its filtered list.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  href,
  footer,
  className,
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  href?: string;
  footer?: React.ReactNode;
  className?: string;
  /** Larger figure, for the two or three headline numbers on a screen. */
  emphasis?: boolean;
}) {
  const styles = TONE_STYLES[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[0.6875rem] font-semibold tracking-[0.08em] uppercase text-subtle">
          {label}
        </p>
        {Icon ? (
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-[--radius-sm]",
              styles.icon,
            )}
          >
            <Icon className="size-4" strokeWidth={1.75} aria-hidden />
          </span>
        ) : null}
      </div>

      <div
        className={cn(
          "mt-2.5 tnum leading-none font-semibold tracking-[-0.02em] text-ink-strong",
          emphasis ? "text-[1.75rem] sm:text-[2rem]" : "text-xl sm:text-[1.375rem]",
        )}
      >
        {value}
      </div>

      {hint ? <div className="mt-2 text-xs leading-relaxed text-muted">{hint}</div> : null}
      {footer ? <div className="mt-3">{footer}</div> : null}

      {href ? (
        <ArrowUpRight
          className="absolute right-4 bottom-4 size-4 text-subtle opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      ) : null}
    </>
  );

  const classes = cn(
    "group relative flex flex-col p-4 sm:p-5",
    styles.ring,
    href && "cursor-pointer transition-shadow hover:shadow-md",
    className,
  );

  if (href) {
    // The whole tile is the link target — a warning card should never require
    // hunting for a small "view" affordance.
    return (
      <Link
        href={href}
        className={cn(
          cardVariants({ tone: "default" }),
          classes,
          "outline-none focus-visible:ring-2 focus-visible:ring-[--primary-ring] focus-visible:ring-offset-2",
        )}
      >
        {body}
      </Link>
    );
  }

  return <Card className={classes}>{body}</Card>;
}

export function StatCardSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("flex flex-col p-4 sm:p-5", className)}>
      <div className="flex items-start justify-between gap-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="size-8 rounded-[--radius-sm]" />
      </div>
      <Skeleton className="mt-3 h-7 w-32" />
      <Skeleton className="mt-3 h-3 w-40" />
    </Card>
  );
}

/**
 * A row in a small key/value ledger — the P&L waterfall, order summaries, etc.
 * `emphasis` marks the subtotal lines that carry a top rule.
 */
export function LedgerRow({
  label,
  value,
  hint,
  emphasis = false,
  tone,
  indent = false,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  emphasis?: boolean;
  tone?: "profit" | "loss" | "muted";
  indent?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-2",
        emphasis && "mt-1 border-t border-line pt-3",
        className,
      )}
    >
      <div className={cn("min-w-0", indent && "pl-4")}>
        <span
          className={cn(
            emphasis ? "text-sm font-semibold text-ink-strong" : "text-sm text-muted",
          )}
        >
          {label}
        </span>
        {hint ? <p className="text-[0.6875rem] leading-snug text-subtle">{hint}</p> : null}
      </div>
      <span
        className={cn(
          "tnum shrink-0 tabular-nums",
          emphasis ? "text-base font-semibold" : "text-sm font-medium",
          tone === "profit" && "text-profit",
          tone === "loss" && "text-loss",
          tone === "muted" && "text-muted",
          !tone && "text-ink",
        )}
      >
        {value}
      </span>
    </div>
  );
}
