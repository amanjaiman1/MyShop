"use client";

import { Download } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { toCsv, downloadCsv, csvFilename, csvMoney } from "@/lib/csv";
import type { DailySeriesRow, ReportPeriodKey } from "@/lib/supabase/database.types";

/**
 * CSV export menu for the P&L page. The daily series is already loaded, so the
 * "Daily profit & loss" export is instant; other exports point the owner to the
 * dedicated Custom reports page where whole datasets can be pulled.
 */
export function ReportExports({
  period,
  start,
  end,
  daily,
}: {
  period: ReportPeriodKey;
  start: string | null;
  end: string | null;
  daily: DailySeriesRow[];
}) {
  const suffix = period === "custom" && start && end ? `${start}_${end}` : period;

  function exportDaily() {
    const rows = daily.map((d) => ({
      date: d.day,
      gross_sales: csvMoney(d.gross_sales),
      discounts: csvMoney(d.discounts),
      returns: csvMoney(d.returns_amount),
      net_sales: csvMoney(d.net_sales),
      cogs: csvMoney(d.cost_of_goods_sold),
      gross_profit: csvMoney(d.realized_gross_profit),
      expenses: csvMoney(d.operating_expenses),
      net_profit: csvMoney(d.net_profit),
      orders: d.order_count,
      units: d.units_sold,
    }));
    const csv = toCsv(rows, [
      { header: "Date", value: (r) => r.date },
      { header: "Gross sales", value: (r) => r.gross_sales },
      { header: "Discounts", value: (r) => r.discounts },
      { header: "Returns", value: (r) => r.returns },
      { header: "Net sales", value: (r) => r.net_sales },
      { header: "Cost of goods sold", value: (r) => r.cogs },
      { header: "Gross profit", value: (r) => r.gross_profit },
      { header: "Expenses", value: (r) => r.expenses },
      { header: "Net profit", value: (r) => r.net_profit },
      { header: "Orders", value: (r) => r.orders },
      { header: "Units", value: (r) => r.units },
    ]);
    downloadCsv(csvFilename("daily-pl", suffix), csv);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Download aria-hidden />
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuLabel>Download CSV</DropdownMenuLabel>
        <DropdownMenuItem onSelect={exportDaily} disabled={daily.length === 0}>
          Daily profit &amp; loss
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <a href="/reports/custom">More exports…</a>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
