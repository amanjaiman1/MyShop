import type { Metadata } from "next";
import { Award, ShoppingBag, TrendingDown, TrendingUp, Wallet } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Money, DeltaPill } from "@/components/common/money";
import { NetStatusBadge } from "@/components/common/status-badge";
import { EmptyState } from "@/components/common/empty-state";
import { YearNav } from "@/components/reports/year-nav";
import { ProductProfitList } from "@/components/reports/product-profit-list";
import {
  MonthlyProfitTrendChart,
  TwelveMonthRevenueChart,
  MonthlyNetProfitChart,
  YearlyTrendChart,
} from "@/components/reports/report-charts";
import { createClient } from "@/lib/supabase/server";
import { getShopContext } from "@/lib/supabase/queries";
import { formatPercent, monthLabel } from "@/lib/format";
import { changePct } from "@/lib/money";
import type {
  MonthlySeriesRow,
  PlSummaryRow,
  ProductProfitabilityRow,
  ReportBoundsRow,
  ReportPeriodKey,
  YearlySeriesRow,
} from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Yearly reports" };
export const dynamic = "force-dynamic";

export default async function YearlyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const shop = await getShopContext();

  const [{ data: boundsRows }, { data: yearlyRows }] = await Promise.all([
    supabase.rpc("report_bounds"),
    supabase.rpc("report_yearly_series"),
  ]);
  const bounds = ((boundsRows ?? [])[0] ?? {
    earliest_date: shop.today,
    latest_date: shop.today,
    app_started_on: shop.today,
  }) as ReportBoundsRow;
  const yearly = (yearlyRows ?? []) as YearlySeriesRow[];

  const earliestYear = Number(bounds.earliest_date.slice(0, 4));
  const latestYear = Number(shop.today.slice(0, 4));
  const years = Array.from({ length: latestYear - earliestYear + 1 }, (_, i) => earliestYear + i);

  const isAllTime = sp.year === "all";
  const selectedYear = !isAllTime && /^\d{4}$/.test(sp.year ?? "") ? Number(sp.year) : latestYear;
  const selection = isAllTime ? "all" : String(selectedYear);

  const period: ReportPeriodKey = isAllTime ? "all_time" : "custom";
  const yearStart = isAllTime ? null : `${selectedYear}-01-01`;
  const yearEnd = isAllTime ? null : `${selectedYear}-12-31`;

  const [{ data: plRows }, { data: productRows }, { data: monthlyRows }] = await Promise.all([
    supabase.rpc("report_pl_summary", { p_period: period, p_start: yearStart, p_end: yearEnd }),
    supabase.rpc("report_product_profitability", { p_period: period, p_start: yearStart, p_end: yearEnd }),
    isAllTime
      ? supabase.rpc("report_monthly_series", { p_from: null, p_to: null })
      : supabase.rpc("report_monthly_series", { p_from: yearStart, p_to: yearEnd }),
  ]);

  const pl = ((plRows ?? [])[0] ?? null) as PlSummaryRow | null;
  const products = (productRows ?? []) as ProductProfitabilityRow[];
  const months = (monthlyRows ?? []) as MonthlySeriesRow[];

  // Previous-year comparison (only for a specific year).
  let prevYear: YearlySeriesRow | null = null;
  if (!isAllTime) {
    prevYear = yearly.find((y) => y.year === selectedYear - 1) ?? null;
  }

  // Best / worst month within the selection.
  const tradedMonths = months.filter((m) => m.net_sales !== 0 || m.operating_expenses !== 0);
  const bestMonth = tradedMonths.reduce<MonthlySeriesRow | null>(
    (best, m) => (!best || m.net_profit > best.net_profit ? m : best),
    null,
  );
  const worstMonth = tradedMonths.reduce<MonthlySeriesRow | null>(
    (worst, m) => (!worst || m.net_profit < worst.net_profit ? m : worst),
    null,
  );

  const mostProfitable = products.filter((p) => p.net_profit > 0).slice(0, 6);
  const lossProducts = products.filter((p) => p.net_profit < 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Money"
        title="Yearly reports"
        description="Year-on-year performance, with every month laid out."
      />

      <YearNav years={years} selected={selection} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="display-title text-2xl text-ink-strong">
          {isAllTime ? "All time" : selectedYear}
        </h2>
        {pl ? <NetStatusBadge netProfit={pl.net_profit} size="lg" /> : null}
      </div>

      {!pl || (pl.net_sales === 0 && pl.operating_expenses === 0) ? (
        <EmptyState
          icon={ShoppingBag}
          title="No activity"
          description="There was no trade in this period. Choose another year above."
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard
              label="Annual net sales"
              value={<Money value={pl.net_sales} size="xl" />}
              icon={ShoppingBag}
              tone="primary"
              footer={
                prevYear ? (
                  <DeltaPill delta={pl.net_sales - prevYear.net_sales} pct={changePct(pl.net_sales, prevYear.net_sales)} />
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
                prevYear ? (
                  <DeltaPill delta={pl.net_profit - prevYear.net_profit} pct={changePct(pl.net_profit, prevYear.net_profit)} />
                ) : undefined
              }
            />
          </div>

          {/* Highlights */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card tone="champagne">
              <CardContent className="p-4">
                <div className="flex items-center gap-1.5">
                  <Award className="size-4 text-gold" aria-hidden />
                  <p className="eyebrow !text-gold">Best month</p>
                </div>
                {bestMonth ? (
                  <>
                    <p className="mt-1 font-semibold text-ink-strong">{monthLabel(bestMonth.month)}</p>
                    <Money value={bestMonth.net_profit} tone showSign className="text-sm" />
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted">—</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="eyebrow">Lowest month</p>
                {worstMonth ? (
                  <>
                    <p className="mt-1 font-semibold text-ink-strong">{monthLabel(worstMonth.month)}</p>
                    <Money value={worstMonth.net_profit} tone showSign className="text-sm" />
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted">—</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="eyebrow">Best-selling product</p>
                {products[0] ? (
                  <>
                    <p className="mt-1 truncate font-semibold text-ink-strong">
                      {[...products].sort((a, b) => b.units_sold - a.units_sold)[0]?.name}
                    </p>
                    <p className="text-sm text-muted">
                      {[...products].sort((a, b) => b.units_sold - a.units_sold)[0]?.units_sold} units
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted">—</p>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="eyebrow">Most profitable</p>
                {mostProfitable[0] ? (
                  <>
                    <p className="mt-1 truncate font-semibold text-ink-strong">{mostProfitable[0].name}</p>
                    <Money value={mostProfitable[0].net_profit} tone showSign className="text-sm" />
                  </>
                ) : (
                  <p className="mt-1 text-sm text-muted">—</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 12-month charts */}
          <Card>
            <CardHeader>
              <CardTitle>{isAllTime ? "Every month" : "Twelve months"}</CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="trend">
                <TabsList className="mb-4">
                  <TabsTrigger value="trend">Revenue &amp; profit</TabsTrigger>
                  <TabsTrigger value="revenue">Revenue</TabsTrigger>
                  <TabsTrigger value="net">Net profit</TabsTrigger>
                </TabsList>
                <TabsContent value="trend">
                  <MonthlyProfitTrendChart months={months} />
                </TabsContent>
                <TabsContent value="revenue">
                  <TwelveMonthRevenueChart months={months} />
                </TabsContent>
                <TabsContent value="net">
                  <MonthlyNetProfitChart months={months} />
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingUp className="size-4 text-profit" aria-hidden /> Most profitable products
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProductProfitList products={mostProfitable} />
              </CardContent>
            </Card>
            <Card tone={lossProducts.length > 0 ? "loss" : "default"}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <TrendingDown className="size-4 text-loss" aria-hidden /> Products that lost money
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ProductProfitList products={lossProducts} emptyLabel="No products sold at a loss. 🎉" />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Year-by-year history */}
      <section className="space-y-3">
        <SectionHeader title="Year by year" description="Your whole history." />
        <Card>
          <CardHeader>
            <CardTitle>Annual trend</CardTitle>
          </CardHeader>
          <CardContent>
            <YearlyTrendChart years={yearly} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-0">
            <TableWrapper className="rounded-[--radius-lg] border-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Year</TableHead>
                    <TableHead numeric>Net sales</TableHead>
                    <TableHead numeric>COGS</TableHead>
                    <TableHead numeric>Gross profit</TableHead>
                    <TableHead numeric>Expenses</TableHead>
                    <TableHead numeric>Net profit</TableHead>
                    <TableHead numeric>Margin</TableHead>
                    <TableHead numeric>Units</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...yearly].reverse().map((y) => (
                    <TableRow key={y.year}>
                      <TableCell className="font-medium">{y.year}</TableCell>
                      <TableCell numeric><Money value={y.net_sales} size="sm" /></TableCell>
                      <TableCell numeric><Money value={y.cost_of_goods_sold} size="sm" /></TableCell>
                      <TableCell numeric><Money value={y.realized_gross_profit} size="sm" tone /></TableCell>
                      <TableCell numeric><Money value={y.operating_expenses} size="sm" /></TableCell>
                      <TableCell numeric><Money value={y.net_profit} size="sm" tone /></TableCell>
                      <TableCell numeric>{formatPercent(y.net_margin_pct)}</TableCell>
                      <TableCell numeric>{y.units_sold}</TableCell>
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
