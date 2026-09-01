import { Card, CardContent } from "@/components/ui/card";
import { LedgerRow } from "@/components/common/stat-card";
import { Money } from "@/components/common/money";
import { NetStatusBadge } from "@/components/common/status-badge";
import { formatPercent } from "@/lib/format";
import type { PlSummaryRow } from "@/lib/supabase/database.types";

/**
 * The profit & loss statement, laid out as the classic waterfall:
 *
 *   Gross sales − discounts − returns = Net sales
 *   Net sales − COGS               = Realized gross profit
 *   Gross profit − expenses        = Net profit
 *
 * Server component — pure presentation of a report_pl_summary row.
 */
export function PlStatement({ pl }: { pl: PlSummaryRow }) {
  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="eyebrow">Profit &amp; loss</p>
            <p className="text-sm text-muted">{pl.period_label}</p>
          </div>
          <NetStatusBadge netProfit={pl.net_profit} size="lg" />
        </div>

        <div className="-my-2">
          <LedgerRow label="Gross sales" value={<Money value={pl.gross_sales} />} />
          <LedgerRow
            label="Discounts"
            value={<Money value={pl.discounts === 0 ? 0 : -pl.discounts} tone={pl.discounts > 0} />}
            tone={pl.discounts > 0 ? "loss" : undefined}
          />
          <LedgerRow
            label="Returns"
            value={<Money value={pl.returns_amount === 0 ? 0 : -pl.returns_amount} tone={pl.returns_amount > 0} />}
            tone={pl.returns_amount > 0 ? "loss" : undefined}
          />
          <LedgerRow label="Net sales" value={<Money value={pl.net_sales} />} emphasis />

          <LedgerRow
            label="Cost of goods sold"
            value={<Money value={pl.cost_of_goods_sold === 0 ? 0 : -pl.cost_of_goods_sold} />}
            hint="FIFO cost of what actually sold"
          />
          <LedgerRow
            label="Realized gross profit"
            value={<Money value={pl.realized_gross_profit} tone showSign />}
            hint={`${formatPercent(pl.gross_margin_pct)} gross margin`}
            emphasis
            tone={pl.realized_gross_profit > 0 ? "profit" : pl.realized_gross_profit < 0 ? "loss" : "muted"}
          />

          <LedgerRow
            label="Operating expenses"
            value={<Money value={pl.operating_expenses === 0 ? 0 : -pl.operating_expenses} />}
          />
          <LedgerRow
            label="Net profit"
            value={<Money value={pl.net_profit} tone showSign />}
            hint={`${formatPercent(pl.net_margin_pct)} net margin`}
            emphasis
            tone={pl.net_profit > 0 ? "profit" : pl.net_profit < 0 ? "loss" : "muted"}
          />
        </div>
      </CardContent>
    </Card>
  );
}
