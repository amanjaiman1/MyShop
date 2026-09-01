"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useShop } from "@/components/providers/shop-provider";
import { formatMoney, formatMoneyCompact } from "@/lib/format";
import { toMajor, type Minor } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Chart primitives for Aurelia.
 *
 * Charts are decisions, not decoration: every series carries a real, exact
 * tooltip (full currency, not the abbreviated axis value) and colours come from
 * the design tokens so a "loss" line is the same red everywhere.
 *
 * Recharts works in major units (floats), so `Minor` values are converted at
 * the boundary and converted back for every label.
 */

const AXIS = "var(--text-subtle)";
const GRID = "var(--border)";

export const CHART_COLORS = {
  primary: "var(--primary)",
  profit: "var(--profit)",
  loss: "var(--loss)",
  revenue: "var(--rose)",
  cost: "var(--gold)",
  net: "var(--plum)",
  neutral: "var(--breakeven)",
} as const;

interface TooltipDatum {
  name: string;
  value: number;
  color?: string;
  dataKey?: string | number;
}

function useMoneyTooltip() {
  const { currency } = useShop();
  return React.useCallback(
    (active: boolean | undefined, label: unknown, payload: TooltipDatum[] | undefined) => {
      if (!active || !payload?.length) return null;
      return (
        <div className="rounded-[--radius-sm] border border-line bg-surface-raised px-3 py-2 shadow-lg">
          {label ? (
            <p className="mb-1 text-xs font-medium text-ink-strong">{String(label)}</p>
          ) : null}
          <div className="space-y-0.5">
            {payload.map((entry) => (
              <div key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2 text-xs">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: entry.color }}
                  aria-hidden
                />
                <span className="text-muted">{entry.name}</span>
                <span className="tnum ml-auto pl-3 font-medium text-ink">
                  {formatMoney(Math.round((entry.value ?? 0) * 100), currency)}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    },
    [currency],
  );
}

export function ChartFrame({
  height = 260,
  children,
  className,
}: {
  height?: number;
  children: React.ReactElement;
  className?: string;
}) {
  return (
    <div className={cn("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

interface SeriesConfig {
  dataKey: string;
  name: string;
  color: string;
}

/** Daily/period trend as a soft area — revenue, profit, whatever is passed. */
export function TrendAreaChart({
  data,
  xKey,
  series,
  height = 260,
}: {
  data: Array<Record<string, number | string>>;
  xKey: string;
  series: SeriesConfig[];
  height?: number;
}) {
  const { currency } = useShop();
  const renderTooltip = useMoneyTooltip();

  return (
    <ChartFrame height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
        <defs>
          {series.map((s) => (
            <linearGradient key={s.dataKey} id={`grad-${s.dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.28} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0.02} />
            </linearGradient>
          ))}
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: AXIS }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          minTickGap={20}
        />
        <YAxis
          tick={{ fontSize: 11, fill: AXIS }}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(v: number) => formatMoneyCompact(Math.round(v * 100), currency)}
        />
        <Tooltip
          content={({ active, label, payload }) =>
            renderTooltip(active, label, payload as TooltipDatum[])
          }
          cursor={{ stroke: GRID }}
        />
        {series.length > 1 ? (
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value) => <span className="text-muted">{value}</span>}
          />
        ) : null}
        {series.map((s) => (
          <Area
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#grad-${s.dataKey})`}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </AreaChart>
    </ChartFrame>
  );
}

/** Multi-line comparison (net profit vs gross profit, year over year, …). */
export function TrendLineChart({
  data,
  xKey,
  series,
  height = 260,
}: {
  data: Array<Record<string, number | string>>;
  xKey: string;
  series: SeriesConfig[];
  height?: number;
}) {
  const { currency } = useShop();
  const renderTooltip = useMoneyTooltip();

  return (
    <ChartFrame height={height}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: AXIS }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          minTickGap={16}
        />
        <YAxis
          tick={{ fontSize: 11, fill: AXIS }}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(v: number) => formatMoneyCompact(Math.round(v * 100), currency)}
        />
        <Tooltip
          content={({ active, label, payload }) =>
            renderTooltip(active, label, payload as TooltipDatum[])
          }
          cursor={{ stroke: GRID }}
        />
        <Legend
          iconType="circle"
          wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
          formatter={(value) => <span className="text-muted">{value}</span>}
        />
        {series.map((s) => (
          <Line
            key={s.dataKey}
            type="monotone"
            dataKey={s.dataKey}
            name={s.name}
            stroke={s.color}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ChartFrame>
  );
}

/**
 * Grouped/standalone bars. When `signedColor` is set, positive bars are profit
 * green and negative bars are loss red — used for daily/monthly net profit.
 */
export function ProfitBarChart({
  data,
  xKey,
  series,
  height = 260,
  signedColor = false,
}: {
  data: Array<Record<string, number | string>>;
  xKey: string;
  series: SeriesConfig[];
  height?: number;
  signedColor?: boolean;
}) {
  const { currency } = useShop();
  const renderTooltip = useMoneyTooltip();

  return (
    <ChartFrame height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
        <XAxis
          dataKey={xKey}
          tick={{ fontSize: 11, fill: AXIS }}
          tickLine={false}
          axisLine={{ stroke: GRID }}
          minTickGap={12}
        />
        <YAxis
          tick={{ fontSize: 11, fill: AXIS }}
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(v: number) => formatMoneyCompact(Math.round(v * 100), currency)}
        />
        <Tooltip
          content={({ active, label, payload }) =>
            renderTooltip(active, label, payload as TooltipDatum[])
          }
          cursor={{ fill: "var(--surface-sunken)" }}
        />
        {series.length > 1 ? (
          <Legend
            iconType="circle"
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            formatter={(value) => <span className="text-muted">{value}</span>}
          />
        ) : null}
        {series.map((s) => (
          <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} radius={[4, 4, 0, 0]} fill={s.color}>
            {signedColor
              ? data.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={
                      Number(entry[s.dataKey]) < 0 ? CHART_COLORS.loss : CHART_COLORS.profit
                    }
                  />
                ))
              : null}
          </Bar>
        ))}
      </BarChart>
    </ChartFrame>
  );
}

/** Category breakdown donut with an exact-value tooltip. */
export function CategoryDonut({
  data,
  height = 240,
}: {
  data: Array<{ name: string; value: Minor; color: string }>;
  height?: number;
}) {
  const { currency } = useShop();
  const chartData = data.map((d) => ({ ...d, major: toMajor(d.value) }));
  const total = data.reduce((a, d) => a + d.value, 0);

  return (
    <ChartFrame height={height}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="major"
          nameKey="name"
          innerRadius="58%"
          outerRadius="86%"
          paddingAngle={2}
          strokeWidth={2}
          stroke="var(--surface)"
        >
          {chartData.map((entry, index) => (
            <Cell key={index} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0]?.payload as { name: string; value: Minor };
            const pct = total > 0 ? Math.round((p.value / total) * 100) : 0;
            return (
              <div className="rounded-[--radius-sm] border border-line bg-surface-raised px-3 py-2 shadow-lg">
                <p className="text-xs font-medium text-ink-strong">{p.name}</p>
                <p className="tnum text-xs text-muted">
                  {formatMoney(p.value, currency)} · {pct}%
                </p>
              </div>
            );
          }}
        />
      </PieChart>
    </ChartFrame>
  );
}
