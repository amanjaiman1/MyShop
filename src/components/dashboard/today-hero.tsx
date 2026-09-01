"use client";

import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { Money, DeltaPill } from "@/components/common/money";
import { NetStatusBadge } from "@/components/common/status-badge";
import { formatPercent } from "@/lib/format";
import type { DashboardSnapshot } from "@/lib/supabase/database.types";

/**
 * The headline panel: today's realized position, framed against yesterday.
 * Deltas use DeltaPill, which renders "new" instead of a bogus percentage when
 * yesterday was zero.
 */
export function TodayHero({ snapshot }: { snapshot: DashboardSnapshot }) {
  const { today, comparison } = snapshot;

  return (
    <section className="overflow-hidden rounded-[--radius-xl] gradient-primary text-on-accent shadow-[--shadow-primary]">
      <div className="relative p-5 sm:p-7">
        <div
          className="pointer-events-none absolute -top-20 -right-16 size-72 rounded-full opacity-20"
          style={{
            background: "radial-gradient(circle, rgba(255,255,255,0.6) 0%, transparent 65%)",
          }}
          aria-hidden
        />

        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.16em] uppercase text-white/60">
              Today so far
            </p>
            <p className="mt-0.5 text-sm text-white/75">Realized, in your shop&rsquo;s timezone</p>
          </div>
          <NetStatusBadge netProfit={today.net_profit} />
        </div>

        <div className="relative mt-6 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div>
            <p className="text-xs font-medium tracking-wide text-white/60">Net sales</p>
            <div className="mt-1">
              <Money value={today.net_sales} size="hero" className="text-on-accent" />
            </div>
            <div className="mt-2">
              <DeltaPill
                delta={comparison.net_sales_delta}
                pct={comparison.net_sales_pct}
                className="!border-white/20 !bg-white/10 !text-white"
              />
            </div>
          </div>

          <div className="sm:border-l sm:border-white/15 sm:pl-6">
            <p className="text-xs font-medium tracking-wide text-white/60">Gross profit</p>
            <div className="mt-1">
              <Money value={today.realized_gross_profit} size="xl" className="text-on-accent" />
            </div>
            <p className="mt-1 text-xs text-white/60">
              {formatPercent(today.gross_margin_pct)} margin
            </p>
            <div className="mt-2">
              <DeltaPill
                delta={comparison.gross_profit_delta}
                pct={comparison.gross_profit_pct}
                className="!border-white/20 !bg-white/10 !text-white"
              />
            </div>
          </div>

          <div className="sm:border-l sm:border-white/15 sm:pl-6">
            <p className="text-xs font-medium tracking-wide text-white/60">Net profit</p>
            <div className="mt-1 flex items-center gap-2">
              <Money value={today.net_profit} size="xl" className="text-on-accent" />
              {today.net_profit >= 0 ? (
                <TrendingUp className="size-5 text-white/70" aria-hidden />
              ) : (
                <TrendingDown className="size-5 text-white/70" aria-hidden />
              )}
            </div>
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-white/60">
              after <Money value={today.operating_expenses} size="sm" className="text-white/80" /> expenses
            </p>
            <div className="mt-2">
              <DeltaPill
                delta={comparison.net_profit_delta}
                pct={comparison.net_profit_pct}
                className="!border-white/20 !bg-white/10 !text-white"
              />
            </div>
          </div>
        </div>

        <div className="relative mt-6 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/15 pt-4 text-sm text-white/75">
          <span>
            <span className="tnum font-semibold text-on-accent">{today.order_count}</span> orders
          </span>
          <span>
            <span className="tnum font-semibold text-on-accent">{today.units_sold}</span> units sold
          </span>
          <Link
            href="/reports/pl?period=today"
            className="ml-auto inline-flex items-center gap-1 rounded-[--radius-xs] px-2 py-1 text-xs font-medium text-white/90 transition-colors hover:bg-white/10"
          >
            Full P&amp;L
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
