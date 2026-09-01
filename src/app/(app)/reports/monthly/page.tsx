import type { Metadata } from "next";
import { ShoppingBag, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  TableWrapper,
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Money, DeltaPill } from "@/components/common/money";
import { NetStatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { MonthNav } from "@/components/reports/month-nav";
import { ProductProfitList } from "@/components/reports/product-profit-list";
import { CategoryDonut } from "@/components/charts/chart-kit";
import {
  DailyRevenueProfitChart,
  DailyNetProfitChart,
  MonthlyNetProfitChart,
} from "@/components/reports/report-charts";
import { createClient } from "@/lib/supabase/server";
import { getShopContext } from "@/lib/supabase/queries";
import { endOfMonth, formatPercent, monthLabel } from "@/lib/format";
import { changePct } from "@/lib/money";
import type {
  DailySeriesRow,
  ExpenseCategoryReportRow,
  MonthlySeriesRow,
  PlSummaryRow,
  ProductProfitabilityRow,
  ReportBoundsRow,
} from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Monthly reports" };
export const dynamic = "force-dynamic";

export default async function MonthlyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const shop = await getShopContext();

  const { data: boundsRows } = await supabase.rpc("report_bounds");
  const bounds = ((boundsRows ?? [])[0] ?? {
    earliest_date: shop.today,
    latest_date: shop.today,
    app_started_on: shop.today,
  }) as ReportBoundsRow;

  // Selected month defaults to the current one; clamp inside the valid window.
  const currentMonth = shop.today.slice(0, 7);
  const selectedMonth = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : currentMonth;
  const monthStart = `${selectedMonth}-01`;
  const monthEnd = endOfMonth(monthStart);

  // Previous calendar month, for the comparison pills.
  const selYear = Number(selectedMonth.slice(0, 4));
  const selMonth = Number(selectedMonth.slice(5, 7)); // 1-based
  const prevMonthStart = new Date(Date.UTC(selYear, selMonth - 2, 1)).toISOString().slice(0, 10);
  const prevMonthEnd = endOfMonth(prevMonthStart);

  const [
    { data: plRows },
    { data: prevPlRows },
    { data: dailyRows },
    { data: catRows },
    { data: productRows },
    { data: monthlyRows },
  ] = await Promise.all([
    supabase.rpc("report_pl_summary", { p_period: "custom", p_start: monthStart, p_end: monthEnd }),
    supabase.rpc("report_pl_summary", { p_period: "custom", p_start: prevMonthStart, p_end: prevMonthEnd }),
    supabase.rpc("report_daily_series", { p_period: "custom", p_start: monthStart, p_end: monthEnd }),
    supabase.rpc("report_expenses_by_category", { p_period: "custom", p_start: monthStart, p_end: monthEnd }),
    supabase.rpc("report_product_profitability", { p_period: "custom", p_start: monthStart, p_end: monthEnd }),
    supabase.rpc("report_monthly_series", { p_from: null, p_to: null }),
  ]);

  const pl = ((plRows ?? [])[0] ?? null) as PlSummaryRow | null;
  const prev = ((prevPlRows ?? [])[0] ?? null) as PlSummaryRow | null;
  const daily = (dailyRows ?? []) as DailySeriesRow[];
  const categories = (catRows ?? []) as ExpenseCategoryReportRow[];
  const products = (productRows ?? []) as ProductProfitabilityRow[];
  const monthly = (monthlyRows ?? []) as MonthlySeriesRow[];

  const earliestYear = Number(bounds.earliest_date.slice(0, 4));
  const latestYear = Number(shop.today.slice(0, 4));
  const latestMonthIndex = Number(shop.today.slice(5, 7)) - 1;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Money"
        title="Monthly reports"
        description="Every month since you started, with a comparison to the month before."
      />

      <MonthNav
        selectedMonth={selectedMonth}
        earliestYear={earliestYear}
        latestYear={latestYear}
        latestMonthIndex={latestMonthIndex}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display-title text-2xl text-ink-strong">{monthLabel(monthStart)}</h2>
        {pl ? <NetStatusBadge netProfit={pl.net_profit} size="lg" /> : null}
      </div>

      {!pl || pl.net_sales === 0 && pl.operating_expenses === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No activity this month"
          description="There were no sales or expenses in this month. Pick another month above."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              label="Net sales"
              value={<Money value={pl.net_sales} size="xl" />}
              icon={ShoppingBag}
              tone="primary"
              footer={
                prev ? (
                  <DeltaPill delta={pl.net_sales - prev.net_sales} pct={changePct(pl.net_sales, prev.net_sales)} />
                ) : undefined
              }
            />
            <StatCard
              label="Gross profit"
              value={<Money value={pl.realized_gross_profit} size="xl" tone />}
              icon={TrendingUp}
              tone={pl.realized_gross_profit >= 0 ? "profit" : "loss"}
              hint={`${formatPercent(pl.gross_margin_pct)} margin`}
            />
            <StatCard
              label="Expenses"
              value={<Money value={pl.operating_expenses} size="xl" />}
              icon={Wallet}
              tone="lowProfit"
            />
            <StatCard
              label="Net profit"
              value={<Money value={pl.net_profit} size="xl" tone />}
              icon={pl.net_profit >= 0 ? TrendingUp : TrendingDown}
              tone={pl.net_profit > 0 ? "profit" : pl.net_profit < 0 ? "loss" : "breakeven"}
              footer={
                prev ? (
                  <DeltaPill delta={pl.net_profit - prev.net_profit} pct={changePct(pl.net_profit, prev.net_profit)} />
                ) : undefined
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Daily revenue &amp; profit</CardTitle>
              </CardHeader>
              <CardContent>
                <DailyRevenueProfitChart series={daily} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Daily net profit</CardTitle>
              </CardHeader>
              <CardContent>
                <DailyNetProfitChart series={daily} />
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Product profitability</CardTitle>
              </CardHeader>
              <CardContent>
                <ProductProfitList products={products.slice(0, 8)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Expenses by category</CardTitle>
              </CardHeader>
              <CardContent>
                {categories.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted">No expenses this month.</p>
                ) : (
                  <>
                    <CategoryDonut
                      data={categories.map((c) => ({ name: c.name, value: c.total_amount, color: c.color }))}
                    />
                    <ul className="mt-3 space-y-1.5">
                      {categories.map((c) => (
                        <li key={c.expense_category_id ?? c.name} className="flex items-center gap-2 text-sm">
                          <span className="size-2.5 rounded-full" style={{ background: c.color }} aria-hidden />
                          <span className="flex-1 truncate text-muted">{c.name}</span>
                          <Money value={c.total_amount} size="sm" className="font-medium" />
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Month-by-month history */}
      <section className="space-y-3">
        <SectionHeader
          title="Month by month"
          description="Your whole history, newest first."
        />
        <Card>
          <CardHeader>
            <CardTitle>Net profit trend</CardTitle>
          </CardHeader>
          <CardContent>
            <MonthlyNetProfitChart months={monthly} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            <TableWrapper className="rounded-[--radius-lg] border-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Month</TableHead>
                    <TableHead numeric>Net sales</TableHead>
                    <TableHead numeric>COGS</TableHead>
                    <TableHead numeric>Gross profit</TableHead>
                    <TableHead numeric>Expenses</TableHead>
                    <TableHead numeric>Net profit</TableHead>
                    <TableHead numeric>Margin</TableHead>
                    <TableHead numeric>Orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...monthly].reverse().map((m) => (
                    <TableRow key={m.month}>
                      <TableCell className="font-medium">{monthLabel(m.month)}</TableCell>
                      <TableCell numeric><Money value={m.net_sales} size="sm" /></TableCell>
                      <TableCell numeric><Money value={m.cost_of_goods_sold} size="sm" /></TableCell>
                      <TableCell numeric><Money value={m.realized_gross_profit} size="sm" tone /></TableCell>
                      <TableCell numeric><Money value={m.operating_expenses} size="sm" /></TableCell>
                      <TableCell numeric><Money value={m.net_profit} size="sm" tone /></TableCell>
                      <TableCell numeric>{formatPercent(m.net_margin_pct)}</TableCell>
                      <TableCell numeric>{m.order_count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableWrapper>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
