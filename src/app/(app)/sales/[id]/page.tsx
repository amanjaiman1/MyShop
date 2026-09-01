import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, Receipt, ScanLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/common/page-header";
import { Money, Figure } from "@/components/common/money";
import { LedgerRow } from "@/components/common/stat-card";
import { ProductThumb } from "@/components/common/product-thumb";
import {
  NetStatusBadge,
  PriceStatusBadge,
  SaleStatusBadge,
} from "@/components/common/status-badge";
import { SaleActions } from "@/components/sale/sale-actions";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/supabase/queries";
import { formatDateTime, formatPercent } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/constants";
import { resolvePriceStatus } from "@/lib/pricing";
import { marginPct } from "@/lib/money";
import type { SaleRow } from "@/lib/supabase/database.types";

export const metadata: Metadata = { title: "Sale detail" };
export const dynamic = "force-dynamic";

interface ItemRow {
  id: string;
  quantity: number;
  quantity_returned: number;
  unit_cost_snapshot: number;
  unit_selling_price: number;
  line_total: number;
  line_profit: number;
  product_id: string;
  products: {
    name: string;
    brand: string | null;
    shade_or_variant: string | null;
    image_url: string | null;
    internal_code: string;
  } | null;
}

export default async function SaleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { id } = await params;
  const { new: isNew } = await searchParams;
  const supabase = await createClient();
  const profile = await getProfile();

  const { data: saleRaw } = await supabase
    .from("sales")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!saleRaw) notFound();
  const sale = saleRaw as SaleRow;

  const { data: itemsRaw } = await supabase
    .from("sale_items")
    .select(
      "id, quantity, quantity_returned, unit_cost_snapshot, unit_selling_price, line_total, line_profit, product_id, products(name, brand, shade_or_variant, image_url, internal_code)",
    )
    .eq("sale_id", id)
    .order("created_at", { ascending: true });
  const items = (itemsRaw ?? []) as unknown as ItemRow[];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Sale"
        title={sale.invoice_number}
        description={formatDateTime(sale.sale_date, profile.timezone)}
        backHref="/sales"
        backLabel="Sales"
        actions={
          <SaleActions
            saleId={sale.id}
            status={sale.status}
            items={items.map((i) => ({
              id: i.id,
              productName: i.products?.name ?? "Product",
              quantity: i.quantity,
              quantityReturned: i.quantity_returned,
              unitSellingPrice: i.unit_selling_price,
            }))}
          />
        }
      />

      {isNew ? (
        <div className="flex items-center gap-3 rounded-[--radius-lg] border border-profit-border bg-profit-soft px-4 py-4">
          <CheckCircle2 className="size-6 shrink-0 text-profit" aria-hidden />
          <div className="flex-1">
            <p className="font-medium text-profit">Sale completed</p>
            <p className="text-sm text-profit-strong/80">
              Inventory has been updated and the profit recorded.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/sell">
              <ScanLine aria-hidden />
              Next sale
            </Link>
          </Button>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SaleStatusBadge status={sale.status} />
        {sale.status !== "voided" ? <NetStatusBadge netProfit={sale.gross_profit} /> : null}
        <span className="text-sm text-muted">
          {PAYMENT_METHOD_LABELS[sale.payment_method]}
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* Items */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Items</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {items.map((item) => {
              const status = resolvePriceStatus(
                item.unit_selling_price,
                item.unit_cost_snapshot,
                Number(profile.low_margin_threshold),
              );
              const retained = item.quantity - item.quantity_returned;
              return (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-[--radius-lg] border border-line bg-surface p-3"
                >
                  <ProductThumb
                    src={item.products?.image_url ?? null}
                    name={item.products?.name ?? "Product"}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/products/${item.product_id}`}
                      className="truncate text-sm font-semibold text-ink-strong hover:text-primary"
                    >
                      {item.products?.name ?? "Product"}
                    </Link>
                    <p className="truncate text-xs text-muted">
                      {item.quantity} × <Money value={item.unit_selling_price} size="sm" className="text-muted" />
                      {" · cost "}
                      <Money value={item.unit_cost_snapshot} size="sm" className="text-muted" />
                    </p>
                    <div className="mt-1 flex items-center gap-1.5">
                      <PriceStatusBadge status={status} size="sm" />
                      {item.quantity_returned > 0 ? (
                        <span className="text-[0.6875rem] text-lowprofit">
                          {item.quantity_returned} returned · {retained} kept
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right">
                    <Money value={item.line_total} size="default" className="block font-semibold" />
                    <Money value={item.line_profit} size="sm" tone showSign className="block" />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* P&L breakdown */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-4 text-muted" aria-hidden />
              Sale summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="-my-2">
              <LedgerRow label="Gross sales" value={<Money value={sale.subtotal} />} />
              {sale.discount > 0 ? (
                <LedgerRow label="Discounts" value={<Money value={-sale.discount} tone />} />
              ) : null}
              {sale.return_amount > 0 ? (
                <LedgerRow label="Returns" value={<Money value={-sale.return_amount} tone />} />
              ) : null}
              <LedgerRow label="Net sales" value={<Money value={sale.total} />} emphasis />
              <LedgerRow label="Cost of goods sold" value={<Money value={-sale.total_cost} />} />
              <LedgerRow
                label="Gross profit"
                value={<Money value={sale.gross_profit} tone showSign />}
                emphasis
                tone={sale.gross_profit > 0 ? "profit" : sale.gross_profit < 0 ? "loss" : "muted"}
              />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4">
              <Figure label="Margin">
                <span className="tnum">{formatPercent(marginPct(sale.gross_profit, sale.total))}</span>
              </Figure>
              <Figure label="Payment">{PAYMENT_METHOD_LABELS[sale.payment_method]}</Figure>
            </div>

            {sale.notes ? (
              <div className="mt-4 rounded-[--radius-sm] bg-surface-sunken p-3">
                <p className="text-xs whitespace-pre-line text-muted">{sale.notes}</p>
              </div>
            ) : null}

            {sale.status === "voided" ? (
              <p className="mt-4 rounded-[--radius-sm] border border-loss-border bg-loss-soft px-3 py-2 text-xs text-loss">
                This sale is voided. It does not count towards any report, and its stock has been
                returned to inventory. The record is kept for your audit trail.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
