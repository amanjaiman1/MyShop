"use client";

import {
  TrendAreaChart,
  ProfitBarChart,
  TrendLineChart,
  CHART_COLORS,
} from "@/components/charts/chart-kit";
import { toMajor } from "@/lib/money";
import { formatDate, shortMonthLabel } from "@/lib/format";
import type {
  DailySeriesRow,
  MonthlySeriesRow,
  YearlySeriesRow,
} from "@/lib/supabase/database.types";

/**
 * Report chart wrappers.
 *
 * Each takes the raw report rows (minor units) and maps to the major-unit
 * shape Recharts needs. Kept as thin client components so the report pages can
 * stay Server Components that just fetch and hand data down.
 */

export function DailyRevenueProfitChart({ series }: { series: DailySeriesRow[] }) {
  const data = series.map((d) => ({
    label: formatDate(d.day, "short"),
    revenue: toMajor(d.net_sales),
    profit: toMajor(d.realized_gross_profit),
  }));
  return (
    <TrendAreaChart
      data={data}
      xKey="label"
      series={[
        { dataKey: "revenue", name: "Net sales", color: CHART_COLORS.revenue },
        { dataKey: "profit", name: "Gross profit", color: CHART_COLORS.profit },
      ]}
    />
  );
}

export function DailyNetProfitChart({ series }: { series: DailySeriesRow[] }) {
  const data = series.map((d) => ({
    label: formatDate(d.day, "short"),
    net: toMajor(d.net_profit),
  }));
  return (
    <ProfitBarChart
      data={data}
      xKey="label"
      signedColor
      series={[{ dataKey: "net", name: "Net profit", color: CHART_COLORS.profit }]}
    />
  );
}

export function DailyRevenueCostChart({ series }: { series: DailySeriesRow[] }) {
  const data = series.map((d) => ({
    label: formatDate(d.day, "short"),
    revenue: toMajor(d.net_sales),
    cost: toMajor(d.cost_of_goods_sold),
  }));
  return (
    <ProfitBarChart
      data={data}
      xKey="label"
      series={[
        { dataKey: "revenue", name: "Revenue", color: CHART_COLORS.revenue },
        { dataKey: "cost", name: "Cost", color: CHART_COLORS.cost },
      ]}
    />
  );
}

export function MonthlyProfitTrendChart({ months }: { months: MonthlySeriesRow[] }) {
  const data = months.map((m) => ({
    label: shortMonthLabel(m.month),
    revenue: toMajor(m.net_sales),
    gross: toMajor(m.realized_gross_profit),
    net: toMajor(m.net_profit),
  }));
  return (
    <TrendLineChart
      data={data}
      xKey="label"
      series={[
        { dataKey: "revenue", name: "Net sales", color: CHART_COLORS.revenue },
        { dataKey: "gross", name: "Gross profit", color: CHART_COLORS.profit },
        { dataKey: "net", name: "Net profit", color: CHART_COLORS.net },
      ]}
    />
  );
}

export function MonthlyNetProfitChart({ months }: { months: MonthlySeriesRow[] }) {
  const data = months.map((m) => ({
    label: shortMonthLabel(m.month),
    net: toMajor(m.net_profit),
  }));
  return (
    <ProfitBarChart
      data={data}
      xKey="label"
      signedColor
      series={[{ dataKey: "net", name: "Net profit", color: CHART_COLORS.profit }]}
    />
  );
}

export function YearlyTrendChart({ years }: { years: YearlySeriesRow[] }) {
  const data = years.map((y) => ({
    label: String(y.year),
    revenue: toMajor(y.net_sales),
    gross: toMajor(y.realized_gross_profit),
    net: toMajor(y.net_profit),
  }));
  return (
    <TrendLineChart
      data={data}
      xKey="label"
      series={[
        { dataKey: "revenue", name: "Net sales", color: CHART_COLORS.revenue },
        { dataKey: "gross", name: "Gross profit", color: CHART_COLORS.profit },
        { dataKey: "net", name: "Net profit", color: CHART_COLORS.net },
      ]}
    />
  );
}

/** Monthly revenue bars for the "12-month revenue" chart on the yearly page. */
export function TwelveMonthRevenueChart({ months }: { months: MonthlySeriesRow[] }) {
  const data = months.map((m) => ({
    label: shortMonthLabel(m.month),
    revenue: toMajor(m.net_sales),
  }));
  return (
    <ProfitBarChart
      data={data}
      xKey="label"
      series={[{ dataKey: "revenue", name: "Net sales", color: CHART_COLORS.revenue }]}
    />
  );
}
