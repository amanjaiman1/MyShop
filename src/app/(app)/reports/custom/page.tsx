import type { Metadata } from "next";
import {
  Boxes,
  CalendarRange,
  Package,
  Receipt,
  ShoppingBag,
  Sparkles,
  Truck,
  Wallet,
} from "lucide-react";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { Money } from "@/components/common/money";
import { NetStatusBadge } from "@/components/common/status-badge";
import { PlStatement } from "@/components/reports/pl-statement";
import { PeriodPicker } from "@/components/reports/period-picker";
import { DatasetExportCard } from "@/components/reports/dataset-export";
import { createClient } from "@/lib/supabase/server";
import { getShopContext } from "@/lib/supabase/queries";
import type { PlSummaryRow, ReportPeriodKey } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Custom reports" };
export const dynamic = "force-dynamic";

export default async function CustomReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; start?: string; end?: string }>;
}) {
  const sp = await searchParams;
  const period = (sp.period ?? "last_30_days") as ReportPeriodKey;
  const start = sp.start ?? null;
  const end = sp.end ?? null;

  const supabase = await createClient();
  const shop = await getShopContext();

  const { data: plRows } = await supabase.rpc("report_pl_summary", {
    p_period: period,
    p_start: start,
    p_end: end,
  });
  const pl = ((plRows ?? [])[0] ?? null) as PlSummaryRow | null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Money"
        title="Custom reports & exports"
        description="Choose any range, review the result, and export any dataset as CSV."
      />

      <PeriodPicker today={shop.today} />

      {pl ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="display-title text-2xl text-ink-strong">{pl.period_label}</h2>
            <NetStatusBadge netProfit={pl.net_profit} size="lg" />
          </div>

          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatCard label="Net sales" value={<Money value={pl.net_sales} size="xl" />} icon={ShoppingBag} tone="primary" />
            <StatCard
              label="Gross profit"
              value={<Money value={pl.realized_gross_profit} size="xl" tone />}
              icon={Sparkles}
              tone={pl.realized_gross_profit >= 0 ? "profit" : "loss"}
            />
            <StatCard label="Expenses" value={<Money value={pl.operating_expenses} size="xl" />} icon={Wallet} tone="lowProfit" />
            <StatCard
              label="Net profit"
              value={<Money value={pl.net_profit} size="xl" tone />}
              icon={Receipt}
              tone={pl.net_profit > 0 ? "profit" : pl.net_profit < 0 ? "loss" : "breakeven"}
            />
          </div>

          <div className="lg:max-w-md">
            <PlStatement pl={pl} />
          </div>
        </>
      ) : null}

      <section className="space-y-3">
        <SectionHeader
          title="Export data"
          description="Date-scoped exports use the range above. Catalogue exports are always complete."
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <DatasetExportCard
            kind="daily"
            title="Daily profit & loss"
            description="One row per day in range"
            icon={CalendarRange}
            period={period}
            start={start}
            end={end}
          />
          <DatasetExportCard
            kind="monthly"
            title="Monthly profit & loss"
            description="Every month of use"
            icon={CalendarRange}
            period={period}
            start={start}
            end={end}
          />
          <DatasetExportCard
            kind="yearly"
            title="Yearly profit & loss"
            description="Every year of use"
            icon={CalendarRange}
            period={period}
            start={start}
            end={end}
          />
          <DatasetExportCard
            kind="sales"
            title="Sales"
            description="Invoices in range"
            icon={ShoppingBag}
            period={period}
            start={start}
            end={end}
          />
          <DatasetExportCard
            kind="sale_items"
            title="Sale items"
            description="Line-level with cost & profit"
            icon={Receipt}
            period={period}
            start={start}
            end={end}
          />
          <DatasetExportCard
            kind="expenses"
            title="Expenses"
            description="Operating costs in range"
            icon={Wallet}
            period={period}
            start={start}
            end={end}
          />
          <DatasetExportCard
            kind="purchase_batches"
            title="Purchase batches"
            description="Stock bought in range"
            icon={Truck}
            period={period}
            start={start}
            end={end}
          />
          <DatasetExportCard
            kind="products"
            title="Products"
            description="Full catalogue"
            icon={Package}
            period={period}
            start={start}
            end={end}
          />
          <DatasetExportCard
            kind="inventory"
            title="Current inventory"
            description="What's on hand now"
            icon={Boxes}
            period={period}
            start={start}
            end={end}
          />
        </div>
      </section>
    </div>
  );
}
