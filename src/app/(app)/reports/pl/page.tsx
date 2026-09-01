import type { Metadata } from "next";
import Link from "next/link";
import {
  Boxes,
  Layers,
  Receipt,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
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
import { Money } from "@/components/common/money";
import { EmptyState } from "@/components/common/empty-state";
import { SaleStatusBadge } from "@/components/common/status-badge";
import { PeriodPicker } from "@/components/reports/period-picker";
import { PlStatement } from "@/components/reports/pl-statement";
import { ProductProfitList } from "@/components/reports/product-profit-list";
import {
  DailyRevenueProfitChart,
  DailyNetProfitChart,
} from "@/components/reports/report-charts";
import { ReportExports } from "@/components/reports/report-exports";
import { createClient } from "@/lib/supabase/server";
import { getShopContext } from "@/lib/supabase/queries";
import { formatDateTime, formatPercent } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type {
  DailySeriesRow,
  LossMakingSaleRow,
  PaymentMethod,
  PaymentMethodReportRow,
  PlSummaryRow,
  ProductProfitabilityRow,
  ReportPeriodKey,
} from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Profit & Loss" };
export const dynamic = "force-dynamic";

export default async function ProfitLossPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const period = (sp.period ?? "this_month") as ReportPeriodKey;
  const start = sp.start ?? null;
  const end = sp.end ?? null;
  const args = { p_period: period, p_start: start, p_end: end };

  const supabase = await createClient();
  const shop = await getShopContext();

  const [
    { data: plRows },
    { data: dailyRows },
    { data: productRows },
    { data: paymentRows },
    { data: lossRows },
  ] = await Promise.all([
    supabase.rpc("report_pl_summary", args),
    supabase.rpc("report_daily_series", args),
    supabase.rpc("report_product_profitability", args),
    supabase.rpc("report_payment_methods", args),
    supabase.rpc("report_loss_making_sales", args),
  ]);

  const pl = ((plRows ?? [])[0] ?? null) as PlSummaryRow | null;
  const daily = (dailyRows ?? []) as DailySeriesRow[];
  const products = (productRows ?? []) as ProductProfitabilityRow[];
  const payments = (paymentRows ?? []) as PaymentMethodReportRow[];
  const losses = (lossRows ?? []) as LossMakingSaleRow[];

  if (!pl) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Money" title="Profit & Loss" />
        <EmptyState icon={Receipt} title="No data" description="Once you trade, your P&L appears here." />
      </div>
    );
  }

  const mostProfitable = products.filter((p) => p.net_profit > 0).slice(0, 6);
  const lowestProfit = [...products]
    .filter((p) => p.net_profit >= 0)
    .sort((a, b) => a.margin_pct - b.margin_pct)
    .slice(0, 6);
  const lossProducts = products.filter((p) => p.net_profit < 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Money"
        title="Profit & Loss"
        description="The full picture for any period — realized profit, expenses and net result."
      />

      <PeriodPicker today={shop.today} />

      {/* Headline metrics */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Net sales"
          value={<Money value={pl.net_sales} size="xl" />}
          icon={ShoppingBag}
          tone="primary"
          hint={`${pl.order_count} orders · ${pl.units_sold} units`}
          emphasis
        />
        <StatCard
          label="Realized gross profit"
          value={<Money value={pl.realized_gross_profit} size="xl" tone />}
          icon={TrendingUp}
          tone={pl.realized_gross_profit >= 0 ? "profit" : "loss"}
          hint={`${formatPercent(pl.gross_margin_pct)} gross margin`}
          emphasis
        />
        <StatCard
          label="Operating expenses"
          value={<Money value={pl.operating_expenses} size="xl" />}
          icon={Wallet}
          tone="lowProfit"
        />
        <StatCard
          label="Net profit"
          value={<Money value={pl.net_profit} size="xl" tone />}
          icon={pl.net_profit >= 0 ? TrendingUp : TrendingDown}
          tone={pl.net_profit > 0 ? "profit" : pl.net_profit < 0 ? "loss" : "breakeven"}
          hint={`${formatPercent(pl.net_margin_pct)} net margin`}
          emphasis
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Statement */}
        <div className="lg:col-span-2">
          <PlStatement pl={pl} />
        </div>

        {/* Charts */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Daily trend</CardTitle>
              <ReportExports period={period} start={start} end={end} daily={daily} />
            </div>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="revenue">
              <TabsList className="mb-4">
                <TabsTrigger value="revenue">Revenue &amp; profit</TabsTrigger>
                <TabsTrigger value="net">Net profit</TabsTrigger>
              </TabsList>
              <TabsContent value="revenue">
                <DailyRevenueProfitChart series={daily} />
              </TabsContent>
              <TabsContent value="net">
                <DailyNetProfitChart series={daily} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>

      {/* Position: inventory + projections */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Avg order value"
          value={<Money value={pl.average_order_value} size="lg" />}
          icon={Receipt}
        />
        <StatCard
          label="Inventory purchased"
          value={<Money value={pl.inventory_purchased} size="lg" />}
          icon={Layers}
          tone="gold"
          hint={`${pl.inventory_units_purchased} units in period`}
        />
        <StatCard
          label="Current inventory investment"
          value={<Money value={pl.current_inventory_investment} size="lg" />}
          icon={Boxes}
          tone="gold"
          hint="as of now"
        />
        <StatCard
          label="Projected profit"
          value={<Money value={pl.projected_gross_profit} size="lg" tone />}
          icon={Sparkles}
          tone="primary"
          hint="from remaining stock"
        />
      </div>

      {/* Product profitability */}
      <section className="space-y-3">
        <SectionHeader
          title="Product profitability"
          description="Where your profit came from — and where it leaked."
        />
        <div className="grid gap-4 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingUp className="size-4 text-profit" aria-hidden /> Most profitable
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProductProfitList products={mostProfitable} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingDown className="size-4 text-lowprofit" aria-hidden /> Lowest margin
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProductProfitList products={lowestProfit} />
            </CardContent>
          </Card>
          <Card tone={lossProducts.length > 0 ? "loss" : "default"}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <TrendingDown className="size-4 text-loss" aria-hidden /> Loss-making
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ProductProfitList
                products={lossProducts}
                emptyLabel="No products sold at a loss. 🎉"
              />
            </CardContent>
          </Card>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Payment methods */}
        <Card>
          <CardHeader>
            <CardTitle>Sales by payment method</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {payments.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted">No sales in this period.</p>
            ) : (
              <TableWrapper className="rounded-none border-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Method</TableHead>
                      <TableHead numeric>Orders</TableHead>
                      <TableHead numeric>Net sales</TableHead>
                      <TableHead numeric>Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.payment_method}>
                        <TableCell>{PAYMENT_METHOD_LABELS[p.payment_method as PaymentMethod]}</TableCell>
                        <TableCell numeric>{p.order_count}</TableCell>
                        <TableCell numeric>
                          <Money value={p.net_sales} size="sm" />
                        </TableCell>
                        <TableCell numeric>
                          <Money value={p.gross_profit} size="sm" tone />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableWrapper>
            )}
          </CardContent>
        </Card>

        {/* Loss-making sales */}
        <Card>
          <CardHeader>
            <CardTitle>Loss-making sales</CardTitle>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            {losses.length === 0 ? (
              <p className="px-6 pb-6 text-sm text-muted">
                No loss-making sales in this period. 🎉
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {losses.slice(0, 8).map((sale) => (
                  <li key={sale.sale_id}>
                    <Link
                      href={`/sales/${sale.sale_id}`}
                      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="font-mono text-xs font-medium text-ink">
                          {sale.invoice_number}
                        </span>
                        <p className="text-xs text-subtle">
                          {formatDateTime(sale.sale_date, shop.timezone)}
                        </p>
                      </div>
                      <SaleStatusBadge status={sale.status} size="sm" />
                      <Money value={sale.gross_profit} size="sm" tone showSign className="w-20 text-right" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
