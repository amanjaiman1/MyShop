"use client";

import * as React from "react";
import { Download, Loader2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { toCsv, downloadCsv, csvFilename, csvMoney, type CsvColumn } from "@/lib/csv";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import type { PaymentMethod, ReportPeriodKey } from "@/lib/supabase/database.types";

/**
 * Export cards for the Custom reports page.
 *
 * Each dataset is fetched from the browser (RLS-scoped) only when the owner
 * clicks Export, so opening the page is cheap regardless of history size. Money
 * is written as bare decimals so a spreadsheet treats it as numeric.
 */
export type DatasetKind =
  | "products"
  | "inventory"
  | "purchase_batches"
  | "sales"
  | "sale_items"
  | "expenses"
  | "daily"
  | "monthly"
  | "yearly";

export function DatasetExportCard({
  kind,
  title,
  description,
  icon: Icon,
  period,
  start,
  end,
}: {
  kind: DatasetKind;
  title: string;
  description: string;
  icon: LucideIcon;
  period: ReportPeriodKey;
  start: string | null;
  end: string | null;
}) {
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    try {
      const supabase = createClient();
      const args = { p_period: period, p_start: start, p_end: end };
      const suffix = period === "custom" && start && end ? `${start}_${end}` : period;

      // Resolve the concrete dates for row-level (non-RPC) datasets.
      const { data: periodRows } = await supabase.rpc("report_period", args);
      const resolved = (periodRows ?? [])[0] as
        | { period_start: string; period_end: string }
        | undefined;
      const from = resolved?.period_start ?? start ?? "1970-01-01";
      const to = resolved?.period_end ?? end ?? "2999-12-31";

      let rows: Record<string, unknown>[] = [];
      let columns: CsvColumn<Record<string, unknown>>[] = [];

      switch (kind) {
        case "products": {
          const { data } = await supabase
            .from("product_overview")
            .select(
              "internal_code,name,brand,shade_or_variant,size,category_name,recommended_selling_price,minimum_selling_price,fifo_unit_cost,quantity_on_hand,is_active",
            )
            .order("name");
          rows = data ?? [];
          columns = [
            { header: "Code", value: (r) => r.internal_code as string },
            { header: "Name", value: (r) => r.name as string },
            { header: "Brand", value: (r) => (r.brand as string) ?? "" },
            { header: "Shade/Variant", value: (r) => (r.shade_or_variant as string) ?? "" },
            { header: "Size", value: (r) => (r.size as string) ?? "" },
            { header: "Category", value: (r) => (r.category_name as string) ?? "" },
            { header: "Selling price", value: (r) => csvMoney(r.recommended_selling_price as number) },
            { header: "Minimum price", value: (r) => csvMoney(r.minimum_selling_price as number) },
            { header: "FIFO cost", value: (r) => csvMoney(r.fifo_unit_cost as number) },
            { header: "On hand", value: (r) => r.quantity_on_hand as number },
            { header: "Active", value: (r) => ((r.is_active as boolean) ? "Yes" : "No") },
          ];
          break;
        }
        case "inventory": {
          const { data } = await supabase
            .from("product_overview")
            .select(
              "internal_code,name,brand,shade_or_variant,quantity_on_hand,average_unit_cost,fifo_unit_cost,latest_unit_cost,inventory_cost,projected_gross_profit,nearest_expiry",
            )
            .gt("quantity_on_hand", 0)
            .order("name");
          rows = data ?? [];
          columns = [
            { header: "Code", value: (r) => r.internal_code as string },
            { header: "Name", value: (r) => r.name as string },
            { header: "Brand", value: (r) => (r.brand as string) ?? "" },
            { header: "Shade", value: (r) => (r.shade_or_variant as string) ?? "" },
            { header: "On hand", value: (r) => r.quantity_on_hand as number },
            { header: "Avg cost", value: (r) => csvMoney(r.average_unit_cost as number) },
            { header: "FIFO cost", value: (r) => csvMoney(r.fifo_unit_cost as number) },
            { header: "Latest cost", value: (r) => csvMoney(r.latest_unit_cost as number) },
            { header: "Inventory value", value: (r) => csvMoney(r.inventory_cost as number) },
            { header: "Projected profit", value: (r) => csvMoney(r.projected_gross_profit as number) },
            { header: "Nearest expiry", value: (r) => (r.nearest_expiry as string) ?? "" },
          ];
          break;
        }
        case "purchase_batches": {
          const { data } = await supabase
            .from("purchase_batches")
            .select(
              "reference_number,purchase_date,quantity_purchased,quantity_remaining,unit_cost,lot_number,expiry_date,products(name,internal_code)",
            )
            .gte("purchase_date", from)
            .lte("purchase_date", to)
            .order("purchase_date", { ascending: false });
          rows = (data ?? []) as unknown as Record<string, unknown>[];
          columns = [
            { header: "Reference", value: (r) => (r.reference_number as string) ?? "" },
            { header: "Date", value: (r) => r.purchase_date as string },
            { header: "Product", value: (r) => (r.products as { name?: string } | null)?.name ?? "" },
            { header: "Code", value: (r) => (r.products as { internal_code?: string } | null)?.internal_code ?? "" },
            { header: "Qty purchased", value: (r) => r.quantity_purchased as number },
            { header: "Qty remaining", value: (r) => r.quantity_remaining as number },
            { header: "Unit cost", value: (r) => csvMoney(r.unit_cost as number) },
            { header: "Lot", value: (r) => (r.lot_number as string) ?? "" },
            { header: "Expiry", value: (r) => (r.expiry_date as string) ?? "" },
          ];
          break;
        }
        case "sales": {
          const { data } = await supabase
            .from("sales")
            .select(
              "invoice_number,sale_date,status,subtotal,discount,return_amount,total,total_cost,gross_profit,payment_method",
            )
            .gte("sale_date", `${from}T00:00:00`)
            .lte("sale_date", `${to}T23:59:59`)
            .order("sale_date", { ascending: false });
          rows = data ?? [];
          columns = [
            { header: "Invoice", value: (r) => r.invoice_number as string },
            { header: "Date", value: (r) => new Date(r.sale_date as string).toISOString() },
            { header: "Status", value: (r) => r.status as string },
            { header: "Subtotal", value: (r) => csvMoney(r.subtotal as number) },
            { header: "Discount", value: (r) => csvMoney(r.discount as number) },
            { header: "Returns", value: (r) => csvMoney(r.return_amount as number) },
            { header: "Net total", value: (r) => csvMoney(r.total as number) },
            { header: "Cost", value: (r) => csvMoney(r.total_cost as number) },
            { header: "Gross profit", value: (r) => csvMoney(r.gross_profit as number) },
            {
              header: "Payment",
              value: (r) => PAYMENT_METHOD_LABELS[r.payment_method as PaymentMethod],
            },
          ];
          break;
        }
        case "sale_items": {
          const { data } = await supabase
            .from("sale_item_financials")
            .select(
              "sale_id,quantity,quantity_returned,unit_cost_snapshot,unit_selling_price,net_revenue,net_cost,net_profit,products(name,internal_code)",
            );
          rows = (data ?? []) as unknown as Record<string, unknown>[];
          columns = [
            { header: "Product", value: (r) => (r.products as { name?: string } | null)?.name ?? "" },
            { header: "Code", value: (r) => (r.products as { internal_code?: string } | null)?.internal_code ?? "" },
            { header: "Qty", value: (r) => r.quantity as number },
            { header: "Returned", value: (r) => r.quantity_returned as number },
            { header: "Unit cost", value: (r) => csvMoney(r.unit_cost_snapshot as number) },
            { header: "Unit price", value: (r) => csvMoney(r.unit_selling_price as number) },
            { header: "Net revenue", value: (r) => csvMoney(r.net_revenue as number) },
            { header: "Net cost", value: (r) => csvMoney(r.net_cost as number) },
            { header: "Net profit", value: (r) => csvMoney(r.net_profit as number) },
          ];
          break;
        }
        case "expenses": {
          const { data } = await supabase
            .from("expenses")
            .select("expense_date,title,amount,payment_method,reference_number,expense_categories(name)")
            .gte("expense_date", from)
            .lte("expense_date", to)
            .order("expense_date", { ascending: false });
          rows = (data ?? []) as unknown as Record<string, unknown>[];
          columns = [
            { header: "Date", value: (r) => r.expense_date as string },
            { header: "Title", value: (r) => r.title as string },
            { header: "Category", value: (r) => (r.expense_categories as { name?: string } | null)?.name ?? "" },
            { header: "Amount", value: (r) => csvMoney(r.amount as number) },
            {
              header: "Payment",
              value: (r) => PAYMENT_METHOD_LABELS[r.payment_method as PaymentMethod],
            },
            { header: "Reference", value: (r) => (r.reference_number as string) ?? "" },
          ];
          break;
        }
        case "daily": {
          const { data } = await supabase.rpc("report_daily_series", args);
          rows = (data ?? []) as Record<string, unknown>[];
          columns = dailyColumns();
          break;
        }
        case "monthly": {
          const { data } = await supabase.rpc("report_monthly_series", { p_from: null, p_to: null });
          rows = (data ?? []) as Record<string, unknown>[];
          columns = periodColumns("month");
          break;
        }
        case "yearly": {
          const { data } = await supabase.rpc("report_yearly_series");
          rows = (data ?? []) as Record<string, unknown>[];
          columns = periodColumns("year");
          break;
        }
      }

      if (rows.length === 0) {
        toast.info("No data to export for this selection.");
        return;
      }
      downloadCsv(csvFilename(kind.replace(/_/g, "-"), suffix), toCsv(rows, columns));
      toast.success(`Exported ${rows.length} rows`);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card interactive className="transition-shadow">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[--radius-sm] bg-primary-soft text-primary">
          <Icon className="size-5" strokeWidth={1.75} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-ink-strong">{title}</p>
          <p className="text-xs text-muted">{description}</p>
        </div>
        <Button variant="outline" size="sm" onClick={run} disabled={busy}>
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
          CSV
        </Button>
      </CardContent>
    </Card>
  );
}

function dailyColumns(): CsvColumn<Record<string, unknown>>[] {
  return [
    { header: "Date", value: (r) => r.day as string },
    { header: "Gross sales", value: (r) => csvMoney(r.gross_sales as number) },
    { header: "Discounts", value: (r) => csvMoney(r.discounts as number) },
    { header: "Returns", value: (r) => csvMoney(r.returns_amount as number) },
    { header: "Net sales", value: (r) => csvMoney(r.net_sales as number) },
    { header: "COGS", value: (r) => csvMoney(r.cost_of_goods_sold as number) },
    { header: "Gross profit", value: (r) => csvMoney(r.realized_gross_profit as number) },
    { header: "Expenses", value: (r) => csvMoney(r.operating_expenses as number) },
    { header: "Net profit", value: (r) => csvMoney(r.net_profit as number) },
    { header: "Orders", value: (r) => r.order_count as number },
    { header: "Units", value: (r) => r.units_sold as number },
  ];
}

function periodColumns(key: "month" | "year"): CsvColumn<Record<string, unknown>>[] {
  return [
    { header: key === "month" ? "Month" : "Year", value: (r) => String(r[key]) },
    { header: "Net sales", value: (r) => csvMoney(r.net_sales as number) },
    { header: "COGS", value: (r) => csvMoney(r.cost_of_goods_sold as number) },
    { header: "Gross profit", value: (r) => csvMoney(r.realized_gross_profit as number) },
    { header: "Expenses", value: (r) => csvMoney(r.operating_expenses as number) },
    { header: "Net profit", value: (r) => csvMoney(r.net_profit as number) },
    { header: "Orders", value: (r) => r.order_count as number },
    { header: "Units", value: (r) => r.units_sold as number },
  ];
}
