import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Coins,
  Gem,
  PackageX,
  Plus,
  ScanLine,
  ShoppingBag,
  Sparkles,
  TrendingDown,
  Truck,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { TodayHero } from "@/components/dashboard/today-hero";
import { TrendCard } from "@/components/dashboard/trend-card";
import { createClient } from "@/lib/supabase/server";
import { getDashboardSnapshot, getProfile } from "@/lib/supabase/queries";
import { formatDate, formatPercent, formatTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { DailySeriesRow, SaleRow } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [snapshot, profile] = await Promise.all([getDashboardSnapshot(), getProfile()]);
  const supabase = await createClient();

  const [{ data: dailyRaw }, { data: recentRaw }] = await Promise.all([
    supabase.rpc("report_daily_series", { p_period: "last_5_days" }),
    supabase
      .from("sales")
      .select("id, invoice_number, sale_date, total, gross_profit, status, payment_method")
      .in("status", ["completed", "partially_returned", "returned"])
      .order("sale_date", { ascending: false })
      .limit(6),
  ]);

  const daily = (dailyRaw ?? []) as DailySeriesRow[];
  const recent = (recentRaw ?? []) as Array<
    Pick<
      SaleRow,
      "id" | "invoice_number" | "sale_date" | "total" | "gross_profit" | "status" | "payment_method"
    >
  >;

  const { inventory, alerts, this_month: month } = snapshot;
  const firstName = profile.display_name.split(" ")[0] ?? profile.display_name;

  return (
    <div className="space-y-7">
      <PageHeader
        eyebrow={formatDate(snapshot.today.period_start, "long")}
        title={`Welcome back, ${firstName}`}
        description="Here is where your shop stands today, and what needs your attention."
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href="/purchases/new">
                <Truck aria-hidden />
                Record purchase
              </Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sell">
                <ScanLine aria-hidden />
                Scan &amp; sell
              </Link>
            </Button>
          </>
        }
      />

      <TodayHero snapshot={snapshot} />

      {/* Position + month */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label="Inventory investment"
          value={<Money value={inventory.investment} size="xl" />}
          icon={Coins}
          tone="gold"
          hint={`${inventory.units.toLocaleString("en-IN")} units on hand`}
          href="/products"
        />
        <StatCard
          label="Projected profit"
          value={<Money value={inventory.projected_gross_profit} size="xl" tone />}
          icon={Sparkles}
          tone="primary"
          hint={`If sold at recommended · ${formatPercent(inventory.projected_margin_pct)} margin`}
          href="/reports/pl"
        />
        <StatCard
          label="This month · net profit"
          value={<Money value={month.net_profit} size="xl" tone />}
          icon={TrendingDown}
          tone={month.net_profit >= 0 ? "profit" : "loss"}
          hint={`${formatPercent(month.net_margin_pct)} net margin`}
          href="/reports/pl?period=this_month"
        />
        <StatCard
          label="This month · net sales"
          value={<Money value={month.net_sales} size="xl" />}
          icon={ShoppingBag}
          tone="default"
          hint={`${month.order_count} orders · ${month.units_sold} units`}
          href="/reports/pl?period=this_month"
        />
      </div>

      {/* Attention needed */}
      {alerts.priced_at_loss + alerts.priced_at_breakeven + alerts.low_stock + alerts.out_of_stock + alerts.expiring_soon >
      0 ? (
        <section className="space-y-3">
          <SectionHeader
            title="Needs your attention"
            description="Tap any card to see exactly which products."
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <AlertCard
              show={alerts.priced_at_loss > 0}
              count={alerts.priced_at_loss}
              label="Priced at a loss"
              icon={TrendingDown}
              tone="loss"
              href="/products?flag=loss"
            />
            <AlertCard
              show={alerts.priced_at_breakeven > 0}
              count={alerts.priced_at_breakeven}
              label="Only break even"
              icon={AlertTriangle}
              tone="breakeven"
              href="/products?flag=breakeven"
            />
            <AlertCard
              show={alerts.out_of_stock > 0}
              count={alerts.out_of_stock}
              label="Out of stock"
              icon={PackageX}
              tone="loss"
              href="/products?flag=out_of_stock"
            />
            <AlertCard
              show={alerts.low_stock > 0}
              count={alerts.low_stock}
              label="Low stock"
              icon={AlertTriangle}
              tone="lowProfit"
              href="/products?flag=low_stock"
            />
            <AlertCard
              show={alerts.expiring_soon > 0}
              count={alerts.expiring_soon}
              label="Expiring soon"
              icon={CalendarClock}
              tone="lowProfit"
              href="/products?flag=expiring"
            />
          </div>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Last 5 days</CardTitle>
              <Link
                href="/reports/pl?period=last_5_days"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                Details <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <TrendCard series={daily} />
          </CardContent>
        </Card>

        {/* Recent sales */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent sales</CardTitle>
              <Link
                href="/sales"
                className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                All <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <EmptyState
                compact
                icon={ShoppingBag}
                title="No sales yet"
                description="Your most recent sales will show up here."
                action={
                  <Button asChild size="sm">
                    <Link href="/sell">
                      <ScanLine aria-hidden />
                      Make a sale
                    </Link>
                  </Button>
                }
              />
            ) : (
              <ul className="-my-1 divide-y divide-line">
                {recent.map((sale) => (
                  <li key={sale.id}>
                    <Link
                      href={`/sales/${sale.id}`}
                      className="flex items-center gap-3 py-3 transition-colors hover:bg-surface-muted"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs text-muted">
                          {sale.invoice_number}
                        </p>
                        <p className="text-xs text-subtle">
                          {formatTime(sale.sale_date, profile.timezone)} ·{" "}
                          {PAYMENT_METHOD_LABELS[sale.payment_method]}
                        </p>
                      </div>
                      <div className="text-right">
                        <Money value={sale.total} size="default" className="block font-semibold" />
                        <Money
                          value={sale.gross_profit}
                          size="sm"
                          tone
                          showSign
                          className="block"
                        />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick links */}
      <section className="space-y-3">
        <SectionHeader title="Jump to" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QuickLink href="/products/new" icon={Plus} label="New product" />
          <QuickLink href="/expenses" icon={Wallet} label="Add expense" />
          <QuickLink href="/suppliers" icon={Gem} label="Suppliers" />
          <QuickLink href="/reports/monthly" icon={CalendarClock} label="Monthly report" />
        </div>
      </section>
    </div>
  );
}

function AlertCard({
  show,
  count,
  label,
  icon: Icon,
  tone,
  href,
}: {
  show: boolean;
  count: number;
  label: string;
  icon: typeof AlertTriangle;
  tone: "loss" | "lowProfit" | "breakeven";
  href: string;
}) {
  if (!show) return null;
  return (
    <StatCard
      label={label}
      value={count.toLocaleString("en-IN")}
      icon={Icon}
      tone={tone}
      href={href}
    />
  );
}

function QuickLink({
  href,
  icon: Icon,
  label,
}: {
  href: string;
  icon: typeof Plus;
  label: string;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-[--radius-lg] border border-line bg-surface p-4 shadow-sm transition-all hover:-translate-y-px hover:shadow-md"
    >
      <span className="flex size-10 items-center justify-center rounded-[--radius-sm] bg-primary-soft text-primary transition-colors group-hover:bg-primary group-hover:text-on-accent">
        <Icon className="size-5" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="text-sm font-medium text-ink">{label}</span>
      <ArrowRight className="ml-auto size-4 text-subtle opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </Link>
  );
}
