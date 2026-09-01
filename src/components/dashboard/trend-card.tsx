"use client";

import { TrendAreaChart, CHART_COLORS } from "@/components/charts/chart-kit";
import { EmptyState } from "@/components/common/empty-state";
import { LineChart } from "lucide-react";
import { toMajor } from "@/lib/money";
import { formatDate } from "@/lib/format";
import type { DailySeriesRow } from "@/lib/supabase/database.types";

/**
 * Rolling revenue-vs-net-profit trend for the dashboard. Every day in range is
 * present (the RPC zero-fills), so the timeline never lies by omission.
 */
export function TrendCard({ series }: { series: DailySeriesRow[] }) {
  const hasActivity = series.some((d) => d.net_sales !== 0 || d.net_profit !== 0);

  if (!hasActivity) {
    return (
      <EmptyState
        compact
        icon={LineChart}
        title="No sales in this window yet"
        description="Once you start selling, your daily revenue and profit trend will appear here."
      />
    );
  }

  const data = series.map((d) => ({
    label: formatDate(d.day, "short"),
    revenue: toMajor(d.net_sales),
    profit: toMajor(d.net_profit),
  }));

  return (
    <TrendAreaChart
      data={data}
      xKey="label"
      height={240}
      series={[
        { dataKey: "revenue", name: "Net sales", color: CHART_COLORS.revenue },
        { dataKey: "profit", name: "Net profit", color: CHART_COLORS.profit },
      ]}
    />
  );
}
