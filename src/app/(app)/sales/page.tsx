import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, Receipt, ScanLine, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { EmptyState } from "@/components/common/empty-state";
import { Money } from "@/components/common/money";
import { StatCard } from "@/components/common/stat-card";
import { SaleStatusBadge } from "@/components/common/status-badge";
import { SalesFilter } from "@/components/sale/sales-filter";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/queries";
import { formatDateTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { SaleRow, SaleStatus } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Sales" };
export const dynamic = "force-dynamic";

const STATUS_FILTERS: Record<string, SaleStatus[]> = {
  all: ["completed", "partially_returned", "returned", "voided"],
  completed: ["completed"],
  returned: ["partially_returned", "returned"],
  voided: ["voided"],
};

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; q?: string }>;
}) {
  const { status = "all", q = "" } = await searchParams;
  const supabase = await createClient();
  const profile = await getProfile();

  const statuses = STATUS_FILTERS[status] ?? STATUS_FILTERS.all!;

  let query = supabase
    .from("sales")
    .select(
      "id, invoice_number, sale_date, status, total, total_cost, gross_profit, payment_method, discount, return_amount",
    )
    .in("status", statuses)
    .order("sale_date", { ascending: false })
    .limit(200);

  if (q.trim()) query = query.ilike("invoice_number", `%${q.trim()}%`);

  const { data } = await query;
  const sales = (data ?? []) as Array<
    Pick<
      SaleRow,
      | "id"
      | "invoice_number"
      | "sale_date"
      | "status"
      | "total"
      | "total_cost"
      | "gross_profit"
      | "payment_method"
      | "discount"
      | "return_amount"
    >
  >;

  // Headline totals count only reportable statuses (exclude voided).
  const reportable = sales.filter((s) => s.status !== "voided");
  const totalRevenue = reportable.reduce((a, s) => a + s.total, 0);
  const totalProfit = reportable.reduce((a, s) => a + s.gross_profit, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Trade"
        title="Sales"
        description="Every invoice, with its realized profit. Search, return or void from here."
        actions={
          <Button asChild size="sm">
            <Link href="/sell">
              <ScanLine aria-hidden />
              New sale
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <StatCard
          label={`Revenue · ${sales.length} shown`}
          value={<Money value={totalRevenue} size="xl" />}
          icon={ShoppingBag}
          tone="primary"
        />
        <StatCard
          label="Gross profit · shown"
          value={<Money value={totalProfit} size="xl" tone />}
          icon={Receipt}
          tone={totalProfit >= 0 ? "profit" : "loss"}
        />
      </div>

      <SalesFilter />

      {sales.length === 0 ? (
        <EmptyState
          icon={ShoppingBag}
          title="No sales here"
          description={
            q || status !== "all"
              ? "Nothing matches this filter. Try a different status or search."
              : "Once you complete a sale it will appear here with its full profit breakdown."
          }
          action={
            <Button asChild>
              <Link href="/sell">
                <ScanLine aria-hidden />
                Make a sale
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul>
              {sales.map((sale) => (
                <li key={sale.id}>
                  <Link
                    href={`/sales/${sale.id}`}
                    className="flex items-center gap-4 border-b border-line px-4 py-3.5 transition-colors last:border-0 hover:bg-surface-muted"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-mono text-sm font-medium text-ink-strong">
                          {sale.invoice_number}
                        </span>
                        <SaleStatusBadge status={sale.status} size="sm" />
                      </div>
                      <p className="truncate text-xs text-muted">
                        {formatDateTime(sale.sale_date, profile.timezone)} ·{" "}
                        {PAYMENT_METHOD_LABELS[sale.payment_method]}
                      </p>
                    </div>
                    <div className="text-right">
                      <Money
                        value={sale.total}
                        size="default"
                        className={sale.status === "voided" ? "font-semibold text-muted line-through" : "font-semibold"}
                      />
                      {sale.status !== "voided" ? (
                        <Money value={sale.gross_profit} size="sm" tone showSign className="block" />
                      ) : null}
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-subtle" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
